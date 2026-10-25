# Shift City — v0.5 (Claude rebuild)

Browser rideshare / delivery / arcade driving game. Rebuilt from scratch from the v4 single-file prototype
into a modular TypeScript + Three.js (r170) + Vite project.

## Run it

```bash
npm install
npm run fetch-assets   # downloads CC0 HDRI/textures + the placeholder glTF car into public/assets (~17 MB)
npm run dev            # http://localhost:5173
npm test               # economy, save-migration and road-routing unit tests
npm run build          # static build in dist/ (host anywhere)
```

`?gfx=rendered` or `?gfx=photoreal` in the URL overrides the saved graphics choice (useful on weak machines).

## Controls

| Key | Action |
|---|---|
| W / ↑ | Accelerate · S / ↓ brake/reverse · Space handbrake |
| A / ← · D / → | Steer left / right (arcade: change lane) |
| 1 / 2 / 3 / V | Cockpit / Chase / Top-down / cycle |
| Enter · N | Accept / decline job |
| G | Garage · R recover car · Esc menu |

Touch: on-screen pedals in the city; swipe or tap left/right in Arcade.

## Structure

```
src/
  core/      Game (orchestrator), Save (versioned schema + v3/v4 migration), Input, Audio (procedural)
  data/      vehicles, story chapters, goals, world layout, balancing — all data-driven
  gameplay/  Economy (pure, unit-tested), Jobs, CityMode (Story/Free Ride), ArcadeMode
  graphics/  Renderer (presets, HDRI, post-processing, adaptive resolution), Materials, CameraRig
  world/     City (procedural build), RoadNetwork (graph + Dijkstra GPS), Traffic (lane AI + signals)
  vehicles/  VehiclePhysics (fixed-step bicycle model), CarFactory (7 procedural bodies + glTF loader)
  ui/        Tutorial (bouncing pointer), Minimap
```

## Implemented in this build

- **Three independent selections**: mode (Story / Free Ride / Arcade), graphics (Photoreal / Rendered), camera (Cockpit / Chase / Top-down). Switching graphics never touches progress.
- **City**: 10×10 block grid, 2 lanes each way, kerbs, sidewalks, crossings, lane markings, street lights, trees, parks, 10 named destinations with roadside signs, working traffic lights.
- **Traffic AI**: 46 cars following lanes, turning at junctions, stopping at red lights and for cars/the player ahead.
- **Driving**: fixed-step (120 Hz) bicycle model with weight transfer, speed-sensitive steering, handbrake slides, kerb/building and traffic collisions, recover button. One simulation shared by all 3 cameras.
- **Jobs**: ride + food requests, accept/decline, stop-in-the-ring pickup/drop-off, premium/VIP passengers for better cars, star ratings from bumps, tips, exactly-once payment.
- **Street-aware GPS**: Dijkstra over the road graph, glowing chevrons painted along the route, turn-by-turn prompt, route on minimap, edge-of-screen arrow for off-screen objectives.
- **Story**: the 5 v4 chapters with named passengers, intro/outro lines and time-bonus tips.
- **Arcade Rush**: endless 3-lane highway, 3-2-1 countdown, coins, near-miss streaks → x8 multiplier, magnet / x2 / nitro power-ups, trucks, lane-changing traffic, 3 hearts, speed ramp, new-best confetti, instant restart (Enter).
- **Economy/garage**: 8 vehicles with visibly different bodies (hatch, sedan, SUV, GT, supercar, limo, hypercar + 1 authored glTF), real stat differences, 3 upgrade tracks (engine/brakes/handling) that change physics, 100 arcade pts = $5 conversion, 9 claimable goals, levels/XP.
- **Tutorial**: 6 contextual steps, bouncing pointer that tracks live UI elements and world objectives, glow highlight, advances only on real actions, skip + replay, saved completion flag.
- **Save**: `shift-city-save` v5 with migration from `shift-city-v4`/`v3` and their mission keys.
- **Photoreal mode**: 2k HDRI image-based lighting + sky, sun direction extracted from the HDRI, Poly Haven scanned PBR road/sidewalk/wall materials, clearcoat car paint, reflective window glass, 4k soft shadows, GTAO ambient occlusion, bloom, SMAA, AgX tone mapping, adaptive resolution.

## Not yet implemented / known gaps

See the session report. Headline items: authored building/tree/vehicle assets for true photorealism, pedestrians,
fuel/expenses, day/night, mobile layout polish, traffic-vs-traffic collisions, and the Rosso F90 placeholder model must be replaced (see ASSETS.md).
