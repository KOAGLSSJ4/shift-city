# CLAUDE.md — Shift City

Rideshare / delivery / arcade driving game by David (K Studios). Two versions in one repo:
`web/` (browser, Three.js + TS, the free playable taster and fast prototype) and `unreal/` (UE 5.8, the
hyper-real paid PC version). Goal now: **port every web feature to Unreal with realistic graphics.**
David is not building levels by hand: everything should be generated in code or by the one-click
setup script. Keep instructions to him step-by-step and non-technical.

## David's machine / workflow
- MSI laptop, RTX 3050 Ti **4 GB VRAM**, 16 GB RAM, project on `D:\Projects\Shift City\shift-city`.
- Unreal Engine **5.8** at `D:\Epic Games\UE_5.8`; **Visual Studio 2026** (VS 2022 can't build 5.8's .NET 10 tools).
  Solution file is `unreal/ShiftCity.slnx`. Build: Development Editor → Build Solution.
- Loop: Claude pushes to `main` → David: GitHub Desktop Fetch/Pull → rebuild in VS (when C++ changed) →
  Unreal: Tools → Execute Python Script → `unreal/Scripts/setup_shift_city.py` → Play → screenshots back.
- Claude can't compile or run Unreal in the cloud: re-read new C++ for API/compile risks before pushing.
  MSVC treats C4459 (global names like `N` shadowing engine template params) as errors.
- Watch his C: drive: keep caches on D: (VS IntelliSense fallback = `D:\VSCache`).

## Unreal structure (unreal/)
- `Plugins/ShiftCityCore` (C++): `USCEconomySubsystem` (money/XP/garage/goals/save), `ASCJobDirector`
  (story + free ride jobs), `ASCDestination`, `ASCHUD` (Canvas HUD, vector fonts, GPS, minimap),
  `ASCCityGenerator` (procedural city port of web City.ts; bump `GetGeneratorVersion()` with
  `REQUIRED_GENERATOR_VERSION` in the script when changing it), `ASCTraffic` (lane AI + signals),
  `SCCityLayout.h` (grid, 10 destinations, Dijkstra routing).
- `Plugins/ShiftCityCore/Data/*.json`: shared data, exported from web via `npm run export-unreal-data`.
- `Scripts/setup_shift_city.py`: imports textures/materials, downloads Poly Haven CC0 models (Nanite),
  builds level `/Game/ShiftCity/Maps/L_ShiftCity`, spawns generator/traffic/sky/lights, sets game mode
  (Vehicle template `BP_VehicleAdvGameMode` + `SCHUD`). Re-runnable.
- `SourceArt/`: textures for the script (not LFS). `Tools/make_facades.py`: dev tool, not for Unreal.
- Config: VSM off (cascaded shadows), texture pool capped for 4 GB.

## Port status (web feature → Unreal)
Done: city layout, 10 destinations, story (5 chapters) + free ride jobs, economy/save, HUD job card,
road GPS + turn prompts, minimap (no traffic dots by choice), traffic + traffic lights, scanned facades,
Poly Haven lamps/trees (leaves via masked material + Nanite Preserve Area).

Next, in order: main menu (Story / Free Ride / Arcade) → garage (buy/equip/upgrades, cars that differ) →
goals screen → settings (volume sliders, graphics, camera) → camera views (cockpit/chase/top-down,
top-down heading-up) → time of day (day/golden/night, lit windows via `WindowGlow`) + weather
(wet roads, rain, windscreen drops) → Arcade Rush → contextual tutorial pointer → audio →
passengers/pedestrians → fictional car models (replace real brands before release).

## Decisions
- One monorepo (`web/` + `unreal/`), David's call. Push to `main` (he pulls with GitHub Desktop).
- Traffic dots hidden on the minimap (clean GPS look).
- Assets: Poly Haven CC0 first; Sketchfab CC-BY cars later (credit screen). No NonCommercial assets.
- Real-brand cars (e.g. the Ferrari-based "Rosso F90" in web) are placeholders only.
