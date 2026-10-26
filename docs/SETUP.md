# Setup: from nothing to driving in Unreal (about 1–2 hours, mostly downloads)

Laptop: RTX 3050 Ti (4 GB), 16 GB RAM, 2 TB SSD. Install everything below onto the 2 TB SSD.

## 1. Install the tools

1. **Epic Games Launcher**: download from epicgames.com and sign in (free account).
2. In the launcher: **Unreal Engine → Library → +** next to *Engine Versions*. Pick the **latest 5.x** version.
   - Click **Browse** to choose the 2 TB SSD (e.g. `D:\UnrealEngine`).
   - Under *Options*, you can untick target platforms you don't need (Android, iOS, Linux) to save ~20 GB.
3. **Visual Studio 2022 Community** (free, visualstudio.microsoft.com). In the installer tick:
   - **Game development with C++**, and inside it make sure **Unreal Engine installer** and a **Windows 10/11 SDK** are ticked.
   - **.NET desktop development** (Unreal's build tools need it).
4. **GitHub Desktop** (desktop.github.com). Sign in, then **File → Clone repository → `shift-city-unreal`** into `D:\Projects\shift-city-unreal`.

## 2. Create the Unreal project from the free Vehicle template

1. Launch Unreal Engine. In the project browser choose **Games → Vehicle**.
2. Settings on the right:
   - **C++** (not Blueprint). Our plugin is C++.
   - **Desktop**, Quality **Scalable** (we raise it later), **Starter Content off**, **Raytracing off**.
   - Location: `D:\Projects`. Name: **ShiftCity**.
3. Click **Create**. Visual Studio may open; you can close it. The editor opens on the vehicle test track.
4. Drive once to check it works: press **Play** (green ▶), drive with W/A/S/D, press **Esc** to stop. Then close Unreal.
5. **Move the project into the repo folder.** Open `D:\Projects\ShiftCity` and move **everything inside it**
   (`ShiftCity.uproject`, `Source`, `Content`, `Config`, …) into `D:\Projects\shift-city-unreal`, next to the
   `Plugins` and `docs` folders that are already there. From now on always open
   `D:\Projects\shift-city-unreal\ShiftCity.uproject`. You can delete the empty `D:\Projects\ShiftCity` folder.

## 3. Add the Shift City plugin

The plugin is already in the repo at `Plugins/ShiftCityCore`, which is now inside your project folder.

1. Make sure Unreal is closed.
2. Right-click `ShiftCity.uproject` → **Generate Visual Studio project files**.
3. Double-click `ShiftCity.uproject`. When asked *"The following modules are missing or built with a different engine version… rebuild now?"* click **Yes**. The first build takes a few minutes.
   - **If it fails:** open `ShiftCity.sln`, choose **Development Editor**, then **Build → Build Solution**. Copy the errors from the *Error List* and send them to Claude.
4. In the editor: **Edit → Plugins**, search "Shift City" and check it's **enabled**.

## 4. Hook up the HUD

1. **Window → World Settings**. Find **GameMode Override** (the template's game mode, e.g. `BP_VehicleAdvGameMode`). Click the 🔍 icon to find it in the Content Browser.
2. Double-click that game mode. In **Class Defaults** set **HUD Class = SCHUD**. **Compile** and **Save**.

## 5. Place the destinations

1. **Window → Place Actors** and search **SC Destination**.
2. Drag one into the level beside the road. In **Details → Shift City** set **Display Name**:
   - For Story chapter 1 you need **Central Station** and **Arts District**.
   - Eventually place all ten: Central Station, Riverside Apartments, City Hospital, Westside Mall,
     University Quarter, Harbour Hotel, Market Square, Old Town, South Park, Arts District.
   - Spread them around the track so trips take 30–90 seconds.
3. **Radius** is the stop zone (800 = 8 m).

## 6. Play

Press **Play**. You'll see the career panel and a job card.
- **Enter** accepts the job. Follow the arrow, drive into the glowing beam and **stop**.
- **M** switches between Story and Free Ride. **N** declines a Free Ride job.
- Progress saves automatically (slot "ShiftCity").

Send Claude a screenshot when it works, or the error text if anything fails.

## Laptop performance settings (RTX 3050 Ti)

- Viewport toolbar **Settings → Engine Scalability**: start at **Medium**, try **High** for screenshots.
- **Edit → Editor Preferences → Performance**: tick **Use Less CPU when in Background**.
- Close Chrome and other heavy apps while the editor is open. 16 GB is enough, but only just.
- Keep the laptop plugged in, and set NVIDIA Control Panel → *Preferred graphics processor* = **High-performance NVIDIA**.

## Keeping data in sync with the browser version

Cars, prices, story and goals live in the browser repo. To update the Unreal copy, run this in the browser repo:

```
npx vite-node scripts/export-data.ts <path-to>/shift-city-unreal/Plugins/ShiftCityCore/Data
```
