# Shift City backlog

Ideas, bugs and tweaks to do later. Add anything here (David or Claude) and we pick from it when there's time.
Items Claude suggested (rather than David) are marked as such.
Newest at the top of each section. When something is fixed, move it to **Done** with the date.

## Bugs

- *(none known yet. Add what you spot while playing.)*

## Tweaks

- **Arcade near misses:** only reward *close* dodges, not every dodge. Right now any lane change past a
  car that was coming at you counts. Idea: only count it if you changed lanes late (car within ~10 m)
  or passed very close. (David, 2026-10-28)
- **Arcade balance:** David thinks money/XP feel right but hasn't tested it hard. Revisit if launch
  feedback says Arcade out-earns the city modes ($8 per 100 points, 1 XP per 1,000 points, no cap).
- **Garage:** the HUD (tutorial card, minimap, buttons) still shows over the 3D car preview; hide it while
  the garage is open.
- **Cockpit view** of the new lofted cars is functional but plain (dash, pillars); could use more detail.

## Features (next up)

- **Declines that matter, like the real Uber app** (David, 2026-10-28). Being built on branch
  `feature/driver-app`, not on `main` until David says. Ideas:
  - acceptance rate shown on the driver card; declining (or letting a request time out) lowers it;
  - offers expire after ~15 s like the real app;
  - decline 3 in a row and you're taken offline for a short cool-down;
  - driver tiers (like Uber Pro: Blue, Gold, Platinum, Diamond) from trips, acceptance rate and rating,
    giving fare bonuses and access to premium and VIP passengers.
- **Car radio** (David, 2026-10-28):
  - switch songs and stations while driving (e.g. Chill, Hype, Lo-fi, Talk/News, Off), with a small
    radio control on the HUD (keyboard shortcut + touch button) and the station name popping up when
    you change it;
  - **creator songs:** David can add his own tracks. Simplest version: drop MP3s into
    `web/public/music/<station>/` and list them in one data file (title, artist, station, licence),
    and they ship with the next build. Later, maybe a private upload page on the Vercel site (needs file
    storage, e.g. Vercel Blob). Only use music David has the rights to; credits screen updates
    automatically;
  - **music affects the ride:** each passenger personality has taste. The party passenger tips more
    on Hype, the quiet one wants it calm or off, the grumpy one hates loud music, the tourist likes
    local talk radio. Shows up in their speech bubbles ("Ooh, I love this song!") and in tips/stars.
    Arcade could get its own high-energy station.
- **More Uber-app features** (David, 2026-10-28), candidates:
  - quests ("complete 5 trips → +$20") and streak bonuses;
  - surge zones shown on the minimap;
  - earnings screen (today / this week, per-trip breakdown, cash out);
  - rider cancellations with a cancellation fee;
  - waiting-time fee at pickup;
  - airport queue;
  - stacked / batched food orders;
  - rider compliments and badges;
  - destination filter ("only trips towards home").
- **More complicated roads** (David, 2026-10-28): curves, roundabouts, a highway or ring road, one-way
  streets, bridges, junctions that aren't all right angles. Needs the road network, GPS routing, traffic
  AI and the city generator (web and Unreal) to support non-grid roads.
- **Story v1.1, "The Week":** FT Uber Game-style story. Comic-panel cutscenes, evening choices, stats
  (money, rating, energy) that change the driving, about 4 endings (more good than bad), city characters,
  no personal/family storyline. Start after launch feedback. (Agreed 2026-10-27)
- Power-up upgrades (longer magnet/shield etc. bought with coins), like Subway Surfers. (Claude's suggestion; David likes it)
- Daily challenge / daily reward to bring players back. (Claude's suggestion; David likes it)

## Launch / business

- Launch on your site (Vercel), itch.io and CrazyGames: steps in `web/LAUNCH.md`.
- Optional: connect Upstash in Vercel for the World leaderboard.
- Poki: undecided (exclusive vs non-exclusive, maybe after Steam).

## Not yet checked on real devices

- Touch controls and layout on a real phone.
- Real ads on CrazyGames (only shows once they publish the game).

## Unreal

- Test the last push: Play screenshot + the Output Log line `[ShiftCity] traffic: spawned N cars using M car model(s)`.
- **Bug:** traffic cars are invisible in David's own Play too (David, 2026-10-28; crash fix confirmed working, HUD +
  minimap fine). The robot now saves in-game screenshots and logs the first traffic car's mesh/position to chase it.
- Next batch: main menu + garage + goals + settings.

## Done

- 2026-10-28: Unreal crash on Play fixed (round minimap drew with no texture; found by the build robot).
  Build robot running on David's laptop with the real Unreal files.
- 2026-10-28: phones: tutorial opens big in the middle, then tucks to the right; compact job card;
  road kept clear; full screen / Add to Home Screen.
- 2026-10-28: Arcade pause (button, P/Esc, auto-pause), garage car pictures + 3D preview, near misses
  need a dodge, live Arcade HUD, Subway Surfers-style power-ups, more Arcade money/XP.
- 2026-10-27: Arcade lane-block fix, original car designs, Shift Classic + Stellato 12, music + sounds,
  mission types + passengers, leaderboards, mobile layout, portal builds, launch guide.
