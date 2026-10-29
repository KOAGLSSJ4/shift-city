// Procedural city built on the road grid. Geometry is merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTINATIONS, GRID, HALF, ISLAND_R, PITCH, ROAD_W, ROUNDABOUTS, WALK_W, roadCoord, type Destination } from '../data/world';
import type { Materials } from '../graphics/Materials';
import type { GraphicsMode } from '../core/Save';
import { isRoundabout, neighbours, nodeId, nodePos } from './RoadNetwork';
import { instanceProp, treeImpostors, TREE_IMPOSTORS, type Placement } from './Props';

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
function walls(out: number[][], x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, uOff: number, bay = 4, fl = 3.5) {
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
    const shops: number[][][] = M.shopfronts.map(() => [[], [], []]);
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
          const shopH = 4.5;
          walls(shops[Math.floor(rand() * shops.length)], ax0, az0, ax1, az1, curbH, curbH + shopH, Math.floor(rand() * 3), 8, shopH);
          walls(facades[style], ax0, az0, ax1, az1, curbH + shopH, curbH + h, Math.floor(rand() * 4));
          flat(roof, ax0, az0, ax1, az1, curbH + h, 6);
          if (rand() < 0.55) this.roofSpots.push({ p: V(ax0 + 3 + rand() * (ax1 - ax0 - 6), curbH + h, az0 + 3 + rand() * (az1 - az0 - 6)), rot: Math.floor(rand() * 4) * Math.PI / 2 });
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
    shops.forEach((f, i) => add(f, M.shopfronts[i], true));

    // roundabouts: a raised, planted island with a white ring, and a tree in the middle
    for (const [i, j] of ROUNDABOUTS) {
      const c = nodePos(nodeId(i, j));
      const kerb = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R + 0.15, 0.3, 40), M.curb);
      kerb.position.set(c.x, 0.15, c.z);
      const top = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R - 0.25, 40), M.grass);
      top.rotation.x = -Math.PI / 2; top.position.set(c.x, 0.31, c.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(ISLAND_R + 0.35, ISLAND_R + 0.5, 48), M.paintWhite);
      ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.03, c.z);
      kerb.castShadow = kerb.receiveShadow = top.receiveShadow = true;
      this.group.add(kerb, top, ring);
      this.islands.push({ x: c.x, z: c.z });
      treeSpots.push(V(c.x, 0.3, c.z));
    }
    this.addTrees(treeSpots);
    this.addLamps(lampSpots);
    this.treeSpots = treeSpots;
    this.lampSpots = lampSpots;
    this.addSignals();
    // the city never moves: skip per-frame matrix updates for every static object
    this.group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    this.group.updateMatrixWorld(true);
  }

  private blobTrees: THREE.Object3D[] = [];
  private cardTrees: THREE.Object3D[] = [];
  private procLamps: THREE.Object3D[] = [];
  private treeSpots: THREE.Vector3[] = [];
  /** Roundabout island centres (solid for the player). */
  readonly islands: { x: number; z: number }[] = [];
  private lampSpots: { p: THREE.Vector3; rot: number }[] = [];
  private roofSpots: Placement[] = [];
  /** Poly Haven props + photographic tree impostors (Photoreal / Hyper-real only). */
  readonly detail = new THREE.Group();
  private detailLoaded = false;
  private mode: GraphicsMode = 'rendered';
  /** Lamp glass materials from the street-lamp model, lit at night by Materials.setTime. */
  lampGlass: THREE.MeshStandardMaterial[] = [];

  /** Rendered keeps faceted low-poly crowns and simple poles; Photoreal/Hyper use scanned assets. */
  setMode(mode: GraphicsMode) {
    this.mode = mode;
    const real = mode !== 'rendered';
    this.blobTrees.forEach((o) => (o.visible = !real));
    this.cardTrees.forEach((o) => (o.visible = real && !this.detailLoaded));
    this.procLamps.forEach((o) => (o.visible = !real || !this.detailLoaded));
    this.detail.visible = real && this.detailLoaded;
  }

  /** Streams in the street detail after the game has started (≈3 MB). */
  async loadDetail() {
    let r = 991;
    const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
    const hw = ROAD_W / 2;
    const hydrants: Placement[] = [], bins: Placement[] = [], benches: Placement[] = [], boxes: Placement[] = [], manholes: Placement[] = [];
    for (const b of this.blocks) {
      // corners: hydrant on one, bins on two, utility box on another (all on the sidewalk, facing the road)
      const corners: [number, number, number][] = [[b.x0 + 2.2, b.z0 + 1.0, 0], [b.x1 - 2.2, b.z0 + 1.0, 0], [b.x0 + 2.2, b.z1 - 1.0, Math.PI], [b.x1 - 2.2, b.z1 - 1.0, Math.PI]];
      corners.sort(() => rnd() - 0.5);
      hydrants.push({ p: V(corners[0][0], 0.15, corners[0][1]), rot: rnd() * 6.28 });
      bins.push({ p: V(corners[1][0] + 1.2, 0.15, corners[1][1]), rot: corners[1][2] });
      if (rnd() < 0.6) bins.push({ p: V(corners[2][0] - 1.2, 0.15, corners[2][1]), rot: corners[2][2] });
      if (rnd() < 0.7) boxes.push({ p: V(corners[3][0], 0.15, corners[3][1] + (corners[3][2] ? -1.8 : 1.8)), rot: corners[3][2] + Math.PI });
      // a bench facing the street on some blocks
      if (rnd() < 0.45) {
        const side = Math.floor(rnd() * 4), t = 0.3 + rnd() * 0.4;
        const pl = side === 0 ? { p: V(b.x0 + (b.x1 - b.x0) * t, 0.15, b.z0 + 2.6), rot: Math.PI }
          : side === 1 ? { p: V(b.x0 + (b.x1 - b.x0) * t, 0.15, b.z1 - 2.6), rot: 0 }
          : side === 2 ? { p: V(b.x0 + 2.6, 0.15, b.z0 + (b.z1 - b.z0) * t), rot: -Math.PI / 2 }
          : { p: V(b.x1 - 2.6, 0.15, b.z0 + (b.z1 - b.z0) * t), rot: Math.PI / 2 };
        benches.push(pl);
      }
    }
    // manhole covers in the middle of road segments
    for (let k = 0; k <= GRID; k++) for (let sgm = 0; sgm < GRID; sgm++) {
      if (rnd() < 0.5) continue;
      const c = roadCoord(k), a = roadCoord(sgm) + hw + 10 + rnd() * (PITCH - 2 * hw - 20), lane = (rnd() < 0.5 ? -1 : 1) * 1.75;
      manholes.push(rnd() < 0.5 ? { p: V(a, -0.055, c + lane), rot: rnd() * 6.28 } : { p: V(c + lane, -0.055, a), rot: rnd() * 6.28 });
    }
    // street lamps replace the procedural poles (arms faced the road; the post lamp sits at the kerb)
    const lamps: Placement[] = this.lampSpots.map((l) => ({ p: l.p, rot: l.rot, scale: 1.25 }));
    const trees = this.treeSpots.map((p) => ({ p, rot: rnd() * 6.28, scale: 1.55 + rnd() * 0.6 }));
    const treeA = trees.filter((_, i) => i % 3 !== 0), treeB = trees.filter((_, i) => i % 3 === 0);

    const loaded = await Promise.all([
      instanceProp('props/street_lamp_01.glb', lamps),
      instanceProp('props/fire_hydrant.glb', hydrants),
      instanceProp('props/metal_trash_can.glb', bins),
      instanceProp('props/modular_street_seating.glb', benches),
      instanceProp('props/utility_box_01.glb', boxes),
      instanceProp('props/exterior_aircon_unit.glb', this.roofSpots, { filter: (n) => !/rust/i.test(n) }),
      instanceProp('props/water_manhole_cover.glb', manholes, { shadows: false }),
      treeImpostors(TREE_IMPOSTORS[0], treeA),
      treeImpostors(TREE_IMPOSTORS[1], treeB),
    ].map((p) => p.catch((e) => { console.warn('detail asset failed', e); return null; })));
    for (const o of loaded) if (o) this.detail.add(o);
    // find the lamp glass so night mode can light it
    loaded[0]?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && /glass|light|bulb|lamp_?glass/i.test(m.name) && !this.lampGlass.includes(m)) { m.emissive = new THREE.Color(0xffd9a0); this.lampGlass.push(m); }
    });
    this.detail.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    this.group.add(this.detail);
    this.detail.updateMatrixWorld(true);
    this.detailLoaded = loaded.some(Boolean);
    this.setMode(this.mode);
  }

  private addTrees(spots: THREE.Vector3[]) {
    // perimeter forest: a square ring outside the outer roads (a circle cut into the city near the corners
    // and put trees in the middle of roads)
    for (let placed = 0; placed < 140;) {
      const t = rand() * Math.PI * 2, r = HALF + 30 + rand() * 140;
      const x = Math.cos(t) * r, z = Math.sin(t) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 25) continue;
      spots.push(V(x, 0, z)); placed++;
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
    // leaf-card crowns: many crossed, tilted quads around a few branch clumps
    const cards: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 16; k++) {
      const q = new THREE.PlaneGeometry(2.2 + rand() * 1.2, 2.2 + rand() * 1.2);
      const a = rand() * Math.PI * 2, r = rand() * 1.5, y = 3.4 + rand() * 2.6;
      q.rotateX((rand() - 0.5) * 1.4); q.rotateY(rand() * Math.PI); q.rotateZ((rand() - 0.5) * 0.8);
      q.translate(Math.cos(a) * r, y, Math.sin(a) * r);
      // fake normals pointing outward from the crown centre so cards shade like a volume
      const pos = q.attributes.position as THREE.BufferAttribute, nrm = q.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3(pos.getX(i), pos.getY(i) - 4.4, pos.getZ(i)).normalize(); nrm.setXYZ(i, v.x, v.y, v.z); }
      cards.push(q);
    }
    const branches: THREE.BufferGeometry[] = [trunk.clone()];
    for (let k = 0; k < 4; k++) {
      const b = new THREE.CylinderGeometry(0.04, 0.08, 1.8, 5); b.translate(0, 0.9, 0);
      b.rotateZ(0.7 + rand() * 0.3); b.rotateY(k * 1.6 + rand()); b.translate(0, 2.6 + rand() * 0.6, 0);
      branches.push(b.toNonIndexed());
    }
    const crownCards = mergeGeometries(cards);
    const ib = new THREE.InstancedMesh(mergeGeometries(branches.map((g) => (g.index ? g.toNonIndexed() : g))), this.mats.trunk, spots.length);
    const il = new THREE.InstancedMesh(crownCards, this.mats.leaves, spots.length);
    spots.forEach((_, i) => { it.getMatrixAt(i, m); ib.setMatrixAt(i, m); il.setMatrixAt(i, m); il.setColorAt(i, col.setHSL(0.22 + rand() * 0.1, 0.35, 0.55 + rand() * 0.25)); });
    ib.castShadow = il.castShadow = true;
    il.receiveShadow = true;
    // alpha-tested shadows for the leaf cards
    il.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.mats.leaves.map, alphaTest: 0.45 });
    this.blobTrees.push(it, ic);
    this.cardTrees.push(ib, il);
    this.group.add(it, ic, ib, il);
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
    // pools of light on the road under each lamp (visible at dusk/night)
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    this.mats.lampPool.map = new THREE.CanvasTexture(c);
    const poolGeo = new THREE.PlaneGeometry(10, 10); poolGeo.rotateX(-Math.PI / 2); poolGeo.translate(0, -0.12, -3);
    const ip = new THREE.InstancedMesh(poolGeo, this.mats.lampPool, spots.length);
    spots.forEach((_, i) => { im.getMatrixAt(i, m); ip.setMatrixAt(i, m); });
    ip.renderOrder = 2;
    this.procLamps.push(im, ih);
    this.group.add(im, ih, ip);
  }

  private addSignals() {
    const hw = ROAD_W / 2;
    const poles: THREE.BufferGeometry[] = [];
    const lamps: Record<string, THREE.BufferGeometry[]> = {};
    const up = V(0, 1, 0);
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) {
      const id = nodeId(i, j), c = nodePos(id), nb = neighbours(id);
      if (nb.length < 3 || isRoundabout(id)) continue; // roundabouts have no lights
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
    for (const c of this.islands) {
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), min = ISLAND_R + 0.15 + radius;
      if (d < min && d > 1e-4) return { x: (dx / d) * (min - d), z: (dz / d) * (min - d) };
    }
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
