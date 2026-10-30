# Shift City backlog

Ideas, bugs and tweaks to do later. Add anything here (David or Claude) and we pick from it when there's time.
Items Claude suggested (rather than David) are marked as such.
Newest at the top of each section. When something is fixed, move it to **Done** with the date.

## Bugs

- *(none known yet. Add what you spot while playing.)*

## Tweaks

- **Arcade balance:** David thinks money/XP feel right but hasn't tested it hard. Revisit if launch
  feedback says Arcade out-earns the city modes ($8 per 100 points, 1 XP per 1,000 points, no cap).
- **Cockpit view** of the new lofted cars is functional but plain (dash, pillars); could use more detail.

## Features (next up)

- **Radio later:** a private upload page on the Vercel site for creator songs (needs file storage, e.g. Vercel Blob);
  a Talk/News station (needs voice recordings). For now, add songs via `web/src/data/radio.ts`.
- **More Uber-app features** (David, 2026-10-28), candidates:
  - waiting-time fee at pickup;
  - airport queue;
  - stacked / batched food orders;
- **Dynamic time of day + weather** (David, 2026-10-29): a "Dynamic" choice in Settings next to the fixed
  Day/Sunset/Night and Dry/Wet/Rain. Sky moves day → sunset → night over a session; showers roll in now and
  then, roads stay wet for a while and dry out. Fixed settings stay for players who prefer one look. Ideas: rain
  surge pricing, more food orders at night. Unreal needs time of day + weather first (see port list).
- **More complicated roads** (David, 2026-10-28). Part 1+2 built on branch `feature/roads` (not live until David
  says): four mini roundabouts (islands, traffic circles them and gives way, GPS "take the 2nd exit") and two
  one-way streets (arrows, traffic + GPS obey them). Still to do: curves, a ring road/highway, bridges,
  non-right-angle junctions (needs the road graph to support curved roads), and the Unreal port.
- **Story v1.1, "The Week"**: built on branch `feature/story-week` (not live until David says). New menu mode:
  5 days of comic-panel intros, story jobs with city characters, evening choices, energy that makes the car
  sluggish when low, 4 endings (3 good, 1 bad). Next: David plays it; then the Unreal port (data in
  `web/src/data/week.ts`).
  Later (David, 2026-10-30): flesh out the stories and the endings more (longer scenes, more characters' arcs,
  ending cutscenes), after launch feedback.
- itch.io and CrazyGames uploads: steps in `web/LAUNCH.md`. (Vercel site is live: shift-city-theta.vercel.app)
- Poki: undecided (exclusive vs non-exclusive, maybe after Steam).

## Not yet checked on real devices

- Touch controls and layout on a real phone.
- Real ads on CrazyGames (only shows once they publish the game).

## Unreal

- **HUD design pass, part 2** (David, 2026-10-28). Done: money/level panel, job card, story card and toasts
  are rounded Slate panels like the menu. Still to do:
  - minimap: rounded rim with a soft shadow, a car arrow instead of a triangle, coloured route line;
  - speed/gear readout comes from the Vehicle template and doesn't match: replace with our own;
  - animations: cards slide/fade in, money counts up when paid.
- Trees have no leaves in the build robot's screenshots (they do on David's screen): robot-only, low priority.
- Next batch: garage + goals + settings screens (same Slate style as the main menu, `Private/SCMenu.*`).

## Done

- 2026-10-30: surge zone obvious on the minimap: stronger orange patch, pulsing outline, "SURGE ×1.6" label,
  and a "×1.6" chip on the rim pointing to it when it's off the map.
- 2026-10-29: driver app merged: 15 s offers, acceptance rate, offline after 3 declines, Blue/Gold/Platinum/Diamond tiers.
- 2026-10-29: GPS said "turn right" when you had to turn left first at the junction you're waiting at (web + Unreal):
  the first leg is now compared with where the car faces ("Turn left now").
- 2026-10-29: Unreal HUD part 1: career panel, job card, story card, toasts, GPS banner and boarding bar in
  rounded Slate panels.
- 2026-10-29: world leaderboard reads Vercel's KV_REST_API_* env names too; perimeter forest no longer puts trees
  on roads near the city corners; traffic no longer spawns overlapping and goes round a stopped player.
- 2026-10-29: Unreal main menu (Story / Free Ride / Arcade coming soon / Quit), shown at start and on M, in a
  rounded translucent Slate style. Robot-tested.
- 2026-10-29: destination filter in Goals ("only trips heading towards …").
- 2026-10-29: rider compliments (Smooth driving, Great music, Speedy service, Great conversation, Expert
  navigation) on 4.8+ star rides, collected as badges on the earnings card.
- 2026-10-29: riders cancel if you take far too long to reach them (warning at 20 s left, $3 cancellation fee).
- 2026-10-29: surge zones: an orange patch on the minimap moves every 3 min; rides picked up there pay ×1.4–2.0.
- 2026-10-29: merged to live: driver app, daily reward/challenge, power-up upgrades, car radio, trip streak +
  earnings. Unreal traffic wheels spin with speed.
- 2026-10-29: Uber-style trip streak (every 3rd trip in a row without declining: +$5, +$10… up to $25) and an
  earnings card in Goals (today, last 7 days, best trip). Daily challenge covers "quests".
- 2026-10-29: car radio: 📻 button / B key cycles Drive 101, Chill FM, Hype Radio, Off; station remembered;
  passengers have music taste (tips for the right station, lost stars for the wrong one, comments when you
  switch). Creator songs: MP3 in `web/public/music/` + one line in `web/src/data/radio.ts`.
- 2026-10-29: power-up upgrades on the Arcade results screen: 5 levels each, +20% duration per level, paid with banked arcade points.
- 2026-10-29: daily login reward ($50, +$25 per day in a row, max $200) + a daily challenge in Goals ($100 + 15 XP).
- 2026-10-28: web version live on Vercel (David).
- 2026-10-29: near misses only for late dodges (car within 12 m), garage hides the HUD, phone top buttons
  no longer run under the job card, name box says "Your name".
- 2026-10-28: Unreal traffic cars visible (body, glass, wheels added), HUD panels fit their text, yellow VSM
  shadow warning gone. The build robot now takes in-game screenshots.
- 2026-10-28: Unreal crash on Play fixed (round minimap drew with no texture; found by the build robot).
  Build robot running on David's laptop with the real Unreal files.
- 2026-10-28: phones: tutorial opens big in the middle, then tucks to the right; compact job card;
  road kept clear; full screen / Add to Home Screen.
- 2026-10-28: Arcade pause (button, P/Esc, auto-pause), garage car pictures + 3D preview, near misses
  need a dodge, live Arcade HUD, Subway Surfers-style power-ups, more Arcade money/XP.
- 2026-10-27: Arcade lane-block fix, original car designs, Shift Classic + Stellato 12, music + sounds,
  mission types + passengers, leaderboards, mobile layout, portal builds, launch guide.
