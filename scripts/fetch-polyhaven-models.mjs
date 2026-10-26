// Downloads source glTF models (1k textures) from Poly Haven (CC0) into a cache directory.
// Usage: node scripts/fetch-polyhaven-models.mjs <outDir> id1 id2 ...
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [out, ...ids] = process.argv.slice(2);
for (const id of ids) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf['1k'].gltf;
  const all = [[`${id}.gltf`, g.url], ...Object.entries(g.include).map(([p, v]) => [p, v.url])];
  for (const [rel, url] of all) {
    const dest = join(out, id, rel);
    try { await access(dest); continue; } catch {}
    const res = await fetch(url);
    if (!res.ok) { console.error('FAILED', url); process.exitCode = 1; continue; }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  console.log('got', id);
}
