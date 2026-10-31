# CLAUDE.md — Shift City

Rideshare / delivery / arcade driving game by David (K Studios). Two versions in one repo:
`web/` (browser, Three.js + TS, the free playable taster and fast prototype) and `unreal/` (UE 5.8, the
hyper-real paid PC version). Goal now: **ship the web version** (own site on Vercel + itch.io + CrazyGames
+ Poki, see `web/LAUNCH.md`), then keep porting every web feature to Unreal with realistic graphics.
David is not building levels by hand: everything should be generated in code or by the one-click
setup script. Keep instructions to him step-by-step and non-technical.

## Backlog
`BACKLOG.md` (repo root) is the running list of bugs, tweaks and future features. When David mentions
something "for later", add it there instead of building it. When fixing an item, move it to Done with the date.

## David's machine / workflow
- MSI laptop, RTX 3050 Ti **4 GB VRAM**, 16 GB RAM, project on `D:\Projects\Shift City\shift-city`.
- Unreal Engine **5.8** at `D:\Epic Games\UE_5.8`; **Visual Studio 2026** (VS 2022 can't build 5.8's .NET 10 tools).
  Solution file is `unreal/ShiftCity.slnx`. Build: Development Editor → Build Solution.
- Loop: Claude pushes to `main` → David: GitHub Desktop Fetch/Pull → rebuild in VS (when C++ changed) →
  Unreal: Tools → Execute Python Script → `unreal/Scripts/setup_shift_city.py` → Play → screenshots back.
- Claude can't compile or run Unreal in the cloud: re-read new C++ for API/compile risks before pushing.
  MSVC treats C4459 (global names like `N` shadowing engine template params) as errors.
- Watch his C: drive: keep caches on D: (VS IntelliSense fallback = `D:\VSCache`).

## Web structure (web/)
- Vite + Three.js + TS. `npm run dev`, `npm test` (vitest), `npm run release` (builds web/itch/crazygames/poki
  into `release/`, zips the portal uploads). GitHub Actions `web-release.yml` does the release on every push.
- Targets via `VITE_TARGET`; `src/core/Platform.ts` wraps the Poki/CrazyGames SDKs (no-ops elsewhere).
- Cars: `src/vehicles/CarBody.ts` (lofted bodies + projected decals), `designs.ts` (all 10 bodies incl. the Classic),
  studio at `/dev/cars.html`. Missions/personalities: `src/gameplay/Missions.ts`.
- World leaderboard: `web/api/leaderboard.js` (Vercel + Upstash env vars), own-site build only.
- Music: CC0 tracks in `public/music` (credits in ASSETS.md + in-game Credits).
- Testing in the cloud: Playwright + swiftshader is slow (~0.2x speed); use `?gfx=rendered` and
  `window.__game` to drive state.

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
passengers/pedestrians. (Car designs ported 2026-10-30: `SCCarVisuals.*` + `Data/Cars` from
`npm run export-unreal-cars`; re-run that after changing a design.)

## Where we left off (web, 2026-10-29)
- Live on Vercel: shift-city-theta.vercel.app (David launched it 2026-10-28). itch.io + CrazyGames uploads still
  David's to do (LAUNCH.md); World leaderboard live (Upstash connected, api returns 200).
- Shipped 2026-10-29 (all on `main`, `feature/driver-app` merged): driver app (15 s offers, acceptance, offline
  after 3 declines, tiers), daily reward + daily challenge (`gameplay/Daily.ts`), power-up upgrades (banked
  arcade points), car radio (`data/radio.ts`: B / 📻, stations, passenger music taste, creator songs = MP3 in
  `public/music` + one line), trip streak + earnings card, surge zones on the minimap, rider cancellations
  ($3 fee), rider compliments/badges, late-dodge near misses (12 m), garage hides HUD, phone toolbar fix.
- Merged to `main` 2026-10-30 (were branches):
  - `feature/story-week`: Story v1.1 "The Week" (`data/week.ts`, `gameplay/Week.ts`, comic overlay in Game.ts).
  - `feature/roads`: roundabouts, one-way streets, ring road + airport + airport queue. Roads are now paths
    (`edgePath`/`pointAlong`/`edgeLength` in RoadNetwork.ts); ring nodes are ids 121-124. Airport is kept out of
    the Unreal data export (`GRID_DESTINATIONS`). Web only so far.
  - `feature/unreal-screens`: Unreal Garage/Goals/Settings (Slate list screens), robot shot 2 = Garage screen.
- Live since 2026-10-30: dynamic time/weather, always on in the city (no setting; Arcade = dry day), `gameplay/DayCycle.ts`, waiting-time fee,
  stacked food orders, surge chip on the minimap, Shift Classic cockpit dash.
- Arcade rate stays 100 points = $8 (David still deciding if it's too generous).
- Pushing to `main` deploys to the live site: David approved merges/pushes for backlog work on 2026-10-29.
- Not verified on real devices: phone touch play, real ad fill on portals.

## Where we left off (Unreal, 2026-10-29)
- Build robot works end to end (runner "MSI"): checkout with LFS + `git lfs checkout`, build, setup script,
  40 s play test with `-SCShots` (3 screenshots in `Saved/RobotShots`, uploaded as the `unreal-logs` artifact;
  download via the artifacts API with curl, no auth needed). Last shot follows traffic car 0. It only runs while
  the laptop is awake with `run.cmd` open; runs queue otherwise.
- David's rule (2026-10-30): if the robot hasn't picked a run up within 20 minutes (laptop asleep / runner closed), stop
  watching and tell him. A run that is going can take as long as it needs; don't mention the 20 minutes to him.
- Fixed via robot: crash on Play (minimap null texture), traffic invisible (template SKM is only the rig: bolt on
  SM body/glass/wheels on VisWheel bones), HUD overlaps, VSM warning (duplicate ini line), wheels spin.
- Done + robot-tested: Slate main menu `Private/SCMenu.*` (Story / Free Ride / Arcade "coming soon" / Quit),
  shown at start and on M, robot auto-picks Free Ride after shot 1. New .cpp files: touch Build.cs or UBT
  may not compile them (link error).
- HUD part 1 done in Slate (`MakeHud` + `FSCHudModel` filled by ASCHUD each frame, `SDPIScaler` 1.3): career,
  job card, GPS banner (rotating arrow), boarding bar, story card, toasts. Robot accepts the first job so
  shot 2 shows the GPS. Next: minimap polish + own speedometer + animations, then garage/goals/settings screens.
- Web 2026-10-29 later: world leaderboard live (env names KV_REST_API_*), corner-forest trees off roads, traffic
  spawn spacing + lane change round a stopped player, GPS "turn now" at junctions (web + Unreal).
- David must re-run the setup script after pulling (traffic needs the body meshes), and rebuild in VS.

## Decisions
- One monorepo (`web/` + `unreal/`), David's call. Push to `main` (he pulls with GitHub Desktop).
- Traffic dots hidden on the minimap (clean GPS look).
- Assets: Poly Haven CC0 first. No NonCommercial assets. Cars: keep our own designs (David, 2026-10-30: no Sketchfab);
  real models only if they ever look bad. Look: pristine, picture-like realism (no paint flake, no wear).
- Unreal (David, 2026-10-30): use Epic's free Fab assets for realism: City Sample Vehicles for the cars (and a city
  pack later). Fab packs live only in David's project folder (every Content folder not in the repo is gitignored); the robot
  mirrors those folders from `D:\Projects\Shift City\shift-city\unreal\Content` before building. Web: no more realism needed.
  David: don't be afraid to build new things from the pack (mix bodies, wheels, colours, parts into our own cars).
  Garage cars in Unreal (`FabCars` in SCCarVisuals.cpp): Classic=vehicle06, Kite Pico=07, Lumen=03, Halden=02,
  Aeris=05, Vortex=NO FACE hypercar in copper (#b4541f, David's photo), Furia=template; Ardente/Stellato/Sovereign
  wait for the Vehicle Variety Pack. Packs in: CitySampleVehicles, CitySampleBuildings, NO_FACE_Hypercar. 4 GB VRAM:
  keep few distinct traffic models.
- Cars are original procedural designs (web `src/vehicles/designs.ts`, lofted bodies in `CarBody.ts`, preview at
  `web/dev/cars.html`). The Ferrari placeholder is gone; vehicle ids stay stable for saves.
  2026-10-30: Classic (now lofted, round lamps), Kite Pico and Lumen reshaped; David happy, leave them be. In Unreal
  the Vehicle template's sports car is the Furia V12 (David likes it); every other car + traffic = our designs.
- Ship the web version first (Vercel site + itch.io + CrazyGames; Poki undecided), Unreal continues in parallel.
- Story v1.1 (after launch): FT "Uber Game"-style week (comic-panel cutscenes, evening choices, stats that
  change the driving, several endings). Tone: upbeat with real stakes, more good endings than bad, no
  personal/family storyline for the driver. Story lives in a data file shared with Unreal.
- The Week replaces the old 5-chapter story (David, 2026-10-30). Never announce how many endings there are or hint
  at better ones: players discover them.
