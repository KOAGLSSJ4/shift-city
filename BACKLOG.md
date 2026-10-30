# Shift City backlog

Ideas, bugs and tweaks to do later. Add anything here (David or Claude) and we pick from it when there's time.
Items Claude suggested (rather than David) are marked as such.
Newest at the top of each section. When something is fixed, move it to **Done** with the date.

## Bugs

- *(none known yet. Add what you spot while playing.)*

## Tweaks

- **Arcade balance:** David thinks money/XP feel right but hasn't tested it hard. Revisit if launch
  feedback says Arcade out-earns the city modes ($8 per 100 points, 1 XP per 1,000 points, no cap).
- **Cockpit view:** the Shift Classic's cabin now has a proper dashboard and dark pillars, but a strip of body paint
  still shows at the very top and bottom of the screen (its body is built from solid blocks); the lofted cars'
  cockpits could use more detail (vents, console, door cards).

## Features (next up)

- **Radio later:** a private upload page on the Vercel site for creator songs (needs file storage, e.g. Vercel Blob);
  a Talk/News station (needs voice recordings). For now, add songs via `web/src/data/radio.ts`.
- **More Uber-app features** (David, 2026-10-28), candidates:
- Dynamic time/weather in Unreal (needs Unreal time of day + weather first, see port list).
- **More complicated roads** (David, 2026-10-28). Part 1+2 built on branch `feature/roads` (not live until David
  says): four mini roundabouts (islands, traffic circles them and gives way, GPS "take the 2nd exit") and two
  one-way streets (arrows, traffic + GPS obey them), and a ring road round the city with an airport and an
  airport queue (roads can now curve). Still to do: bridges, curved/diagonal streets inside the city, and the
  Unreal port.
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

- **Highways** (David, 2026-10-30, for later; web + Unreal): multi-lane highway with on/off ramps, a bridge or
  flyover over the streets, faster traffic and merging, GPS routing onto it. Do after the street port.
- **Port the complex streets** (roundabouts, one-way, ring road, airport + queue) from web to Unreal.
- **One game, two editions** (David, 2026-10-30: NOT yet, only once it's on Steam): web = Lite graphics, Unreal PC
  download = Ultra graphics, same game, shared account/cloud save.
- **HUD design pass, part 2** (David, 2026-10-28). Done: money/level panel, job card, story card and toasts
  are rounded Slate panels like the menu. Still to do:
  - animations: cards slide/fade in, money counts up when paid.
- Unreal Story should be The Week too (port `data/week.ts` + comic panels); its menu still runs the old 5 chapters.

## Done

- 2026-10-30: Time of day + weather are always dynamic in the city (no player setting); Arcade Rush is always a
  dry day.
- 2026-10-30: Realism pass: Unreal photo look (TSR anti-aliasing, sharpen, Lumen reflection/GI quality, bloom,
  vignette, AO); every car gets wheel nuts + centre caps, "SHIFT CITY" tyre lettering, wipers, exhaust tips (everyday
  cars), side repeaters, rear badge, "SC 207" plates, chrome-reflector headlights; Unreal brake lights glow when braking.
- 2026-10-30: Car detail pass: door/bonnet/tailgate shut lines and fuel flaps on every car, tyre tread grooves,
  projector/LED headlights on the Kite Pico and Lumen, clean lower intakes, pristine gloss paint (no flake, David's call).
- 2026-10-30: Unreal trees have leaves in the game (material usage flags), traffic lights keep their colours, no
  flickering inner lining on the cars, glossier paint, chase camera set per car.
- 2026-10-30: Unreal garage cars are our designs (body, wheels, handling per car + upgrades), traffic too; the
  template sports car is the Furia V12. Starter cars reshaped (Classic, Kite Pico, Lumen).
- 2026-10-30: The Week is now the Story (old 5-chapter story left the web menu); endings aren't counted or hinted,
  players discover them.
- 2026-10-30: Merged to `main`: Unreal Garage/Goals/Settings screens (robot-tested), Story v1.1 "The Week",
  roundabouts + one-way streets + ring road + airport queue.
- 2026-10-30: Shift Classic cockpit: full-width dashboard that hides the bonnet, screens raised, dark windscreen
  pillars and headliner (it showed bright body paint everywhere before).
- 2026-10-30: Unreal HUD part 2a: our own Slate speedometer (km/h + D/R/N; the template's widget is hidden),
  minimap rim with a soft shadow, solid car arrow, brighter route line.
- 2026-10-30: stacked food orders: about 1 in 5 standard deliveries has a second drop-off nearby (shown on the
  offer, paid together at the end).
- 2026-10-30: waiting-time fee: 1 in 4 riders/kitchens keep you waiting 8-30 s at pickup; after 8 s you earn
  $0.20/s, shown live on the boarding ring and paid at drop-off.
- 2026-10-30: "Dynamic" time of day + weather in Settings (web): day → golden hour → night → dawn over ~15 min,
  showers in about a third of 10-min slots then wet roads, rides pay 20% more in the rain, a note on each change.
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
