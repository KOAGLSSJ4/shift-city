# Build robot setup (once, about 15 minutes)

The build robot is a small free program from GitHub that runs on your laptop. Every time Claude pushes
Unreal changes it: builds the C++ (like pressing Build in Visual Studio), runs the setup script in the
editor (like Tools → Execute Python Script), and sends the results and any crash log back to GitHub so
Claude can read them and fix problems without you.

While a run is going you'll see Unreal open by itself, run the script and close again. That's the robot.

## 0. Install Git (needed by the robot)

1. Press the **Windows** key, type **PowerShell**, open it.
2. Paste this and press Enter: `winget install --id Git.Git -e`
3. Close PowerShell when it says it's installed.

## 1. Get the robot from GitHub

1. Open **github.com/KOAGLSSJ4/shift-city** → **Settings** (top right of the repo) → **Actions** → **Runners**.
2. Click **New self-hosted runner** → pick **Windows**, architecture **x64**.
3. GitHub now shows two boxes of commands, **Download** and **Configure**. Keep this page open.

## 2. Download it

1. Open **PowerShell** again.
2. Paste these two lines, pressing Enter after each:
   ```
   mkdir D:\ShiftCityRunner
   cd D:\ShiftCityRunner
   ```
3. From the GitHub page's **Download** box, copy the lines that start with `Invoke-WebRequest` and
   `Add-Type`, paste them into PowerShell, and press Enter. (Skip the `mkdir` and `cd` lines there; you
   already did those, on D:.)

## 3. Connect it to your repo

1. From the **Configure** box copy the line starting with `./config.cmd --url ...` and paste it.
2. It asks a few questions. Press **Enter** to accept the default for each, **except**:
   - *"Would you like to run the runner as service?"* → type **N** and Enter.
3. It ends with **"Settings Saved."**

## 4. Start it

1. Paste: `./run.cmd`
2. When it says **"Listening for Jobs"**, the robot is on. Minimise the window; don't close it.

## 5. Make it start by itself (recommended)

1. Press **Windows + R**, type `shell:startup`, press Enter. A folder opens.
2. In another File Explorer window go to `D:\ShiftCityRunner`, right-click **run.cmd** → **Show more options**
   → **Create shortcut**, then drag that shortcut into the startup folder.

Now the robot starts whenever you log in to Windows.

## Day to day

- Nothing to do. When your laptop is on and you're logged in, Claude's Unreal pushes get built and tested.
  If the laptop is off, the job waits on GitHub and runs when you're back.
- To pause it, close the robot's window. To start it again, double-click `D:\ShiftCityRunner\run.cmd`.
- It keeps its own copy of the project in `D:\ShiftCityRunner\_work`, separate from your project folder,
  so it never touches your work.
- If your Unreal isn't at `D:\Epic Games\UE_5.8`, tell Claude.
