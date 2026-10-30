// Exports every car design as mesh data for the Unreal version (built there as procedural meshes).
// Run: npx vite-node scripts/export-cars.ts ../unreal/Plugins/ShiftCityCore/Data/Cars
//
// One file per body type and detail level: <body>_hi.bin (player car, with interior) and <body>_lo.bin
// (traffic). Positions are already in Unreal space: centimetres, X forward, Y right, Z up, ground at Z 0,
// body centred between the axles. Wheel sections are in wheel space (centre at 0, rim facing -Y = left).
//
// File = u32 uncompressed size + zlib block holding (little-endian): "SCC2", u32 sectionCount, then per section:
//   u32 part (0 body, 1 wheel), u32 flags (1 paint, 2 glass, 4 two-sided, 8 tail light, 16 lamp),
//   f32 r g b metallic roughness, f32 emissive r g b, f32 opacity clearcoat,
//   u32 vertexCount, u32 indexCount, i16 positions[3n] (millimetres), i8 normals[3n] (x127), u32 indices[m]
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import * as THREE from 'three';
import { VEHICLES, type BodyType } from '../src/data/vehicles';
import { buildProceduralCar } from '../src/vehicles/CarFactory';

// the player car's in-car screens make canvases; a stub is enough because nothing is drawn at build time
(globalThis as unknown as { document: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

const out = process.argv[2] ?? 'export/cars';
mkdirSync(out, { recursive: true });

interface Section { part: number; mat: THREE.Material; pos: number[]; nrm: number[]; idx: number[] }

function toUnreal(v: THREE.Vector3) { return [v.z * 100, -v.x * 100, v.y * 100]; }

function addMesh(sections: Map<string, Section>, part: number, mesh: THREE.Mesh, toLocal: THREE.Matrix4) {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mat) || !mesh.geometry.attributes.position) return;
  const key = `${part}:${mat.uuid}`;
  if (!sections.has(key)) sections.set(key, { part, mat, pos: [], nrm: [], idx: [] });
  const s = sections.get(key)!;
  const g = mesh.geometry.attributes.normal ? mesh.geometry : mesh.geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const m = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const flip = mat.side === THREE.BackSide !== m.determinant() < 0; // inside faces and mirrored parts: reverse winding
  const lift = mat.polygonOffset ? 0.003 : 0; // decals sit 3 mm proud of the panel instead of using depth bias
  const P = g.attributes.position, N = g.attributes.normal;
  const base = s.pos.length / 3;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    if (mat.side === THREE.BackSide) n.negate();
    p.fromBufferAttribute(P, i).applyMatrix4(m).addScaledVector(n, lift);
    s.pos.push(...toUnreal(p));
    s.nrm.push(n.z, -n.x, n.y);
  }
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: P.count }, (_, i) => i);
  for (let i = 0; i + 2 < index.length; i += 3) {
    if (flip) s.idx.push(base + index[i], base + index[i + 2], base + index[i + 1]);
    else s.idx.push(base + index[i], base + index[i + 1], base + index[i + 2]);
  }
}

function exportBody(body: BodyType, color: number, detail: boolean) {
  const rig = buildProceduralCar(body, color, { detail, photoreal: true });
  rig.root.updateMatrixWorld(true);
  const sections = new Map<string, Section>();
  const pivots = new Set(rig.wheels.map((w) => w.parent!));
  const identity = new THREE.Matrix4();
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let a = mesh.parent; a; a = a.parent) if (pivots.has(a)) return; // wheels are exported once below
    // the inside lining of the roof and pillars sits exactly on the paint: Unreal's two-sided car material would
    // show both and they flicker through each other (no cockpit camera in Unreal yet, so it isn't needed)
    if ((mesh.material as THREE.Material).side === THREE.BackSide) return;
    addMesh(sections, 0, mesh, identity);
  });
  // one wheel (front left in three = front left in Unreal), in its own space
  const wheel = rig.wheels[0], pivot = wheel.parent!;
  const toWheel = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  wheel.traverse((o) => { if ((o as THREE.Mesh).isMesh) addMesh(sections, 1, o as THREE.Mesh, toWheel); });
  pivot.children.filter((c) => c !== wheel).forEach((c) => c.traverse((o) => { if ((o as THREE.Mesh).isMesh) addMesh(sections, 1, o as THREE.Mesh, toWheel); }));

  const list = [...sections.values()].filter((s) => s.idx.length > 0);
  const size = 8 + list.reduce((t, s) => t + 4 * (2 + 10 + 2) + 2 * s.pos.length + s.nrm.length + 4 * s.idx.length, 0);
  const buf = Buffer.alloc(size);
  let o = 0;
  buf.write('SCC2', o, 'ascii'); o += 4;
  buf.writeUInt32LE(list.length, o); o += 4;
  for (const s of list) {
    const m = s.mat as THREE.MeshPhysicalMaterial;
    const flags = (m === rig.paint ? 1 : 0) | (m.transparent ? 2 : 0) | (m.side === THREE.DoubleSide ? 4 : 0) | (m === rig.brakeLights ? 8 : 0)
      | ((m.emissiveIntensity ?? 0) > 1 && m !== rig.brakeLights ? 16 : 0);
    const c = m.color ?? new THREE.Color(0.5, 0.5, 0.5);
    // in-car screens are canvas textures in the browser: a faint glow stands in for them
    const e = m.emissiveMap ? new THREE.Color(0.02, 0.05, 0.07) : (m.emissive ?? new THREE.Color(0, 0, 0)).clone().multiplyScalar(m.emissiveIntensity ?? 1);
    buf.writeUInt32LE(s.part, o); o += 4;
    buf.writeUInt32LE(flags, o); o += 4;
    for (const f of [c.r, c.g, c.b, m.metalness ?? 0, m.roughness ?? 0.5, e.r, e.g, e.b, m.transparent ? m.opacity : 1, m.clearcoat ?? 0]) { buf.writeFloatLE(f, o); o += 4; }
    buf.writeUInt32LE(s.pos.length / 3, o); o += 4;
    buf.writeUInt32LE(s.idx.length, o); o += 4;
    for (const f of s.pos) { buf.writeInt16LE(Math.round(f * 10), o); o += 2; }
    for (const f of s.nrm) { buf.writeInt8(Math.round(f * 127), o); o += 1; }
    for (const i of s.idx) { buf.writeUInt32LE(i, o); o += 4; }
  }
  const file = `${body}_${detail ? 'hi' : 'lo'}.bin`;
  const head = Buffer.alloc(4); head.writeUInt32LE(size, 0);
  const packed = Buffer.concat([head, deflateSync(buf, { level: 9 })]);
  writeFileSync(join(out, file), packed);
  rig.dispose();
  const fl = rig.wheels[0].parent!.position, rl = rig.wheels[2].parent!.position;
  return { file, tris: list.reduce((t, s) => t + s.idx.length / 3, 0), sections: list.length, kb: Math.round(packed.length / 1024),
    meta: { wheelBase: (fl.z - rl.z) * 100, track: Math.abs(fl.x) * 200, wheelRadius: rig.wheelRadius * 100, length: rig.length * 100, width: rig.width * 100 } };
}

const bodies = [...new Set(VEHICLES.map((v) => v.body))];
const index: Record<string, unknown> = {};
for (const body of bodies) {
  const color = VEHICLES.find((v) => v.body === body)!.color;
  const hi = exportBody(body, color, true), lo = exportBody(body, color, false);
  index[body] = { hi: hi.file, lo: lo.file, ...hi.meta };
  console.log(`${body}: hi ${hi.tris} tris / ${hi.sections} sections / ${hi.kb} KB, lo ${lo.tris} tris / ${lo.kb} KB`);
}
writeFileSync(join(out, 'cars.json'), JSON.stringify({ cars: index }, null, 2) + '\n');
console.log('exported to', out);
