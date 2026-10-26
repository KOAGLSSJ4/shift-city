# Shift City (K Studios)

A rideshare, delivery and arcade driving game with a career, garage and shared economy.

| Folder | What it is | Who it's for |
|---|---|---|
| [`web/`](web/) | Browser version: Three.js + TypeScript, plays from a link | Free taster, fast gameplay prototyping |
| [`unreal/`](unreal/) | Unreal Engine 5 version: hyper-real graphics, PC/Steam | The paid game |

Both versions share one set of game data (cars, prices, story, goals) defined in `web/src/data`.
To copy changes into Unreal, run from `web/`:

```
npm run export-unreal-data
```

- Browser: see `web/README.md` (`npm install`, `npm run fetch-assets`, `npm run dev`).
- Unreal: see `unreal/docs/SETUP.md`.
- Third-party assets and licences: `web/ASSETS.md`. Real-brand placeholder cars must be replaced before any public or paid release.
