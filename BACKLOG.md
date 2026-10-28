# Shift City backlog

Ideas, bugs and tweaks to do later. Add anything here (David or Claude) and we pick from it when there's time.
Newest at the top of each section. When something is fixed, move it to **Done** with the date.

## Bugs

- *(none known yet. Add what you spot while playing.)*

## Tweaks

- **Arcade near misses:** only reward *close* dodges, not every dodge. Right now any lane change past a
  car that was coming at you counts. Idea: only count it if you changed lanes late (car within ~10 m)
  or passed very close. (David, 2026-10-28)
- **Arcade balance:** check money/XP after real play. Arcade now pays $8 per 100 points and 1 XP per
  1,000 points (no cap); make sure it doesn't out-earn the city modes too much.
- **Garage:** the HUD (tutorial card, minimap, buttons) still shows over the 3D car preview; hide it while
  the garage is open.
- **Cockpit view** of the new lofted cars is functional but plain (dash, pillars); could use more detail.

## Features (next up)

- **Story v1.1, "The Week":** FT Uber Game-style story. Comic-panel cutscenes, evening choices, stats
  (money, rating, energy) that change the driving, about 4 endings (more good than bad), city characters,
  no personal/family storyline. Start after launch feedback. (Agreed 2026-10-27)
- Power-up upgrades (longer magnet/shield etc. bought with coins), like Subway Surfers.
- Daily challenge / daily reward to bring players back.

## Launch / business

- Launch on your site (Vercel), itch.io and CrazyGames: steps in `web/LAUNCH.md`.
- Optional: connect Upstash in Vercel for the World leaderboard.
- Poki: undecided (exclusive vs non-exclusive, maybe after Steam).

## Not yet checked on real devices

- Touch controls and layout on a real phone.
- Real ads on CrazyGames (only shows once they publish the game).

## Unreal

- Test the last push: Play screenshot + the Output Log line `[ShiftCity] traffic: spawned N cars using M car model(s)`.
- Decide on the "build robot" (GitHub runner on David's laptop that compiles the C++ on every push).
- Next batch: main menu + garage + goals + settings.

## Done

- 2026-10-28: Arcade pause (button, P/Esc, auto-pause), garage car pictures + 3D preview, near misses
  need a dodge, live Arcade HUD, Subway Surfers-style power-ups, more Arcade money/XP.
- 2026-10-27: Arcade lane-block fix, original car designs, Shift Classic + Stellato 12, music + sounds,
  mission types + passengers, leaderboards, mobile layout, portal builds, launch guide.
