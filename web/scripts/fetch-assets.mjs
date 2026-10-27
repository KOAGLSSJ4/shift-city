// Downloads the third-party assets used by Shift City into public/assets.
// All sources are CC0 (Poly Haven) — see ASSETS.md for credits. Cars are original procedural designs.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const PH = 'https://dl.polyhaven.org/file/ph-assets';
const tex = (id, map) => [`public/assets/textures/${id}_${map}.jpg`, `${PH}/Textures/jpg/1k/${id}/${id}_${map}_1k.jpg`];
const ASSETS = [
  ['public/assets/hdri/sky_2k.hdr', `${PH}/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr`],
  ['public/assets/hdri/sky_1k.hdr', `${PH}/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr`],
  ['public/assets/hdri/sunset_1k.hdr', `${PH}/HDRIs/hdr/1k/belfast_sunset_puresky_1k.hdr`],
  ['public/assets/hdri/sunset_2k.hdr', `${PH}/HDRIs/hdr/2k/belfast_sunset_puresky_2k.hdr`],
  ['public/assets/hdri/night_1k.hdr', `${PH}/HDRIs/hdr/1k/kloppenheim_07_puresky_1k.hdr`],
  ['public/assets/hdri/night_2k.hdr', `${PH}/HDRIs/hdr/2k/kloppenheim_07_puresky_2k.hdr`],
  ...['asphalt_02', 'concrete_pavers_02', 'concrete_wall_008', 'brick_wall_02'].flatMap((id) =>
    ['diff', 'nor_gl', 'rough'].map((m) => tex(id, m))),
];

for (const [path, url] of ASSETS) {
  try { await access(path); console.log('have', path); continue; } catch {}
  const res = await fetch(url);
  if (!res.ok) { console.error('FAILED', res.status, url); process.exitCode = 1; continue; }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log('got ', path);
}
