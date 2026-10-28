"""
Shift City one-click setup (run inside the Unreal Editor: Tools > Execute Python Script).

1. Imports the textures in unreal/SourceArt (Poly Haven CC0 scans + generated building facades)
2. Builds PBR materials for roads, sidewalks, kerbs, roofs, facades and shopfronts
3. Downloads Poly Haven street lamps and street trees (CC0), imports them with Nanite
4. Creates the level /Game/ShiftCity/Maps/L_ShiftCity with realistic sky, sun, clouds and fog
5. Places the Shift City generator (the whole city + 10 pickup points) and a player start
6. Points the level at the Vehicle template's game mode with the Shift City HUD

Safe to run again: it rebuilds everything in /Game/ShiftCity.
"""
import os
import json
import urllib.request
import unreal

IMPORT_TREES = True       # ~100 MB download; set False for a quicker first run
GOLDEN_HOUR = False       # True = low golden-hour sun (moodier, darker streets)
# Set by the build robot (.github/workflows/unreal-build.yml): no dialogs, quit the editor when done.
CI = os.environ.get("SHIFTCITY_CI") == "1"

PROJECT = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
SRC = os.path.join(PROJECT, "SourceArt")
CACHE = os.path.join(PROJECT, "Saved", "PolyHaven")
ROOT = "/Game/ShiftCity"
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary


def log(msg):
    unreal.log("[ShiftCity] " + msg)


def setp(obj, name, value):
    """Sets an editor property, logging (not stopping) if this engine version names it differently."""
    try:
        obj.set_editor_property(name, value)
        return True
    except Exception as e:
        unreal.log_warning("[ShiftCity] could not set %s on %s: %s" % (name, obj.get_name(), e))
        return False


# ------------------------------------------------------------------ textures
def import_file(path, dest, name=None):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = dest
    if name:
        task.destination_name = name
    task.replace_existing = True
    task.automated = True
    task.save = True
    TOOLS.import_asset_tasks([task])
    return list(task.imported_object_paths or [])


def import_texture(file, kind="color"):
    """kind: color | normal | mask"""
    name = os.path.splitext(os.path.basename(file))[0].replace(".", "_")
    dest = ROOT + "/Textures"
    import_file(file, dest, name)
    tex = unreal.load_asset(dest + "/" + name)
    if tex is None:
        log("could not import " + file)
        return None
    if kind == "normal":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property("srgb", False)
    elif kind == "mask":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
        tex.set_editor_property("srgb", False)
    EAL.save_loaded_asset(tex)
    return tex


# ------------------------------------------------------------------ materials
def new_material(name):
    path = ROOT + "/Materials"
    full = path + "/" + name
    if EAL.does_asset_exist(full):
        EAL.delete_asset(full)
    return TOOLS.create_asset(name, path, unreal.Material, unreal.MaterialFactoryNew())


def tex_node(mat, tex, sampler, x, y, uv=None):
    n = MEL.create_material_expression(mat, unreal.MaterialExpressionTextureSample, x, y)
    n.set_editor_property("texture", tex)
    n.set_editor_property("sampler_type", sampler)
    if uv is not None:
        MEL.connect_material_expressions(uv, "", n, "UVs")
    return n


def const(mat, value, x, y):
    n = MEL.create_material_expression(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", value)
    return n


def color(mat, rgb, x, y):
    n = MEL.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, x, y)
    n.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    return n


def make_material(name, base=None, tint=None, normal=None, rough=None, metal=None, emissive=None,
                  rough_value=None, metal_value=None, emissive_v_tiling=1.0, normal_tiling=None,
                  vertex_tint=False, glow=0.0):
    mat = new_material(name)
    mat.set_editor_property("two_sided", True)
    S = unreal.MaterialSamplerType
    P = unreal.MaterialProperty
    # base colour (optionally tinted by a constant and/or the per-building vertex colour)
    base_out = None
    if base is not None:
        b = tex_node(mat, base, S.SAMPLERTYPE_COLOR, -900, -300)
        base_out = (b, "RGB")
        if tint is not None:
            m = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -600, -300)
            MEL.connect_material_expressions(b, "RGB", m, "A")
            MEL.connect_material_expressions(color(mat, tint, -800, -150), "", m, "B")
            base_out = (m, "")
    elif tint is not None:
        base_out = (color(mat, tint, -600, -300), "")
    if base_out is not None and vertex_tint:
        vc = MEL.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -600, -100)
        m2 = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, -300)
        MEL.connect_material_expressions(base_out[0], base_out[1], m2, "A")
        MEL.connect_material_expressions(vc, "", m2, "B")
        base_out = (m2, "")
    if base_out is not None:
        MEL.connect_material_property(base_out[0], base_out[1], P.MP_BASE_COLOR)
    # normal (optionally at a finer tiling than the albedo)
    if normal is not None:
        uv = None
        if normal_tiling:
            uv = MEL.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1000, 0)
            uv.set_editor_property("u_tiling", normal_tiling)
            uv.set_editor_property("v_tiling", normal_tiling)
        MEL.connect_material_property(tex_node(mat, normal, S.SAMPLERTYPE_NORMAL, -700, 0, uv), "RGB", P.MP_NORMAL)
    # roughness / metallic
    if rough is not None:
        MEL.connect_material_property(tex_node(mat, rough, S.SAMPLERTYPE_MASKS, -700, 250), "R", P.MP_ROUGHNESS)
    elif rough_value is not None:
        MEL.connect_material_property(const(mat, rough_value, -400, 250), "", P.MP_ROUGHNESS)
    if metal is not None:
        MEL.connect_material_property(tex_node(mat, metal, S.SAMPLERTYPE_MASKS, -700, 500), "R", P.MP_METALLIC)
    elif metal_value is not None:
        MEL.connect_material_property(const(mat, metal_value, -400, 500), "", P.MP_METALLIC)
    # emissive (lit windows) scaled by a parameter so night lighting can turn it up
    if emissive is not None:
        uv = None
        if emissive_v_tiling != 1.0:
            uv = MEL.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1000, 750)
            uv.set_editor_property("v_tiling", emissive_v_tiling)
        e = tex_node(mat, emissive, S.SAMPLERTYPE_COLOR, -700, 750, uv)
        p = MEL.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -700, 1000)
        p.set_editor_property("parameter_name", "WindowGlow")
        p.set_editor_property("default_value", glow)
        m = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, 800)
        MEL.connect_material_expressions(e, "RGB", m, "A")
        MEL.connect_material_expressions(p, "", m, "B")
        MEL.connect_material_property(m, "", P.MP_EMISSIVE_COLOR)
    MEL.recompile_material(mat)
    EAL.save_loaded_asset(mat)
    return mat


# Real scanned wall surface for each facade style (Poly Haven, CC0), blended with the window pattern
STYLE_WALLS = ["concrete_wall_007", "brick_wall_02", "concrete_wall_008", "clay_plaster", "concrete_wall_006",
               "concrete_brick_wall_001", "concrete_wall_005", "castle_brick_02_white", "dark_brick_wall",
               "concrete_wall_008", "clay_plaster", "concrete_wall_004"]
_wall_cache = {}


def polyhaven_texture(asset_id):
    """Downloads a Poly Haven texture set (1k) and returns (colour, normal, roughness) textures."""
    if asset_id in _wall_cache:
        return _wall_cache[asset_id]
    try:
        req = urllib.request.Request("https://api.polyhaven.com/files/" + asset_id, headers={"User-Agent": "ShiftCitySetup/1.0"})
        files = json.loads(urllib.request.urlopen(req, timeout=60).read())
        out = []
        for key, kind in (("Diffuse", "color"), ("nor_gl", "normal"), ("Rough", "mask")):
            url = files[key]["1k"]["jpg"]["url"]
            local = os.path.join(CACHE, "textures", os.path.basename(url))
            fetch(url, local)
            out.append(import_texture(local, kind))
        _wall_cache[asset_id] = tuple(out)
    except Exception as e:
        unreal.log_warning("[ShiftCity] wall texture %s unavailable: %s" % (asset_id, e))
        _wall_cache[asset_id] = (None, None, None)
    return _wall_cache[asset_id]


def make_facade_material(name, pattern, rough, metal, emissive, wall):
    """Facade = scanned wall (tinted per building by vertex colour) with the window pattern on top.
    The metallic map doubles as the window mask (windows are metallic, walls aren't)."""
    wall_d, wall_n, wall_r = wall
    mat = new_material(name)
    mat.set_editor_property("two_sided", True)
    S = unreal.MaterialSamplerType
    P = unreal.MaterialProperty
    E_ = unreal.MaterialExpressionMultiply
    uv3 = MEL.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1400, -200)
    uv3.set_editor_property("u_tiling", 3.0)
    uv3.set_editor_property("v_tiling", 3.0)
    pat = tex_node(mat, pattern, S.SAMPLERTYPE_COLOR, -1000, -500)
    mask_src = tex_node(mat, metal, S.SAMPLERTYPE_MASKS, -1000, 100)
    mask = MEL.create_material_expression(mat, unreal.MaterialExpressionSaturate, -500, 150)
    boost = MEL.create_material_expression(mat, E_, -700, 150)
    MEL.connect_material_expressions(mask_src, "R", boost, "A")
    MEL.connect_material_expressions(const(mat, 1.3, -900, 250), "", boost, "B")
    MEL.connect_material_expressions(boost, "", mask, "")
    vc = MEL.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -1000, -100)
    if wall_d is not None:
        wd = tex_node(mat, wall_d, S.SAMPLERTYPE_COLOR, -1000, -300, uv3)
        tinted = MEL.create_material_expression(mat, E_, -700, -300)
        MEL.connect_material_expressions(wd, "RGB", tinted, "A")
        MEL.connect_material_expressions(vc, "", tinted, "B")
    else:
        tinted = MEL.create_material_expression(mat, E_, -700, -300)
        MEL.connect_material_expressions(pat, "RGB", tinted, "A")
        MEL.connect_material_expressions(vc, "", tinted, "B")
    base = MEL.create_material_expression(mat, unreal.MaterialExpressionLinearInterpolate, -300, -400)
    MEL.connect_material_expressions(tinted, "", base, "A")
    MEL.connect_material_expressions(pat, "RGB", base, "B")
    MEL.connect_material_expressions(mask, "", base, "Alpha")
    MEL.connect_material_property(base, "", P.MP_BASE_COLOR)
    if wall_n is not None:
        MEL.connect_material_property(tex_node(mat, wall_n, S.SAMPLERTYPE_NORMAL, -1000, 400, uv3), "RGB", P.MP_NORMAL)
    rp = tex_node(mat, rough, S.SAMPLERTYPE_MASKS, -1000, 650)
    if wall_r is not None:
        wr = tex_node(mat, wall_r, S.SAMPLERTYPE_MASKS, -1000, 900, uv3)
        rl = MEL.create_material_expression(mat, unreal.MaterialExpressionLinearInterpolate, -300, 700)
        MEL.connect_material_expressions(wr, "R", rl, "A")
        MEL.connect_material_expressions(rp, "R", rl, "B")
        MEL.connect_material_expressions(mask, "", rl, "Alpha")
        MEL.connect_material_property(rl, "", P.MP_ROUGHNESS)
    else:
        MEL.connect_material_property(rp, "R", P.MP_ROUGHNESS)
    MEL.connect_material_property(mask_src, "R", P.MP_METALLIC)
    # night window glow (off by default; night lighting will raise WindowGlow)
    euv = MEL.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1400, 1150)
    euv.set_editor_property("v_tiling", 0.25)
    e = tex_node(mat, emissive, S.SAMPLERTYPE_COLOR, -1000, 1150, euv)
    gp = MEL.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -1000, 1400)
    gp.set_editor_property("parameter_name", "WindowGlow")
    gp.set_editor_property("default_value", 0.0)
    em = MEL.create_material_expression(mat, E_, -300, 1200)
    MEL.connect_material_expressions(e, "RGB", em, "A")
    MEL.connect_material_expressions(gp, "", em, "B")
    MEL.connect_material_property(em, "", P.MP_EMISSIVE_COLOR)
    MEL.recompile_material(mat)
    EAL.save_loaded_asset(mat)
    return mat


def build_materials():
    t = lambda f: os.path.join(SRC, "textures", f)
    f = lambda n: os.path.join(SRC, "facades", n)
    asphalt = make_material("M_Asphalt", import_texture(t("asphalt_02_diff.jpg")), (0.75, 0.75, 0.78),
                            import_texture(t("asphalt_02_nor_gl.jpg"), "normal"), import_texture(t("asphalt_02_rough.jpg"), "mask"))
    walk = make_material("M_Sidewalk", import_texture(t("concrete_pavers_02_diff.jpg")), None,
                         import_texture(t("concrete_pavers_02_nor_gl.jpg"), "normal"), import_texture(t("concrete_pavers_02_rough.jpg"), "mask"))
    wall_d = import_texture(t("concrete_wall_008_diff.jpg"))
    wall_n = import_texture(t("concrete_wall_008_nor_gl.jpg"), "normal")
    wall_r = import_texture(t("concrete_wall_008_rough.jpg"), "mask")
    brick_n = import_texture(t("brick_wall_02_nor_gl.jpg"), "normal")
    kerb = make_material("M_Kerb", wall_d, (0.85, 0.85, 0.85), wall_n, wall_r)
    roof = make_material("M_Roof", wall_d, (0.6, 0.6, 0.62), wall_n, wall_r)
    white = make_material("M_PaintWhite", tint=(0.85, 0.85, 0.82), rough_value=0.55)
    yellow = make_material("M_PaintYellow", tint=(0.85, 0.6, 0.08), rough_value=0.55)
    grass = make_material("M_Grass", tint=(0.09, 0.16, 0.05), rough_value=0.95)
    facades = []
    i = 0
    while os.path.exists(f("T_Facade%d_D.png" % i)):
        wall = polyhaven_texture(STYLE_WALLS[i % len(STYLE_WALLS)])
        facades.append(make_facade_material(
            "M_Facade%d" % i, import_texture(f("T_Facade%d_D.png" % i)), import_texture(f("T_Facade%d_R.png" % i), "mask"),
            import_texture(f("T_Facade%d_M.png" % i), "mask"), import_texture(f("T_Facade%d_E.png" % i)), wall))
        i += 1
    shops = []
    for i in range(6):
        shops.append(make_material(
            "M_Shop%d" % i, import_texture(f("T_Shop%d_D.png" % i)), None, None,
            import_texture(f("T_Shop%d_R.png" % i), "mask"), import_texture(f("T_Shop%d_M.png" % i), "mask"),
            import_texture(f("T_Shop%d_E.png" % i)), glow=0.0))
    return dict(asphalt=asphalt, sidewalk=walk, kerb=kerb, roof=roof, paint_white=white, paint_yellow=yellow,
                grass=grass, facades=facades, shopfronts=shops)


# ------------------------------------------------------------------ Poly Haven models
def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "ShiftCitySetup/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as out:
        out.write(r.read())


def fix_foliage(asset_id, files, meshes):
    """Poly Haven's glTF leaves use a JPG (no alpha) with 'blend' transparency, which Nanite can't draw.
    Build a masked, two-sided leaf material from the separate alpha map and put it on the leaf slots."""
    if "leaves_alpha" not in files:
        return
    try:
        base = os.path.join(CACHE, asset_id, "foliage")
        alpha_p = os.path.join(base, asset_id + "_leaves_alpha_1k.png")
        diff_p = os.path.join(base, asset_id + "_leaves_diff_1k.jpg")
        nor_p = os.path.join(base, asset_id + "_leaves_nor_gl_1k.jpg")
        fetch(files["leaves_alpha"]["1k"]["png"]["url"], alpha_p)
        fetch(files["leaves_diff"]["1k"]["jpg"]["url"], diff_p)
        fetch(files["leaves_nor_gl"]["1k"]["jpg"]["url"], nor_p)
        alpha = import_texture(alpha_p, "mask")
        mat = new_material("M_%s_Leaves" % asset_id)
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        mat.set_editor_property("two_sided", True)
        mat.set_editor_property("opacity_mask_clip_value", 0.4)
        S = unreal.MaterialSamplerType
        P = unreal.MaterialProperty
        MEL.connect_material_property(tex_node(mat, import_texture(diff_p), S.SAMPLERTYPE_COLOR, -700, -300), "RGB", P.MP_BASE_COLOR)
        MEL.connect_material_property(tex_node(mat, import_texture(nor_p, "normal"), S.SAMPLERTYPE_NORMAL, -700, 0), "RGB", P.MP_NORMAL)
        MEL.connect_material_property(tex_node(mat, alpha, S.SAMPLERTYPE_MASKS, -700, 300), "R", P.MP_OPACITY_MASK)
        MEL.connect_material_property(const(mat, 0.6, -400, 500), "", P.MP_ROUGHNESS)
        MEL.recompile_material(mat)
        EAL.save_loaded_asset(mat)
        for mesh in meshes:
            slots = mesh.get_editor_property("static_materials")
            for idx, slot in enumerate(slots):
                mi = slot.get_editor_property("material_interface")
                slot_name = str(slot.get_editor_property("material_slot_name"))
                if "leav" in slot_name.lower() or (mi and "leav" in mi.get_name().lower()):
                    mesh.set_material(idx, mat)
                    log("leaf material applied to %s slot %d" % (mesh.get_name(), idx))
            EAL.save_loaded_asset(mesh)
    except Exception as e:
        unreal.log_warning("[ShiftCity] leaf fix failed for %s: %s" % (asset_id, e))


def polyhaven_mesh(asset_id):
    """Downloads a Poly Haven model (1k textures), imports it and returns all its static meshes (Nanite on)."""
    try:
        req = urllib.request.Request("https://api.polyhaven.com/files/" + asset_id, headers={"User-Agent": "ShiftCitySetup/1.0"})
        files = json.loads(urllib.request.urlopen(req, timeout=60).read())
        g = files["gltf"]["1k"]["gltf"]
        base = os.path.join(CACHE, asset_id)
        fetch(g["url"], os.path.join(base, asset_id + ".gltf"))
        for rel, info in g["include"].items():
            fetch(info["url"], os.path.join(base, rel))
        dest = ROOT + "/Props/" + asset_id
        import_file(os.path.join(base, asset_id + ".gltf"), dest)
        meshes = [unreal.load_asset(p) for p in EAL.list_assets(dest, recursive=True)]
        meshes = [m for m in meshes if isinstance(m, unreal.StaticMesh)]
        if not meshes:
            log("no static mesh found for " + asset_id)
            return []
        for mesh in meshes:
            try:
                ns = mesh.get_editor_property("nanite_settings")
                ns.set_editor_property("enabled", True)
                if "tree" in asset_id:
                    # keeps leaf cards from thinning out when Nanite simplifies distant trees
                    try:
                        ns.set_editor_property("preserve_area", True)
                    except Exception:
                        pass
                unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem).set_nanite_settings(mesh, ns, True)
            except Exception as e:  # Nanite is an optimisation, not required
                log("Nanite not enabled for %s (%s)" % (asset_id, e))
            EAL.save_loaded_asset(mesh)
        fix_foliage(asset_id, files, meshes)
        log("imported %s (%d mesh parts)" % (asset_id, len(meshes)))
        return meshes
    except Exception as e:
        log("skipped %s: %s" % (asset_id, e))
        return []


# ------------------------------------------------------------------ level
def find_class(asset_name):
    for path in EAL.list_assets("/Game", recursive=True):
        if path.split("/")[-1].split(".")[0] == asset_name:
            return EAL.load_blueprint_class(path.split(".")[0])
    return None


def make_signal_materials():
    lamp = new_material("M_SignalLamp")
    P = unreal.MaterialProperty
    col = MEL.create_material_expression(lamp, unreal.MaterialExpressionVectorParameter, -700, 0)
    col.set_editor_property("parameter_name", "Color")
    col.set_editor_property("default_value", unreal.LinearColor(1, 0.1, 0.05, 1))
    glow = MEL.create_material_expression(lamp, unreal.MaterialExpressionScalarParameter, -700, 250)
    glow.set_editor_property("parameter_name", "Glow")
    glow.set_editor_property("default_value", 1.0)
    m = MEL.create_material_expression(lamp, unreal.MaterialExpressionMultiply, -300, 100)
    MEL.connect_material_expressions(col, "", m, "A")
    MEL.connect_material_expressions(glow, "", m, "B")
    MEL.connect_material_property(m, "", P.MP_EMISSIVE_COLOR)
    MEL.connect_material_property(color(lamp, (0.02, 0.02, 0.02), -300, -150), "", P.MP_BASE_COLOR)
    MEL.recompile_material(lamp)
    EAL.save_loaded_asset(lamp)
    pole = make_material("M_SignalPole", tint=(0.04, 0.045, 0.05), rough_value=0.45, metal_value=0.8)
    return lamp, pole


def find_car_meshes():
    """Skeletal car bodies from the Vehicle template, reused as traffic."""
    cars = []
    for path in EAL.list_assets("/Game", recursive=True):
        if "/Vehicles/" not in path and "Vehicle" not in path:
            continue
        data = EAL.find_asset_data(path)
        if str(data.asset_class_path.asset_name) == "SkeletalMesh":
            mesh = unreal.load_asset(path)
            if mesh:
                cars.append(mesh)
    log("traffic will use %d car model(s)" % len(cars))
    return cars


def setup_level(mats, lamp, tree):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    level = ROOT + "/Maps/L_ShiftCity"
    if EAL.does_asset_exist(level):
        les.load_level(level)
        eas.destroy_actors([a for a in eas.get_all_level_actors() if not isinstance(a, unreal.WorldSettings)])
    else:
        les.new_level(level)

    pitch = -14.0 if GOLDEN_HOUR else -55.0
    sun = eas.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 2000), unreal.Rotator(0.0, pitch, 135.0))
    sc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    sc.set_mobility(unreal.ComponentMobility.MOVABLE)
    setp(sc, "atmosphere_sun_light", True)
    setp(sc, "intensity", 10.0)
    setp(sc, "dynamic_shadow_distance_movable_light", 30000.0)
    eas.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
    sky = eas.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 1000))
    skc = sky.get_component_by_class(unreal.SkyLightComponent)
    skc.set_mobility(unreal.ComponentMobility.MOVABLE)
    setp(skc, "real_time_capture", True)
    fog = eas.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
    fc = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    setp(fc, "fog_density", 0.01)
    if not setp(fc, "enable_volumetric_fog", True):
        setp(fc, "volumetric_fog", True)
    try:
        eas.spawn_actor_from_class(unreal.VolumetricCloud, unreal.Vector(0, 0, 0))
    except Exception as e:
        unreal.log_warning("[ShiftCity] no volumetric clouds: %s" % e)
    pp = eas.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    setp(pp, "unbound", True)
    try:
        # brighten the street canyons: exposure bias up a stop, and stop auto-exposure going too dark
        st = pp.get_editor_property("settings")
        for k, v in (("override_auto_exposure_bias", True), ("auto_exposure_bias", 1.0),
                     ("override_auto_exposure_min_brightness", True), ("auto_exposure_min_brightness", 0.6)):
            try:
                st.set_editor_property(k, v)
            except Exception:
                pass
        pp.set_editor_property("settings", st)
    except Exception as e:
        unreal.log_warning("[ShiftCity] exposure not set: %s" % e)
    setp(skc, "intensity", 1.5)

    gen_class = unreal.load_class(None, "/Script/ShiftCityCore.SCCityGenerator")
    gen = eas.spawn_actor_from_class(gen_class, unreal.Vector(0, 0, 0))
    for key, value in mats.items():
        setp(gen, key, value)
    setp(gen, "lamp_meshes", lamp)
    setp(gen, "tree_meshes", tree)
    gen.generate()

    try:
        sig_lamp, sig_pole = make_signal_materials()
        traffic = eas.spawn_actor_from_class(unreal.load_class(None, "/Script/ShiftCityCore.SCTraffic"), unreal.Vector(0, 0, 0))
        setp(traffic, "car_meshes", find_car_meshes())
        setp(traffic, "lamp_material", sig_lamp)
        setp(traffic, "pole_material", sig_pole)
        if hasattr(traffic, "rerun_construction_scripts"):  # not exposed to Python in UE 5.8; traffic spawns on Play anyway
            traffic.rerun_construction_scripts()
    except Exception as e:
        unreal.log_warning("[ShiftCity] traffic not added: %s" % e)

    spawn = gen.get_spawn_transform()
    eas.spawn_actor_from_class(unreal.PlayerStart, spawn.translation, spawn.rotation.rotator())

    # game mode: the Vehicle template's, with the Shift City HUD
    gm = find_class("BP_VehicleAdvGameMode")
    if gm:
        cdo = unreal.get_default_object(gm)
        setp(cdo, "hud_class", unreal.load_class(None, "/Script/ShiftCityCore.SCHUD"))
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        setp(world.get_world_settings(), "default_game_mode", gm)
        for path in EAL.list_assets("/Game", recursive=True):
            if path.split("/")[-1].split(".")[0] == "BP_VehicleAdvGameMode":
                EAL.save_asset(path.split(".")[0])
    else:
        log("Vehicle template game mode not found: set GameMode Override in World Settings by hand")
    les.save_current_level()


REQUIRED_GENERATOR_VERSION = 4


def check_code_is_current():
    """Warn loudly if the C++ plugin wasn't rebuilt after pulling (the city would look like the old version)."""
    cls = unreal.load_class(None, "/Script/ShiftCityCore.SCCityGenerator")
    version = 0
    try:
        version = unreal.get_default_object(cls).get_generator_version()
    except Exception:
        pass
    if version < REQUIRED_GENERATOR_VERSION:
        msg = ("The Shift City C++ code is out of date (version %d, need %d).\n\n"
               "Close Unreal, open unreal/ShiftCity.slnx in Visual Studio, choose Development Editor, "
               "Build > Build Solution, then reopen the project and run this script again." % (version, REQUIRED_GENERATOR_VERSION))
        unreal.log_error("[ShiftCity] " + msg)
        if not CI:
            unreal.EditorDialog.show_message("Shift City: rebuild needed", msg, unreal.AppMsgType.OK)
        return False
    return True


def main():
    if not check_code_is_current():
        if CI:
            raise RuntimeError("C++ plugin is out of date (the robot's build step should have rebuilt it)")
        return
    with unreal.ScopedSlowTask(5, "Setting up Shift City") as task:
        task.make_dialog(True)
        # STEP lines make it obvious in the log (and in crash reports) how far the script got
        log("STEP 1/4: textures and materials")
        task.enter_progress_frame(1, "Importing textures and building materials")
        mats = build_materials()
        log("STEP 2/4: street lamps")
        task.enter_progress_frame(1, "Downloading street lamps (Poly Haven)")
        lamp = polyhaven_mesh("street_lamp_01")
        log("STEP 3/4: street trees")
        task.enter_progress_frame(1, "Downloading street trees (Poly Haven)")
        tree = polyhaven_mesh("tree_small_02") if IMPORT_TREES else []
        log("STEP 4/4: building the city level")
        task.enter_progress_frame(1, "Building the city")
        setup_level(mats, lamp, tree)
        task.enter_progress_frame(1, "Done")
    log("Shift City is ready. Press Play.")


try:
    main()
except Exception:
    import traceback
    unreal.log_error("[ShiftCity] SCRIPT FAILED:\n" + traceback.format_exc())
    if CI:
        unreal.SystemLibrary.quit_editor()
    raise
else:
    if CI:
        log("SCRIPT FINISHED (build robot run): closing the editor")
        unreal.SystemLibrary.quit_editor()
