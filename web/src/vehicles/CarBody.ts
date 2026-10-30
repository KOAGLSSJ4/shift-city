// Lofted car bodies. A design is a handful of curves (side profile, underside, plan width, roofline);
// the body is swept as rounded cross-sections along the car, so surfaces are smooth instead of
// extruded slabs. Lights, grilles and intakes are projected onto the surface like decals, so every
// design can have its own face without hand-modelled meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Pts = [number, number][];
export type Face = 'front' | 'rear' | 'side' | 'top';
export type PartKey =
  | 'paint' | 'roof' | 'glass' | 'black' | 'trim' | 'chrome' | 'decal' | 'head' | 'lens' | 'tail'
  | 'accent' | 'carbon' | 'plate' | 'liner' | 'tire' | 'rim' | 'cabin';

export interface RimStyle {
  /** Spoke centre angles (radians). */
  spokes: number[];
  /** Spoke width in metres. */
  width: number;
  /** Hub radius as a fraction of the rim radius. */
  hub?: number;
}

export interface CarDesign {
  L: number; W: number; H: number; wb: number; wr: number;
  tireW?: number;
  /** Rim radius as a fraction of the wheel radius. */
  rim?: number;
  rimStyle: RimStyle;
  rimColor: number;
  /** Brake caliper colour. */
  accent: number;
  // body (z points forward, 0 = middle of the car)
  top: Pts; bottom: Pts; hw: Pts;
  /** Height of the widest point between bottom (0) and top (1). */
  waist: number;
  /** Superellipse exponents of the upper and lower body (2 = round, higher = boxier). */
  nTop: number; nBot: number;
  /** How much the upper body leans in. */
  tumble: number;
  /** Extra half-width over each axle (wheel-arch haunches). */
  fender?: number;
  /** Below this height the body is matte black cladding. */
  cladY?: number;
  // greenhouse
  roof: Pts;
  /** Glasshouse half-width at the belt as a fraction of the body. */
  gw: number;
  gTumble: number;
  /** Superellipse exponent of the glasshouse section (3 = bubble, 5 = boxy). */
  gn?: number;
  roofF: number; roofR: number;
  roofStyle: 'paint' | 'black' | 'glass';
  bPillar?: number;
  cPillar: number;
  /** With a D pillar the C pillar becomes a black band and the rear quarter gets a window. */
  dPillar?: number;
  chromeTrim?: boolean;
  details(k: Kit): void;
}

/** Monotone cubic interpolation (no overshoot) through points sorted by x. */
export function curve(pts: Pts): (x: number) => number {
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d: number[] = [], m: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

interface Section { hw: number; top: number; bot: number; yw: number }

/** Analytic body surface: cross-sections, surface queries and the swept meshes. */
export class BodyShape {
  readonly top: (z: number) => number;
  readonly bot: (z: number) => number;
  readonly hwC: (z: number) => number;
  readonly roof: (z: number) => number;
  readonly zMin: number; readonly zMax: number;
  readonly gz0: number; readonly gz1: number;
  readonly xIn: number;

  constructor(readonly d: CarDesign) {
    this.top = curve(d.top); this.bot = curve(d.bottom); this.hwC = curve(d.hw); this.roof = curve(d.roof);
    this.zMin = -d.L / 2; this.zMax = d.L / 2;
    this.gz0 = d.roof[0][0]; this.gz1 = d.roof[d.roof.length - 1][0];
    this.xIn = d.W / 2 - 0.06 - (d.tireW ?? 0.24);
    const ra = d.wr + 0.06;
    for (const a of [d.wb / 2, -d.wb / 2]) {
      const s = this.section(a), x = this.xIn + 0.12;
      const y = Math.abs(x) <= s.hw ? this.topAtX(a, x)! : s.yw;
      const v = (y - s.yw) / Math.max(1e-3, s.top - s.yw);
      // lift needed at that x so the arch keeps ~6 cm of metal above the tyre (bump scales with v)
      this.fenderUp.push([a, Math.max(0, d.wr + ra + 0.06 - y) / Math.max(0.3, v)]);
    }
  }
  readonly fenderUp: [number, number][] = [];

  section(z: number): Section {
    const d = this.d;
    let hw = this.hwC(z), top = this.top(z), bot = this.bot(z);
    for (const a of [d.wb / 2, -d.wb / 2]) hw += (d.fender ?? 0) * Math.exp(-(((z - a) / 0.6) ** 2));
    // rounded bumper edges: the last few centimetres pull in toward a blunt face
    const s = Math.min(z - this.zMin, this.zMax - z), r = 0.1;
    if (s < r) {
      const q = 1 - Math.sqrt(Math.max(0, 1 - (1 - s / r) ** 2));
      const h = top - bot;
      hw *= 1 - 0.3 * q; top -= h * 0.12 * q; bot += h * 0.12 * q;
    }
    return { hw, top, bot, yw: bot + this.d.waist * (top - bot) };
  }

  /** Body half-width at height y in a cross-section (-1 if y is outside it). */
  halfWidthAt(s: Section, y: number) {
    const d = this.d;
    if (y > s.top || y < s.bot) return -1;
    if (y >= s.yw) {
      const v = (y - s.yw) / Math.max(1e-4, s.top - s.yw);
      return s.hw * Math.pow(Math.max(0, 1 - Math.pow(v, d.nTop)), 1 / d.nTop) * (1 - d.tumble * v * v);
    }
    const v = (s.yw - y) / Math.max(1e-4, s.yw - s.bot);
    return s.hw * Math.pow(Math.max(0, 1 - Math.pow(v, d.nBot)), 1 / d.nBot);
  }

  /** Half-width of the glasshouse where it meets the body. */
  glassHalfWidth(z: number) {
    const s = this.section(z);
    return this.d.gw * this.halfWidthAt(s, Math.max(s.yw, s.top - 0.06));
  }

  /** Haunch lift at (z, x) for a point at the very top of the section (scaled by height above the waist). */
  lift(z: number, x: number) {
    const w = THREE.MathUtils.smoothstep(Math.abs(x), this.xIn - 0.25, this.xIn + 0.05);
    if (w === 0) return 0;
    let up = 0;
    for (const [a, u] of this.fenderUp) up += u * Math.exp(-(((z - a) / 0.62) ** 2));
    return up * w;
  }

  inside(x: number, y: number, z: number) {
    const s = this.section(z);
    if (y > s.yw) { const T = s.top - s.yw, U = this.lift(z, x); y = s.yw + (y - s.yw) / (1 + U / Math.max(1e-3, T)); }
    return Math.abs(x) <= this.halfWidthAt(s, y);
  }

  /** Outer x of the body side at (z, y), including the haunch lift. */
  sideX(z: number, y: number) {
    // scan in from outside: with raised haunches the body can be taller at the side than in the middle
    let hi = this.section(z).hw + 0.05, lo = hi;
    while (lo > 0 && !this.inside(lo, y, z)) lo -= 0.01;
    if (lo <= 0) return 0;
    hi = lo + 0.01;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (this.inside(m, y, z)) lo = m; else hi = m; }
    return lo;
  }

  /** Height of the upper surface at (x, z), or null if x is outside the body there. */
  topAtX(z: number, x: number): number | null {
    const s = this.section(z);
    if (Math.abs(x) > s.hw) return null;
    let lo = s.yw, hi = s.top;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (this.halfWidthAt(s, m) >= Math.abs(x)) lo = m; else hi = m; }
    return lo + this.lift(z, x) * (lo - s.yw) / Math.max(1e-3, s.top - s.yw);
  }

  /** z of the outer surface hit by a ray along -z (front) or +z (rear) through (x, y). */
  endZ(x: number, y: number, front: boolean): number {
    const dir = front ? -1 : 1, start = front ? this.zMax : this.zMin;
    for (let t = 0; t < 1.6; t += 0.01) {
      const z = start + dir * t;
      if (this.inside(x, y, z)) {
        let a = z - dir * 0.01, b = z; // a outside, b inside
        for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (this.inside(x, y, m)) b = m; else a = m; }
        return b;
      }
    }
    return start + dir * 1.6;
  }

  /** Swept body: paint, underbody and optional cladding, plus wheel-arch liners. */
  bodyParts(S: number, M: number): Partial<Record<PartKey, THREE.BufferGeometry>> {
    const d = this.d;
    const pos: number[] = [], idx: number[] = [];
    // uniform stations plus dense ones through the wheel arches so the cut-out edge stays round
    const zs: number[] = [];
    for (let i = 0; i < S; i++) zs.push(this.zMin + ((this.zMax - this.zMin) * i) / (S - 1));
    const ra0 = d.wr + 0.06, step = S > 60 ? 0.012 : 0.04;
    for (const a of [d.wb / 2, -d.wb / 2]) for (let z = a - ra0 - 0.02; z <= a + ra0 + 0.02; z += step) zs.push(z);
    zs.sort((p, q) => p - q);
    for (let i = zs.length - 1; i > 0; i--) if (zs[i] - zs[i - 1] < 0.004) zs.splice(i, 1);
    S = zs.length;
    for (let i = 0; i < S; i++) {
      const z = zs[i];
      const s = this.section(z);
      for (let j = 0; j < M; j++) {
        const th = (j / M) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const n = sn >= 0 ? d.nTop : d.nBot;
        const hh = sn >= 0 ? s.top - s.yw : s.yw - s.bot;
        const v = Math.pow(Math.abs(sn), 2 / n);
        let x = s.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        if (sn > 0) x *= 1 - d.tumble * v * v;
        let y = s.yw + Math.sign(sn) * hh * v;
        // raised wheel-arch haunches wherever the tyre would otherwise poke through the top
        if (sn > 0) {
          y += this.lift(z, x) * v;
        }
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M), c = a + M, e = b + M;
      idx.push(a, b, c, b, e, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // wheel arches: cut after the normals so the body sides keep their smooth shading
    const p = g.attributes.position as THREE.BufferAttribute;
    const ra = d.wr + 0.06;
    const clamped = new Uint8Array(p.count);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (Math.abs(x) < this.xIn) continue;
      for (const a of [d.wb / 2, -d.wb / 2]) {
        const dz = z - a;
        if (Math.abs(dz) >= ra) continue;
        const archTop = d.wr + Math.sqrt(ra * ra - dz * dz);
        if (y < archTop) { p.setY(k, archTop); clamped[k] = 1; }
      }
    }
    const parts = splitByFace(g, (cx, cy, cz, a, b, c) => {
      const nc = clamped[a] + clamped[b] + clamped[c];
      if (nc === 3 || (nc && cy < d.wr + 0.12)) return 'liner'; // flat-sided bodies: faces half over the arch stay paint
      if (cy < this.bot(cz) + 0.03 && Math.abs(cx) < this.xIn + 0.05) return 'black';
      if (d.cladY !== undefined && cy < d.cladY) return 'trim';
      // the deck under the glasshouse is the cabin floor, seen through the windows
      if (cz > this.gz0 + 0.04 && cz < this.gz1 - 0.04 && cy > this.section(cz).yw && Math.abs(cx) < this.glassHalfWidth(cz) * 0.97) return 'cabin';
      return 'paint';
    }, true);
    // blunt end caps
    for (const [i, sign] of [[0, -1], [S - 1, 1]] as const) {
      const cap: number[] = [];
      let cx = 0, cy = 0;
      const z = p.getZ(i * M);
      for (let j = 0; j < M; j++) { cx += p.getX(i * M + j); cy += p.getY(i * M + j); }
      cx /= M; cy /= M;
      for (let j = 0; j < M; j++) {
        const a = i * M + j, b = i * M + ((j + 1) % M);
        const A = [p.getX(a), p.getY(a), z], B = [p.getX(b), p.getY(b), z];
        if (sign > 0) cap.push(cx, cy, z, ...A, ...B); else cap.push(cx, cy, z, ...B, ...A);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
      cg.computeVertexNormals();
      (parts.paint ??= []).push(cg);
    }
    // dark wheel-well liners so you can't see into the body through the arches
    const liners: THREE.BufferGeometry[] = [];
    for (const a of [d.wb / 2, -d.wb / 2]) for (const sx of [-1, 1]) {
      const sec = this.section(a);
      const len = Math.max(0.05, this.halfWidthAt(sec, d.wr + ra * 0.7) - 0.02 - this.xIn);
      const l = new THREE.CylinderGeometry(ra - 0.01, ra - 0.01, len, 18, 1, true, 0, Math.PI);
      l.rotateZ(Math.PI / 2);
      l.translate(sx * (this.xIn + len / 2), d.wr, a);
      liners.push(l);
      // inner wall: the arch-shaped plate the wheel sits against
      const wall = new THREE.Shape();
      const yb = sec.bot + 0.02 - d.wr;
      const a0 = Math.asin(THREE.MathUtils.clamp(yb / ra, -1, 1));
      wall.absarc(0, 0, ra, a0, Math.PI - a0, false);
      wall.closePath();
      const wg = new THREE.ShapeGeometry(wall, 12);
      wg.rotateY(Math.PI / 2); // (x, y) → (z, y) plane, facing +x
      wg.translate(sx * this.xIn, d.wr, a);
      liners.push(wg);
    }
    (parts.liner ??= []).push(...liners);
    // arch lips: a rolled edge along each wheel arch hides the stepped cut and reads as a fender flare
    const lips: THREE.BufferGeometry[] = [];
    for (const a of [d.wb / 2, -d.wb / 2]) for (const sx of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = -0.08 + (i / 24) * (Math.PI + 0.16);
        const z = a + Math.cos(t) * (ra + 0.01), y = d.wr + Math.sin(t) * (ra + 0.01);
        pts.push(new THREE.Vector3(sx * (this.sideX(z, Math.max(y, this.bot(z) + 0.03)) - 0.005), y, z));
      }
      lips.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.022, 8, false));
    }
    (parts[d.cladY !== undefined ? 'trim' : 'paint'] ??= []).push(...lips);
    return mergeParts(parts);
  }

  /** Swept glasshouse with pillars, roof panel and window trim picked out by region. */
  greenhouseParts(S: number, M: number): Partial<Record<PartKey, THREE.BufferGeometry>> {
    const d = this.d;
    const pos: number[] = [], idx: number[] = [], vth: number[] = [];
    // ring angles: uniform, plus a thin first/last band for the window seal
    const ths = [0, 0.02];
    for (let j = 1; j < M; j++) ths.push((j / M) * Math.PI);
    ths.push(Math.PI - 0.02, Math.PI);
    M = ths.length - 1;
    const rows: { gb: number; gt: number; xg: number }[] = [];
    for (let i = 0; i < S; i++) {
      const z = this.gz0 + ((this.gz1 - this.gz0) * i) / (S - 1);
      const s = this.section(z);
      const xg = this.glassHalfWidth(z);
      // sit the glass on the shoulder at that width, slightly sunk in so there is never a gap
      let lo = s.yw, hi = s.top;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (this.halfWidthAt(s, m) >= xg) lo = m; else hi = m; }
      const gb = lo - 0.012;
      const gt = Math.max(gb + 0.004, this.roof(z));
      rows.push({ gb, gt, xg });
      for (let j = 0; j <= M; j++) {
        const th = ths[j], c = Math.cos(th), sn = Math.sin(th);
        const gn = d.gn ?? 3, v = Math.pow(sn, 2 / gn);
        const x = xg * Math.sign(c) * Math.pow(Math.abs(c), 2 / gn) * (1 - d.gTumble * v);
        pos.push(x, gb + (gt - gb) * v, z);
        vth.push(Math.min(th, Math.PI - th));
      }
    }
    const R = M + 1;
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * R + j, b = a + 1, c = a + R, e = b + R;
      idx.push(a, b, c, b, e, c);
    }
    // close both ends (the windscreen base and the tail of the glass)
    for (const [i, sign] of [[0, -1], [S - 1, 1]] as const) {
      const base = pos.length / 3;
      const r = rows[i], z = pos[(i * R) * 3 + 2];
      pos.push(0, r.gb, z);
      vth.push(Math.PI / 2);
      for (let j = 0; j < M; j++) {
        const a = i * R + j, b = a + 1;
        if (sign > 0) idx.push(base, a, b); else idx.push(base, b, a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();

    const thR = 0.8, thA = thR - 0.12;
    const ring = S * R;
    const parts = splitByFace(g, (_cx, _cy, _cz, a, b, c) => {
      if (Math.max(a, b, c) >= ring) return 'trim';                              // end caps
      // classify whole quads (both triangles alike) so region edges are straight, not saw-toothed
      const m = Math.min(a, b, c), i0 = Math.floor(m / R), j0 = Math.min(a % R, b % R, c % R);
      const tm = (ths[j0] + ths[j0 + 1]) / 2, th = Math.min(tm, Math.PI - tm);
      const cz = (pos[(i0 * R) * 3 + 2] + pos[((i0 + 1) * R) * 3 + 2]) / 2;
      const side = th < thR;
      if (j0 === 0 || j0 === M - 1) return d.chromeTrim ? 'chrome' : 'trim';     // window seal
      if (cz <= d.roofF && cz >= d.roofR) {
        if (!side) return 'roof';
        if (th > thR - 0.05) return 'trim';                                     // drip rail
      }
      if (cz > d.roofF && side && th > thA) return 'paint';                      // A pillar
      if (side && d.bPillar !== undefined && Math.abs(cz - d.bPillar) < 0.045) return 'trim';
      if (side && d.dPillar !== undefined) {
        if (cz < d.dPillar) return 'paint';
        if (Math.abs(cz - d.cPillar) < 0.06) return 'trim';
      } else if (cz < d.cPillar && th < thR + 0.3) return 'paint'; // C pillars wrap round: the rear window sits between them
      return 'glass';
    });
    return mergeParts(parts);
  }
}

/** Splits an indexed mesh into non-indexed geometries keyed by each triangle's centre. */
function splitByFace(g: THREE.BufferGeometry, key: (x: number, y: number, z: number, a: number, b: number, c: number) => PartKey, pairs = false) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const idx = g.index!.array;
  const out: Partial<Record<PartKey, { p: number[]; n: number[] }>> = {};
  let last: PartKey = 'paint';
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    // with `pairs`, both triangles of a quad take the first one's key so region edges stay straight
    const k: PartKey = pairs && (t / 3) % 2 === 1 ? last : key((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3, a, b, c);
    last = k;
    const o = (out[k] ??= { p: [], n: [] });
    for (const v of [a, b, c]) { o.p.push(p.getX(v), p.getY(v), p.getZ(v)); o.n.push(n.getX(v), n.getY(v), n.getZ(v)); }
  }
  const res: Partial<Record<PartKey, THREE.BufferGeometry[]>> = {};
  for (const [k, o] of Object.entries(out) as [PartKey, { p: number[]; n: number[] }][]) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    res[k] = [sg];
  }
  return res;
}

/** Normalises geometries (non-indexed, position + normal only) so they can be merged. */
function clean(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) if (name !== 'position' && name !== 'normal') ng.deleteAttribute(name);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

export function mergeParts(parts: Partial<Record<PartKey, THREE.BufferGeometry[]>>) {
  const out: Partial<Record<PartKey, THREE.BufferGeometry>> = {};
  for (const [k, list] of Object.entries(parts) as [PartKey, THREE.BufferGeometry[]][]) {
    if (list.length) out[k] = mergeGeometries(list.map(clean))!;
  }
  return out;
}

// ---------- decals & detail kit ----------

/** Splits triangles (flat u,v list) until no edge is longer than maxEdge, so decals hug curved panels. */
function subdivide(tris: number[], maxEdge: number) {
  const out: number[] = [];
  const stack = [tris];
  const work: number[][] = [];
  for (let i = 0; i < tris.length; i += 6) work.push(tris.slice(i, i + 6));
  stack.length = 0;
  while (work.length) {
    const t = work.pop()!;
    const e = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(t[a * 2] - t[b * 2], t[a * 2 + 1] - t[b * 2 + 1]));
    const m = e.indexOf(Math.max(...e));
    if (e[m] <= maxEdge) { out.push(...t); continue; }
    const a = m, b = (m + 1) % 3, c = (m + 2) % 3;
    const mx = (t[a * 2] + t[b * 2]) / 2, my = (t[a * 2 + 1] + t[b * 2 + 1]) / 2;
    const A = [t[a * 2], t[a * 2 + 1]], B = [t[b * 2], t[b * 2 + 1]], C = [t[c * 2], t[c * 2 + 1]];
    work.push([...A, mx, my, ...C], [mx, my, ...B, ...C]);
  }
  return out;
}

function triangulate(contour: Pts) {
  const v = contour.map(([x, y]) => new THREE.Vector2(x, y));
  const faces = THREE.ShapeUtils.triangulateShape(v, []);
  const out: number[] = [];
  for (const f of faces) for (const i of f) out.push(v[i].x, v[i].y);
  return out;
}

export interface DecalOpts { mirror?: boolean; lift?: number; depth?: number }

/** Builds detail geometry for one design, collected per material slot. */
export class Kit {
  readonly parts: Partial<Record<PartKey, THREE.BufferGeometry[]>> = {};
  /** Decal triangles dropped because they fell off the body (a sign the design's coordinates need work). */
  skipped = 0;
  constructor(readonly b: BodyShape, readonly lod: 0 | 1) {}
  get d() { return this.b.d; }

  add(key: PartKey, g: THREE.BufferGeometry) { (this.parts[key] ??= []).push(g); }

  /** Projects 2D triangles onto a face of the body. Front/rear/top: (x, y|z); side: (z, y), both sides. */
  project(face: Face, tris: number[], key: PartKey, o: DecalOpts = {}) {
    const lift = o.lift ?? 0.006;
    const fine = subdivide(tris, this.lod === 0 ? 0.04 : 0.09);
    const variants = face === 'side' ? [1, -1] : o.mirror ? [1, -1] : [1];
    const out: number[] = [];
    const dir = face === 'front' ? [0, 0, 1] : face === 'rear' ? [0, 0, -1] : face === 'top' ? [0, 1, 0] : null;
    for (const m of variants) {
      for (let i = 0; i < fine.length; i += 6) {
        const tri: number[][] = [];
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const u = fine[i + k * 2], v = fine[i + k * 2 + 1];
          if (face === 'front' || face === 'rear') {
            const z = this.b.endZ(u, v, face === 'front');
            // a ray that runs far along the body means the decal hangs off the end face
            if (Math.abs(z - (face === 'front' ? this.b.zMax : this.b.zMin)) > (o.depth ?? 0.6)) { ok = false; this.skipped++; break; }
            tri.push([u * m, v, z + (face === 'front' ? lift : -lift)]);
          }
          else if (face === 'top') { const y = this.b.topAtX(v, u); if (y === null) { ok = false; break; } tri.push([u * m, y + lift, v]); }
          else { const w = this.b.halfWidthAt(this.b.section(u), v); if (w < 0) { ok = false; break; } tri.push([(w + lift) * m, v, u]); }
        }
        if (!ok) continue;
        const want = dir ?? [m, 0, 0];
        const [A, B, C] = tri;
        const n = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).cross(new THREE.Vector3(C[0] - A[0], C[1] - A[1], C[2] - A[2]));
        if (n.x * want[0] + n.y * want[1] + n.z * want[2] < 0) out.push(...A, ...C, ...B); else out.push(...A, ...B, ...C);
      }
    }
    if (!out.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    this.add(key, g);
  }

  poly(face: Face, pts: Pts, key: PartKey, o?: DecalOpts) { this.project(face, triangulate(pts), key, o); }

  /** A strip of constant width along a polyline (light bars, trim lines). */
  ribbon(face: Face, pts: Pts, width: number, key: PartKey, o?: DecalOpts) {
    const tris: number[] = [];
    const nrm = (i: number) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l * width / 2, dx / l * width / 2];
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], na = nrm(i), nb = nrm(i + 1);
      tris.push(ax - na[0], ay - na[1], bx - nb[0], by - nb[1], bx + nb[0], by + nb[1]);
      tris.push(ax - na[0], ay - na[1], bx + nb[0], by + nb[1], ax + na[0], ay + na[1]);
    }
    this.project(face, tris, key, o);
  }

  ellipse(face: Face, cx: number, cy: number, rx: number, ry: number, key: PartKey, o?: DecalOpts) {
    const pts: Pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    this.poly(face, pts, key, o);
  }

  rrect(face: Face, x0: number, y0: number, x1: number, y1: number, r: number, key: PartKey, o?: DecalOpts) {
    r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    const pts: Pts = [];
    const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
    this.poly(face, pts, key, o);
  }

  box(key: PartKey, w: number, h: number, dpt: number, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], mirror = false) {
    for (const m of mirror ? [1, -1] : [1]) {
      const g = new THREE.BoxGeometry(w, h, dpt);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1] * m, rot[2] * m)));
      g.translate(x * m, y, z);
      this.add(key, g);
    }
  }

  /** Cylinder along an axis (exhausts, struts). */
  cyl(key: PartKey, r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', mirror = false, seg = 16) {
    for (const m of mirror ? [1, -1] : [1]) {
      const g = new THREE.CylinderGeometry(r, r, len, seg);
      if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
      g.translate(x * m, y, z);
      this.add(key, g);
    }
  }

  /** Tube through 3D points (roof rails, chrome lines). */
  tube(key: PartKey, pts: [number, number, number][], r: number, mirror = false) {
    for (const m of mirror ? [1, -1] : [1]) {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x * m, y, z)));
      this.add(key, new THREE.TubeGeometry(c, this.lod === 0 ? 32 : 10, r, this.lod === 0 ? 8 : 4, false));
    }
  }

  /** Rear wing: aerofoil spanning the car at height y, centred at z, on two struts. */
  wing(key: PartKey, span: number, chord: number, y: number, z: number, strutH: number, strutX: number) {
    const s = new THREE.Shape();
    const t = chord * 0.12;
    // profile in (u = -z, v = y), leading edge forward
    s.moveTo(-chord / 2, 0);
    s.bezierCurveTo(-chord / 2, t * 1.4, chord * 0.1, t * 1.2, chord / 2, t * 0.5);
    s.lineTo(chord / 2, 0);
    s.bezierCurveTo(chord * 0.1, -t * 0.3, -chord / 2, -t * 0.4, -chord / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 8 });
    g.rotateY(Math.PI / 2);
    g.translate(-span / 2, y, z);
    this.add(key, g);
    for (const m of [1, -1]) {
      const plate = new THREE.BoxGeometry(0.02, t * 4 + 0.06, chord * 0.9);
      plate.translate(m * span / 2, y + t, z);
      this.add(key, plate);
      const strut = new THREE.BoxGeometry(0.025, strutH, chord * 0.35);
      strut.translate(m * strutX, y - strutH / 2, z + chord * 0.1);
      this.add(key, strut);
    }
  }
}

// ---------- wheels ----------

/** Rim face with spoke cut-outs, extruded so the spokes have depth. */
export function rimGeometry(style: RimStyle, rr: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rr, 0, Math.PI * 2, false);
  const hub = rr * (style.hub ?? 0.24), ro = rr * 0.86;
  const angles = [...style.spokes].sort((a, b) => a - b);
  for (let i = 0; i < angles.length; i++) {
    const a0 = angles[i], a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    const h = new THREE.Path();
    const sw = style.width / 2;
    const o0 = a0 + sw / ro, o1 = a1 - sw / ro, i0 = a0 + sw / hub * 0.6, i1 = a1 - sw / hub * 0.6;
    if (o1 <= o0 || i1 <= i0) continue;
    const ri = hub * 1.35;
    const n = 10;
    h.moveTo(Math.cos(o0) * ro, Math.sin(o0) * ro);
    for (let k = 1; k <= n; k++) { const a = o0 + (o1 - o0) * k / n; h.lineTo(Math.cos(a) * ro, Math.sin(a) * ro); }
    for (let k = 0; k <= 4; k++) { const a = i1 - (i1 - i0) * k / 4; h.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
    h.closePath();
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
  g.rotateY(Math.PI / 2); // face points +x
  return g;
}

export function tireGeometry(r: number, rr: number, w: number, seg: number) {
  const pr: THREE.Vector2[] = [];
  const hw = w / 2;
  // cross-section (radius, axial): bead → sidewall → rounded shoulder → tread → back
  pr.push(new THREE.Vector2(rr * 0.98, -hw + 0.02));
  pr.push(new THREE.Vector2(r - 0.05, -hw));
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * Math.PI / 2; pr.push(new THREE.Vector2(r - 0.035 + Math.cos(a) * 0.035, -hw + 0.035 + Math.sin(a) * 0.035)); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pr.push(new THREE.Vector2(r - 0.035 + Math.cos(a) * 0.035, hw - 0.035 + Math.sin(a) * 0.035)); }
  pr.push(new THREE.Vector2(r - 0.05, hw));
  pr.push(new THREE.Vector2(rr * 0.98, hw - 0.02));
  const g = new THREE.LatheGeometry(pr, seg);
  g.rotateZ(-Math.PI / 2); // axis → x
  return g;
}
