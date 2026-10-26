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
GOLDEN_HOUR = True        # False = midday sun

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
                  rough_value=None, metal_value=None, emissive_v_tiling=1.0, normal_tiling=None):
    mat = new_material(name)
    mat.set_editor_property("two_sided", True)
    S = unreal.MaterialSamplerType
    P = unreal.MaterialProperty
    # base colour (optionally tinted)
    if base is not None:
        b = tex_node(mat, base, S.SAMPLERTYPE_COLOR, -700, -300)
        if tint is not None:
            m = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, -300)
            MEL.connect_material_expressions(b, "RGB", m, "A")
            MEL.connect_material_expressions(color(mat, tint, -600, -150), "", m, "B")
            MEL.connect_material_property(m, "", P.MP_BASE_COLOR)
        else:
            MEL.connect_material_property(b, "RGB", P.MP_BASE_COLOR)
    elif tint is not None:
        MEL.connect_material_property(color(mat, tint, -400, -300), "", P.MP_BASE_COLOR)
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
        p.set_editor_property("default_value", 0.0 if not GOLDEN_HOUR else 0.4)
        m = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, 800)
        MEL.connect_material_expressions(e, "RGB", m, "A")
        MEL.connect_material_expressions(p, "", m, "B")
        MEL.connect_material_property(m, "", P.MP_EMISSIVE_COLOR)
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
    for i in range(6):
        facades.append(make_material(
            "M_Facade%d" % i, import_texture(f("T_Facade%d_D.png" % i)), None,
            brick_n if i in (1, 5) else wall_n, import_texture(f("T_Facade%d_R.png" % i), "mask"),
            import_texture(f("T_Facade%d_M.png" % i), "mask"), import_texture(f("T_Facade%d_E.png" % i)),
            emissive_v_tiling=0.25, normal_tiling=2.0))
    shops = []
    for i in range(6):
        shops.append(make_material(
            "M_Shop%d" % i, import_texture(f("T_Shop%d_D.png" % i)), None, None,
            import_texture(f("T_Shop%d_R.png" % i), "mask"), import_texture(f("T_Shop%d_M.png" % i), "mask"),
            import_texture(f("T_Shop%d_E.png" % i))))
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
                unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem).set_nanite_settings(mesh, ns, True)
            except Exception as e:  # Nanite is an optimisation, not required
                log("Nanite not enabled for %s (%s)" % (asset_id, e))
            EAL.save_loaded_asset(mesh)
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


def setup_level(mats, lamp, tree):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    level = ROOT + "/Maps/L_ShiftCity"
    if EAL.does_asset_exist(level):
        les.load_level(level)
        eas.destroy_actors([a for a in eas.get_all_level_actors() if not isinstance(a, unreal.WorldSettings)])
    else:
        les.new_level(level)

    pitch = -14.0 if GOLDEN_HOUR else -45.0
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

    gen_class = unreal.load_class(None, "/Script/ShiftCityCore.SCCityGenerator")
    gen = eas.spawn_actor_from_class(gen_class, unreal.Vector(0, 0, 0))
    for key, value in mats.items():
        setp(gen, key, value)
    setp(gen, "lamp_meshes", lamp)
    setp(gen, "tree_meshes", tree)
    gen.generate()

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


def main():
    with unreal.ScopedSlowTask(5, "Setting up Shift City") as task:
        task.make_dialog(True)
        task.enter_progress_frame(1, "Importing textures and building materials")
        mats = build_materials()
        task.enter_progress_frame(1, "Downloading street lamps (Poly Haven)")
        lamp = polyhaven_mesh("street_lamp_01")
        task.enter_progress_frame(1, "Downloading street trees (Poly Haven)")
        tree = polyhaven_mesh("tree_small_02") if IMPORT_TREES else []
        task.enter_progress_frame(1, "Building the city")
        setup_level(mats, lamp, tree)
        task.enter_progress_frame(1, "Done")
    log("Shift City is ready. Press Play.")


main()
