// Builds every launch target and zips the portal uploads into release/.
//   node scripts/release.mjs            → all targets
//   node scripts/release.mjs poki itch  → just those
// web: own site (Vercel deploys it itself; built here only as a check)
// itch / crazygames / poki: zip with index.html at the root, ready to upload.
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALL = ['web', 'itch', 'crazygames', 'poki'];
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const root = resolve(import.meta.dirname, '..');
const outRoot = join(root, 'release');
mkdirSync(outRoot, { recursive: true });

const size = (p) => {
  const st = statSync(p);
  return st.isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : st.size;
};
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

for (const t of targets) {
  if (!ALL.includes(t)) throw new Error(`unknown target ${t}`);
  process.env.VITE_TARGET = t;
  const outDir = join(outRoot, t);
  rmSync(outDir, { recursive: true, force: true });
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  // the dev-only car studio never ships
  rmSync(join(outDir, 'dev'), { recursive: true, force: true });
  if (t !== 'web') {
    const zip = join(outRoot, `shift-city-${t}.zip`);
    rmSync(zip, { force: true });
    execFileSync('zip', ['-qr9', zip, '.'], { cwd: outDir });
    console.log(`${t.padEnd(11)} ${mb(size(outDir))} unpacked → ${mb(statSync(zip).size)} zip  (${zip})`);
  } else console.log(`${t.padEnd(11)} ${mb(size(outDir))}`);
}
