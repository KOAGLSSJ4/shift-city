# One-click city setup

This builds the Shift City streets from the browser version in Unreal, with realistic materials, lighting,
street lamps and trees. You don't place anything by hand.

## Steps

1. **Close Unreal.** In GitHub Desktop: **Fetch origin**, then **Pull origin**.
2. **Rebuild the code.** Pulling new C++ doesn't always trigger Unreal's "rebuild?" prompt, so build it yourself:
   - Double-click `unreal/ShiftCity.sln` (if it's missing: right-click `ShiftCity.uproject` → *Show more options* → **Generate Visual Studio project files**).
   - At the top of Visual Studio pick **Development Editor**, then **Build → Build Solution**.
   - Wait for *"Build succeeded"*. If it fails, copy the **Error List** to Claude.
3. **Open the project** (`ShiftCity.uproject`).
4. **Turn on Python scripting** (once): **Edit → Plugins**, search **Python**, tick **Python Editor Script Plugin**, restart Unreal if asked.
5. **Run the setup:** **Tools → Execute Python Script…** → choose `unreal/Scripts/setup_shift_city.py`.
   - A progress bar appears. The first run downloads about 100 MB of lamp and tree models and can take 5–15 minutes.
   - To see what it's doing, or any errors: **Window → Output Log** (lines start with `[ShiftCity]`).
6. When it finishes you'll be in the new level **L_ShiftCity**. Press **▶ Play**.

You start next to Central Station. All 10 pickup points and all 5 story chapters work automatically.

## If something goes wrong

Copy the red lines from the **Output Log** and send them to Claude. You can run the script again safely; it rebuilds everything.

## Tweaks (no code)

Select **SCCityGenerator** in the Outliner:
- **Seed**: a different layout of building heights.
- **Lamp Scale / Tree Scale**: prop sizes.

In `Scripts/setup_shift_city.py` you can set `GOLDEN_HOUR = False` for midday light, or `IMPORT_TREES = False` for a faster first run.
