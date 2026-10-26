# The first hyper-real street (vertical slice)

Goal: **one convincing street**, not a whole city. That's the right size for a 4 GB laptop GPU.
It should look like your reference screenshots: wet asphalt, kerbs, shopfronts, trees, street lights,
golden hour or night with rain. One rideshare job runs along it.

## Build order

1. **New level:** File → New Level → **Basic**. Save as `Content/ShiftCity/Maps/L_FirstStreet`.
2. **Sky and light** (all built in, free):
   - Keep *Directional Light*, *Sky Atmosphere*, *Sky Light* (Real Time Capture **on**), *Exponential Height Fog*, and add *Volumetric Cloud*.
   - Golden hour: rotate the Directional Light to about 8–12° above the horizon.
   - Night: sun below the horizon, then add street lights (point or spot lights, see 5).
3. **Road:** start with a long plane and a road surface material.
   - Free scanned asphalt, kerb and pavement surfaces: **Fab.com** (filter **Free**) or Poly Haven (CC0, already used in the browser version).
   - Later: a road spline tool for curves and junctions.
4. **Buildings:** a modular facade kit (shopfront ground floor plus 3–6 upper floors).
   - Options: search Fab for *"modular city"*, *"modular building"* or *"street"* with the **Free** filter, or Poly Haven's `modular_urban_apartments_facade`.
   - Check each asset's licence on Fab before using it in a game you'll sell.
5. **Street furniture:** reuse the Poly Haven props from the browser version (lamps, bins, hydrants, benches).
   - Import the `.glb` files via **Import** in the Content Browser.
   - The browser repo's `scripts/fetch-polyhaven-models.mjs` downloads the full-quality originals; Unreal can use the full-detail versions with **Nanite**.
6. **Trees:** Poly Haven trees (`tree_small_02`, `jacaranda_tree`, `island_tree_01`). Import with **Nanite enabled**, which handles millions of triangles.
7. **Cars:** the Vehicle template's sports car to start. Later, the free Sketchfab cars (e.g. the Corolla with an interior) for the cockpit view.
8. **Wet roads and rain** (the look from your references):
   - Wetness: add a *Wetness* parameter to the road material that lowers roughness to ~0.05 and darkens the base colour, with a puddle mask texture. Lumen gives real reflections in the puddles.
   - Rain: **Niagara** particle system (built in) with a GPU sprite emitter attached to the camera.
   - Paid shortcut worth considering later: *Ultra Dynamic Sky* + *Ultra Dynamic Weather* on Fab (~$70 for both) gives time of day, rain, wet surfaces and puddles in one package.
9. Place **SC Destination** actors at each end of the street and run a job.

## Settings for the 3050 Ti

- **Project Settings → Rendering:**
  - Global Illumination = **Lumen**, Reflections = **Lumen**, Shadow Map Method = **Virtual Shadow Maps**.
  - Anti-Aliasing = **TSR**. Screen percentage 75% while editing.
- **Nanite on** for imported meshes (right-click mesh → *Nanite → Enable*).
- **Textures:** prefer 2K versions over 4K to stay inside 4 GB of graphics memory.
- If the editor stutters, drop Engine Scalability to **Medium**. Raise it to **Epic** only for screenshots and recordings.
