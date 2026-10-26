# Shift City — Unreal Engine 5 (`unreal/`)

The hyper-real PC version of Shift City (K Studios). The browser version in `../web` stays as the
free, link-playable taster and the place where gameplay is prototyped quickly.

## What's here

| Path | What it is |
|---|---|
| `Plugins/ShiftCityCore/` | C++ plugin with the core game systems, ported from the browser version |
| `Plugins/ShiftCityCore/Data/*.json` | Cars, story chapters, goals and balancing, exported from `../web/src/data` (`npm run export-unreal-data`) so both versions use the same numbers |
| `docs/SETUP.md` | Install Unreal, create the project, add the plugin |
| `docs/CITY-SETUP.md` | **Next step.** One click builds the whole city with realistic materials, lamps and trees |
| `Scripts/setup_shift_city.py` | The one-click setup script (run inside Unreal) |
| `SourceArt/` | Textures used by the setup script (Poly Haven CC0 scans + generated facades) |
| `docs/FIRST-STREET.md` | Building the first realistic street, lighting and rain on an RTX 3050 Ti |
| `docs/ROADMAP.md` | What gets built next, in order |

## Systems in the plugin (v0.1)

- **Economy subsystem** (`USCEconomySubsystem`): wallet, XP and levels, garage purchases, 3 upgrade tracks,
  arcade-point conversion (100 pts = $5), goals, exactly-once job payment, ratings, and the save game.
  Blueprint-callable, so menus built later in UMG can use it directly.
- **Job director** (`ASCJobDirector`): Story Mode (the 5 chapters with passengers, intros, outros and time-bonus tips)
  and Free Ride (random rides and food orders, premium/VIP passengers for better cars). Accept/decline,
  stop-in-the-zone pickup and drop-off, star rating from collisions, odometer for goals.
- **Destinations** (`ASCDestination`): drag-in pickup/drop-off points with a glowing beam and ring.
- **City generator** (`ASCCityGenerator`): the browser version's 10 x 10 block city (roads, markings, kerbs, sidewalks,
  buildings with shopfronts, parks, lamps, trees) and the ten named pickup points, generated in code.
- **HUD** (`ASCHUD`): drawn in code, no UI assets needed. Shows the career panel, job card, GPS arrow and distance,
  an objective marker that sticks to the screen edge, boarding progress, story cards, messages and speed.

Controls (on top of the Vehicle template's driving controls): **Enter** accept job · **N** decline · **M** switch Story/Free Ride.

## Status

Written to compile on Unreal Engine 5.4 or newer, but **not yet compiled**: it was written in a cloud environment
without Unreal Engine. Expect a first round of build fixes on the first compile. Send the errors back to Claude.
