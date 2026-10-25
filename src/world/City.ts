// Procedural city built on the road grid. Geometry is merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTINATIONS, GRID, HALF, PITCH, ROAD_W, WALK_W, roadCoord, type Destination } from '../data/world';
import type { Materials } from '../graphics/Materials';
import { neighbours, nodeId, nodePos } from './RoadNetwork';

export interface Rect { x0: number; z0: number; x1: number; z1: number }

let seed = 1337;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Quad with world-scaled UVs. Corners in CCW order seen from the normal side. */
function quad(out: number[][], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: [number, number][]) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]] as const) {
    out[0].push(p.x, p.y, p.z); out[1].push(n.x, n.y, n.z); out[2].push(t[0], t[1]);
  }
}

function geom(arr: number[][]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr[0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arr[1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr[2], 2));
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Horizontal rectangle with planar world UVs (scale = metres per texture tile). */
function flat(out: number[][], x0: number, z0: number, x1: number, z1: number, y: number, scale: number) {
  quad(out, V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), [[x0 / scale, z1 / scale], [x1 / scale, z1 / scale], [x1 / scale, z0 / scale], [x0 / scale, z0 / scale]]);
}

/** Building walls: one texture tile = one 4 m x 3.5 m window bay. */
function walls(out: number[][], x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, uOff: number) {
  const bay = 4, fl = 3.5;
  const v0 = y0 / fl, v1 = y1 / fl;
  const side = (a: THREE.Vector3, b: THREE.Vector3, len: number) => {
    const u1 = uOff + Math.round(len / bay);
    quad(out, V(a.x, y0, a.z), V(b.x, y0, b.z), V(b.x, y1, b.z), V(a.x, y1, a.z), [[uOff, v0], [u1, v0], [u1, v1], [uOff, v1]]);
  };
  side(V(x0, 0, z1), V(x1, 0, z1), x1 - x0); // +z face
  side(V(x1, 0, z1), V(x1, 0, z0), z1 - z0); // +x
  side(V(x1, 0, z0), V(x0, 0, z0), x1 - x0); // -z
  side(V(x0, 0, z0), V(x0, 0, z1), z1 - z0); // -x
}

export type SignalState = 'green' | 'yellow' | 'red';
const CYCLE = 22;
/** Global signal plan. axis 'z' = traffic moving along the Z axis. */
export function signal(axis: 'x' | 'z', t: number): SignalState {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  const local = axis === 'z' ? c : (c + 11) % CYCLE;
  return local < 8 ? 'green' : local < 10.5 ? 'yellow' : 'red';
}

export class City {
  readonly group = new THREE.Group();
  readonly blocks: Rect[] = [];
  private lampMats: Record<'x' | 'z', Record<SignalState, THREE.MeshStandardMaterial>>;
  private signs: THREE.Texture[] = [];

  constructor(private mats: Materials) {
    const mk = (c: number) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0 });
    this.lampMats = {
      x: { green: mk(0x22ff66), yellow: mk(0xffaa00), red: mk(0xff2020) },
      z: { green: mk(0x22ff66), yellow: mk(0xffaa00), red: mk(0xff2020) },
    };
    this.build();
  }

  private landmarkBlocks() {
    const m = new Map<string, Destination>();
    for (const d of DESTINATIONS) {
      let bi: number, bj: number;
      if (d.axis === 'x') { bi = d.i; bj = d.side > 0 ? d.j : d.j - 1; }
      else { bi = d.side > 0 ? d.j : d.j - 1; bj = d.i; }
      m.set(`${bi},${bj}`, d);
    }
    return m;
  }

  private build() {
    const M = this.mats;
    const road: number[][] = [[], [], []], walk: number[][] = [[], [], []], curb: number[][] = [[], [], []];
    const white: number[][] = [[], [], []], yellow: number[][] = [[], [], []], roof: number[][] = [[], [], []];
    const facades: number[][][] = M.facades.map(() => [[], [], []]);
    const grassPatches: number[][] = [[], [], []];
    const treeSpots: THREE.Vector3[] = [], lampSpots: { p: THREE.Vector3; rot: number }[] = [];
    const hw = ROAD_W / 2;

    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), M.grass);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
    (ground.geometry.attributes.uv as THREE.BufferAttribute).array.forEach((_, i, a) => { (a as Float32Array)[i] *= 400; });
    this.group.add(ground);

    // roads
    const lo = roadCoord(0) - hw, hi = roadCoord(GRID) + hw;
    for (let k = 0; k <= GRID; k++) {
      const c = roadCoord(k);
      flat(road, lo, c - hw, hi, c + hw, 0, 8);
      flat(road, c - hw, lo, c + hw, hi, 0.001, 8);
    }

    // markings between intersections
    const strip = (out: number[][], axis: 'x' | 'z', c: number, off: number, a: number, b: number, w: number) => {
      if (axis === 'x') flat(out, a, c + off - w / 2, b, c + off + w / 2, 0.02, 1);
      else flat(out, c + off - w / 2, a, c + off + w / 2, b, 0.02, 1);
    };
    for (let k = 0; k <= GRID; k++) {
      const c = roadCoord(k);
      for (let s = 0; s < GRID; s++) {
        const a = roadCoord(s) + hw + 4, b = roadCoord(s + 1) - hw - 4;
        for (const axis of ['x', 'z'] as const) {
          strip(yellow, axis, c, -0.18, a, b, 0.12);
          strip(yellow, axis, c, 0.18, a, b, 0.12);
          strip(white, axis, c, -hw + 0.35, a, b, 0.15);
          strip(white, axis, c, hw - 0.35, a, b, 0.15);
          for (let d = a + 2; d < b - 3; d += 9) { strip(white, axis, c, -3.5, d, d + 3, 0.13); strip(white, axis, c, 3.5, d, d + 3, 0.13); }
          // zebra crossings + stop lines at both ends
          for (const [z0, sgn] of [[roadCoord(s) + hw, 1], [roadCoord(s + 1) - hw, -1]] as const) {
            for (let x = -hw + 0.6; x < hw - 0.4; x += 1.2) {
              const q0 = z0 + sgn * 0.5, q1 = z0 + sgn * 3.3;
              if (axis === 'x') flat(white, Math.min(q0, q1), c + x, Math.max(q0, q1), c + x + 0.6, 0.02, 1);
              else flat(white, c + x, Math.min(q0, q1), c + x + 0.6, Math.max(q0, q1), 0.02, 1);
            }
          }
        }
      }
    }

    // blocks: sidewalks, kerbs, buildings / parks
    const landmarks = this.landmarkBlocks();
    const curbH = 0.15;
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const x0 = roadCoord(bi) + hw, x1 = roadCoord(bi + 1) - hw, z0 = roadCoord(bj) + hw, z1 = roadCoord(bj + 1) - hw;
        this.blocks.push({ x0, z0, x1, z1 });
        flat(walk, x0, z0, x1, z1, curbH, 3);
        // kerb faces
        quad(curb, V(x0, 0, z1), V(x1, 0, z1), V(x1, curbH, z1), V(x0, curbH, z1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        quad(curb, V(x1, 0, z0), V(x0, 0, z0), V(x0, curbH, z0), V(x1, curbH, z0), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        quad(curb, V(x1, 0, z1), V(x1, 0, z0), V(x1, curbH, z0), V(x1, curbH, z1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        quad(curb, V(x0, 0, z0), V(x0, 0, z1), V(x0, curbH, z1), V(x0, curbH, z0), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        // street furniture along each kerb
        for (let t = 8; t < x1 - x0 - 6; t += 16) {
          const isLamp = Math.round(t / 16) % 2 === 0;
          for (const [px, pz, rot] of [[x0 + t, z0 + 1.2, 0], [x0 + t, z1 - 1.2, Math.PI], [x0 + 1.2, z0 + t, Math.PI / 2], [x1 - 1.2, z0 + t, -Math.PI / 2]] as const) {
            if (isLamp) lampSpots.push({ p: V(px, curbH, pz), rot });
            else treeSpots.push(V(px, curbH, pz));
          }
        }
        const lm = landmarks.get(`${bi},${bj}`);
        const bx0 = x0 + WALK_W, bx1 = x1 - WALK_W, bz0 = z0 + WALK_W, bz1 = z1 - WALK_W;
        if (lm?.landmark === 'park' || (!lm && rand() < 0.05)) {
          flat(grassPatches, bx0, bz0, bx1, bz1, curbH + 0.01, 4);
          for (let n = 0; n < 14; n++) treeSpots.push(V(bx0 + 3 + rand() * (bx1 - bx0 - 6), curbH, bz0 + 3 + rand() * (bz1 - bz0 - 6)));
          continue;
        }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const downtown = Math.max(0, 1 - Math.hypot(cx, cz) / 340);
        const addBuilding = (ax0: number, az0: number, ax1: number, az1: number, h: number, style: number) => {
          walls(facades[style], ax0, az0, ax1, az1, curbH, curbH + h, Math.floor(rand() * 4));
          flat(roof, ax0, az0, ax1, az1, curbH + h, 6);
          // parapet + rooftop plant
          if (h > 12 && rand() < 0.7) {
            const rw = 3 + rand() * 4, rx = ax0 + 2 + rand() * (ax1 - ax0 - rw - 4), rz = az0 + 2 + rand() * (az1 - az0 - rw - 4);
            walls(facades[0], rx, rz, rx + rw, rz + rw, curbH + h, curbH + h + 2.2, 0);
            flat(roof, rx, rz, rx + rw, rz + rw, curbH + h + 2.2, 6);
          }
        };
        if (lm) {
          const spec: Record<string, [number, number]> = { station: [16, 0], apartments: [42, 3], hospital: [34, 3], mall: [14, 4], campus: [18, 1], hotel: [96, 2], market: [9, 5], oldtown: [12, 1], arts: [20, 5] };
          const [h, style] = spec[lm.landmark] ?? [20, 0];
          addBuilding(bx0, bz0, bx1, bz1, h, style);
          this.addSign(lm);
          continue;
        }
        const split = rand();
        const parcels: Rect[] = split < 0.3 ? [{ x0: bx0, z0: bz0, x1: bx1, z1: bz1 }]
          : split < 0.6 ? [{ x0: bx0, z0: bz0, x1: cx - 0.5, z1: bz1 }, { x0: cx + 0.5, z0: bz0, x1: bx1, z1: bz1 }]
          : [{ x0: bx0, z0: bz0, x1: cx - 0.5, z1: cz - 0.5 }, { x0: cx + 0.5, z0: bz0, x1: bx1, z1: cz - 0.5 }, { x0: bx0, z0: cz + 0.5, x1: cx - 0.5, z1: bz1 }, { x0: cx + 0.5, z0: cz + 0.5, x1: bx1, z1: bz1 }];
        for (const p of parcels) {
          const h = 9 + rand() * 14 + Math.pow(downtown, 1.6) * rand() * 110;
          const style = h > 50 ? (rand() < 0.6 ? 2 : 4) : Math.floor(rand() * 6);
          addBuilding(p.x0, p.z0, p.x1, p.z1, h, style);
        }
      }
    }

    const add = (arr: number[][], mat: THREE.Material, cast = false) => {
      if (!arr[0].length) return;
      const m = new THREE.Mesh(geom(arr), mat);
      m.receiveShadow = true; m.castShadow = cast;
      this.group.add(m);
      return m;
    };
    add(road, M.asphalt);
    add(white, M.paintWhite);
    add(yellow, M.paintYellow);
    add(walk, M.sidewalk);
    add(curb, M.curb);
    add(roof, M.roof, true);
    add(grassPatches, M.grass);
    facades.forEach((f, i) => add(f, M.facades[i], true));

    this.addTrees(treeSpots);
    this.addLamps(lampSpots);
    this.addSignals();
  }

  private addTrees(spots: THREE.Vector3[]) {
    // perimeter forest
    for (let a = 0; a < 140; a++) {
      const t = rand() * Math.PI * 2, r = HALF + 30 + rand() * 60;
      spots.push(V(Math.cos(t) * r, 0, Math.sin(t) * r));
    }
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 3, 6); trunk.translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(1.9, 1); crown.translate(0, 4.2, 0);
    const pos = crown.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.9 + rand() * 0.25), pos.getY(i) * (0.95 + rand() * 0.15), pos.getZ(i) * (0.9 + rand() * 0.25));
    crown.computeVertexNormals();
    const it = new THREE.InstancedMesh(trunk, this.mats.trunk, spots.length);
    const ic = new THREE.InstancedMesh(crown, this.mats.foliage, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach((p, i) => {
      const k = 0.8 + rand() * 0.6;
      q.setFromAxisAngle(V(0, 1, 0), rand() * 6.28);
      m.compose(p, q, s.set(k, k, k));
      it.setMatrixAt(i, m); ic.setMatrixAt(i, m);
      ic.setColorAt(i, col.setHSL(0.24 + rand() * 0.08, 0.45, 0.28 + rand() * 0.1));
    });
    it.castShadow = ic.castShadow = true;
    ic.receiveShadow = true;
    this.group.add(it, ic);
  }

  private addLamps(spots: { p: THREE.Vector3; rot: number }[]) {
    const pole = new THREE.CylinderGeometry(0.08, 0.11, 7, 6); pole.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 2.2); arm.translate(0, 6.9, -1.1);
    const metal = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()]);
    const head = new THREE.BoxGeometry(0.35, 0.1, 0.6); head.translate(0, 6.82, -2.1);
    const im = new THREE.InstancedMesh(metal, this.mats.metal, spots.length);
    const ih = new THREE.InstancedMesh(head, this.mats.lampGlow, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1);
    spots.forEach(({ p, rot }, i) => {
      // arms point toward the road (out of the block)
      q.setFromAxisAngle(V(0, 1, 0), rot);
      m.compose(p, q, one);
      im.setMatrixAt(i, m); ih.setMatrixAt(i, m);
    });
    im.castShadow = true;
    this.group.add(im, ih);
  }

  private addSignals() {
    const hw = ROAD_W / 2;
    const poles: THREE.BufferGeometry[] = [];
    const lamps: Record<string, THREE.BufferGeometry[]> = {};
    const up = V(0, 1, 0);
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) {
      const id = nodeId(i, j), c = nodePos(id), nb = neighbours(id);
      if (nb.length < 3) continue;
      for (const n of nb) {
        const np = nodePos(n);
        // approach direction d: from neighbour toward this node
        const d = V(c.x - np.x, 0, c.z - np.z).normalize();
        const right = V(-d.z, 0, d.x);
        const axis: 'x' | 'z' = Math.abs(d.x) > 0.5 ? 'x' : 'z';
        const base = V(c.x, 0.15, c.z).addScaledVector(d, -(hw + 1)).addScaledVector(right, hw + 1);
        const rotY = Math.atan2(-d.x, -d.z); // face oncoming traffic
        const xf = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromAxisAngle(up, rotY), V(1, 1, 1));
        const p = new THREE.CylinderGeometry(0.09, 0.09, 4.6, 6); p.translate(0, 2.3, 0);
        const arm = new THREE.BoxGeometry(0.08, 0.08, 4.2); arm.rotateY(Math.PI / 2); arm.translate(-2.1, 4.5, 0);
        const box = new THREE.BoxGeometry(0.4, 1.1, 0.3); box.translate(-3.6, 4.0, 0);
        for (const g of [p, arm, box]) poles.push(g.applyMatrix4(xf).toNonIndexed());
        (['red', 'yellow', 'green'] as const).forEach((col, k) => {
          const s = new THREE.SphereGeometry(0.12, 8, 6); s.translate(-3.6, 4.35 - k * 0.35, 0.16);
          (lamps[axis + col] ??= []).push(s.applyMatrix4(xf).toNonIndexed());
        });
      }
    }
    const pm = new THREE.Mesh(mergeGeometries(poles), this.mats.darkMetal);
    pm.castShadow = true;
    this.group.add(pm);
    for (const axis of ['x', 'z'] as const) for (const col of ['red', 'yellow', 'green'] as const) {
      const arr = lamps[axis + col];
      if (arr) this.group.add(new THREE.Mesh(mergeGeometries(arr), this.lampMats[axis][col]));
    }
  }

  private addSign(d: Destination) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f2a3a'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#54ffd0'; g.fillRect(0, 118, 512, 10);
    g.fillStyle = '#fff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.name.toUpperCase(), 256, 60, 490);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.signs.push(tex);
    const board = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 0.15), [this.mats.darkMetal, this.mats.darkMetal, this.mats.darkMetal, this.mats.darkMetal,
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 })]);
    const g2 = new THREE.Group();
    board.position.y = 3.4; board.castShadow = true;
    for (const sx of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), this.mats.darkMetal); p.position.set(sx, 1.7, 0); g2.add(p); }
    g2.add(board);
    // stand on the sidewalk beside the stop, facing the road
    const off = ROAD_W / 2 + 2.2;
    if (d.axis === 'x') { g2.position.set(d.x + 8, 0.15, roadCoord(d.j) + d.side * off); g2.rotation.y = 0; }
    else { g2.position.set(roadCoord(d.j) + d.side * off, 0.15, d.z + 8); g2.rotation.y = Math.PI / 2; }
    this.group.add(g2);
  }

  /** Lights up the signal lamps for the current phase. */
  updateSignals(t: number) {
    for (const axis of ['x', 'z'] as const) {
      const st = signal(axis, t);
      for (const col of ['red', 'yellow', 'green'] as const) this.lampMats[axis][col].emissiveIntensity = st === col ? 3 : 0;
    }
  }

  /** Pushes a set of points (car corners) out of block rectangles. Returns the correction applied. */
  collide(px: number, pz: number, radius: number): { x: number; z: number } | null {
    for (const b of this.blocks) {
      if (px < b.x0 - radius || px > b.x1 + radius || pz < b.z0 - radius || pz > b.z1 + radius) continue;
      const cx = Math.max(b.x0, Math.min(b.x1, px)), cz = Math.max(b.z0, Math.min(b.z1, pz));
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d > 1e-4) return { x: (dx / d) * (radius - d), z: (dz / d) * (radius - d) };
      // centre inside the block: push out through the nearest edge
      const opts = [[b.x0 - radius - px, 0], [b.x1 + radius - px, 0], [0, b.z0 - radius - pz], [0, b.z1 + radius - pz]];
      opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
      return { x: opts[0][0], z: opts[0][1] };
    }
    return null;
  }
}

export { PITCH };
