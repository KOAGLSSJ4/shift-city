// Arcade Rush: endless 3-lane highway. Dodge traffic, grab coins, chain near misses into multipliers.
// Deliberately separate from the city driving controller: no fuel, fares or road rules.
import * as THREE from 'three';
import type { Materials } from '../graphics/Materials';
import type { CarRig } from '../vehicles/CarFactory';
import { buildTrafficCar } from '../vehicles/CarFactory';
import type { VehicleDef } from '../data/vehicles';
import type { DesignBody } from '../vehicles/designs';

export const ARCADE_ORIGIN = new THREE.Vector3(3000, 0, 0);
const LANE = 3.7;
const CHUNK = 120;
const CHUNKS = 5;
const blinkGeo = new THREE.BoxGeometry(0.12, 0.1, 0.22);
const blinkMat = new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff9a10, emissiveIntensity: 4 });
/** All arcade traffic moves at one speed, so obstacle rows never converge. */
const FLOW_SPEED = 12;
/** Obstacles within this many metres of each other count as one wall the player must find a gap in. */
const ESCAPE_BAND = 20;

interface Obstacle { mesh: THREE.Object3D; lane: number; x: number; z: number; speed: number; len: number; active: boolean; passed: boolean; minLat: number; hit: boolean; fly: number; laneChange: number; canChange: boolean;
  /** Indicated lane-change direction (blinkers on) before the car actually moves. */
  pending: number; blinkT: number; blinkers: THREE.Object3D[] }
interface Coin { mesh: THREE.Mesh; active: boolean; z: number; x: number; kind: 'coin' | 'magnet' | 'x2' | 'nitro' }

export interface ArcadeEvents {
  coin(kind: Coin['kind']): void;
  nearMiss(points: number, streak: number): void;
  crash(heartsLeft: number): void;
  over(score: number, nearMisses: number, coins: number): void;
  popup(text: string, cls?: string): void;
}

export class ArcadeMode {
  readonly group = new THREE.Group();
  running = false;
  countdown = 0;
  score = 0; coins = 0; streak = 0; nearMisses = 0; hearts = 3; distance = 0;
  speed = 26; time = 0;
  lane = 0; x = 0; z = 0;
  invuln = 0; magnet = 0; double = 0; nitro = 0;
  runId = '';
  private chunks: THREE.Group[] = [];
  private obstacles: Obstacle[] = [];
  private items: Coin[] = [];
  private nextRow = 60;
  private laneCooldown = 0;
  private def!: VehicleDef;

  constructor(private mats: Materials, public rig: CarRig) {
    this.group.position.copy(ARCADE_ORIGIN);
    for (let i = 0; i < CHUNKS; i++) { const c = this.buildChunk(i); c.position.z = i * CHUNK - CHUNK; this.chunks.push(c); this.group.add(c); }
    const bodies: DesignBody[] = ['sedan', 'hatch', 'suv', 'sedan', 'gt'];
    const colors = [0xeeeeee, 0x202226, 0x8a8f96, 0x1d3f73, 0x9b2c1a, 0xd8c7a0, 0x2e4d39];
    for (let i = 0; i < 16; i++) {
      const isTruck = i % 6 === 5;
      const mesh = isTruck ? this.buildTruck() : buildTrafficCar(bodies[i % bodies.length], colors[i % colors.length]);
      mesh.visible = false;
      this.group.add(mesh);
      const len = isTruck ? 9 : mesh.userData.length, wid = isTruck ? 2.5 : mesh.userData.width;
      // amber indicators at the four corners: [right side, left side] (+x is the car's left)
      const blinkers = [-1, 1].map((sx) => {
        const g = new THREE.Group();
        for (const sz of [-1, 1]) {
          const b = new THREE.Mesh(blinkGeo, blinkMat);
          b.position.set(sx * (wid / 2 - 0.05), isTruck ? 1.0 : 0.75, sz * (len / 2 - 0.1));
          g.add(b);
        }
        g.visible = false;
        mesh.add(g);
        return g;
      });
      this.obstacles.push({ mesh, lane: 0, x: 0, z: 0, speed: 0, len, active: false, passed: false, minLat: 9, hit: false, fly: 0, laneChange: 0, canChange: false, pending: 0, blinkT: 0, blinkers });
    }
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24); coinGeo.rotateZ(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcf49, metalness: 1, roughness: 0.18, emissive: 0x7a4a00, emissiveIntensity: 0.5 });
    const pMats = { magnet: 0xff4fd8, x2: 0x54ffd0, nitro: 0x4c8dff };
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(coinGeo, coinMat); m.visible = false; this.group.add(m);
      this.items.push({ mesh: m, active: false, z: 0, x: 0, kind: 'coin' });
    }
    for (const [kind, col] of Object.entries(pMats)) for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.2 }));
      m.visible = false; this.group.add(m);
      this.items.push({ mesh: m, active: false, z: 0, x: 0, kind: kind as Coin['kind'] });
    }
    this.group.visible = false;
  }

  private buildTruck() {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.2), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.3, roughness: 0.5 }));
    cab.position.set(0, 1.7, 3.3);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.2, 6.6), new THREE.MeshStandardMaterial({ color: 0xf2a12b, roughness: 0.6 }));
    box.position.set(0, 2.1, -1.0);
    const under = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 8.6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    under.position.y = 0.6;
    g.add(cab, box, under);
    g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    g.userData.length = 9;
    return g;
  }

  private buildChunk(seed: number) {
    const g = new THREE.Group();
    const road = new THREE.Mesh(new THREE.PlaneGeometry(16, CHUNK), this.mats.asphalt);
    road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
    const uv = road.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 15);
    g.add(road);
    // lane dashes and edge lines
    for (const lx of [-LANE / 2, LANE / 2]) for (let z = -CHUNK / 2; z < CHUNK / 2; z += 10) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 4), this.mats.paintWhite);
      d.rotation.x = -Math.PI / 2; d.position.set(lx, 0.02, z); g.add(d);
    }
    for (const ex of [-7.2, 7.2]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.2, CHUNK), this.mats.paintWhite);
      e.rotation.x = -Math.PI / 2; e.position.set(ex, 0.02, 0); g.add(e);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, CHUNK), this.mats.metal);
      rail.position.set(ex * 1.12, 0.7, 0); rail.castShadow = true; g.add(rail);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, CHUNK), this.mats.sidewalk);
      walk.position.set(Math.sign(ex) * 10.6, 0.075, 0); walk.receiveShadow = true; g.add(walk);
    }
    // roadside buildings
    let r = seed * 97 + 13;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (const side of [-1, 1]) {
      for (let z = -CHUNK / 2; z < CHUNK / 2;) {
        const w = 12 + rnd() * 14, h = 10 + rnd() * 45, d = 14 + rnd() * 10;
        const geo = new THREE.BoxGeometry(d, h, w - 1.5);
        // world-ish UVs: one tile per window bay
        const u = geo.attributes.uv as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < u.count; i++) {
          const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
          const span = ny > 0.5 ? 0 : nx > 0.5 ? w / 4 : d / 4;
          u.setXY(i, u.getX(i) * span, u.getY(i) * (ny > 0.5 ? 0 : h / 3.5));
        }
        const m = new THREE.Mesh(geo, this.mats.facades[Math.floor(rnd() * this.mats.facades.length)]);
        m.position.set(side * (13.5 + d / 2), h / 2, z + w / 2);
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        if (rnd() < 0.6) {
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), this.mats.metal);
          lamp.position.set(side * 9, 3.5, z + 3); g.add(lamp);
        }
        z += w;
      }
    }
    return g;
  }

  start(rig: CarRig, def: VehicleDef) {
    this.rig = rig; this.def = def;
    this.group.visible = true;
    this.group.add(rig.root);
    Object.assign(this, { running: false, countdown: 3, score: 0, coins: 0, streak: 0, nearMisses: 0, hearts: 3, distance: 0, speed: 24, time: 0, lane: 0, x: 0, z: 0, invuln: 0, magnet: 0, double: 0, nitro: 0, nextRow: 70 });
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.obstacles.forEach((o) => { o.active = false; o.mesh.visible = false; });
    this.items.forEach((c) => { c.active = false; c.mesh.visible = false; });
    this.chunks.forEach((c, i) => { c.position.z = i * CHUNK - CHUNK; });
    this.place(0);
  }

  stop() {
    this.running = false;
    this.group.visible = false;
  }

  get multiplier() { return Math.min(8, 1 + Math.floor(this.streak / 4)) * (this.double > 0 ? 2 : 1); }
  get topSpeed() { return 46 + Math.min(30, (this.def?.stats.top ?? 40) * 0.25); }

  /** steer: +1 left, -1 right (hit-based so each tap is one lane). */
  update(dt: number, steerTap: number, steerHeld: number) {
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.running = true;
      this.place(dt);
      return;
    }
    if (!this.running) { this.place(dt); return; }
    this.time += dt;
    this.laneCooldown -= dt;
    const want = steerTap || (this.laneCooldown <= 0 ? steerHeld : 0);
    if (want && this.laneCooldown <= 0) {
      const nl = THREE.MathUtils.clamp(this.lane + want, -1, 1);
      if (nl !== this.lane) { this.lane = nl; this.laneCooldown = 0.16; }
    }
    // +lane = left = +X when driving toward +Z
    const targetX = this.lane * LANE;
    const agility = 11 * (this.def?.stats.grip ?? 1);
    const prevX = this.x;
    this.x += (targetX - this.x) * (1 - Math.exp(-dt * agility));
    const accel = this.nitro > 0 ? 12 : 0.55;
    this.speed = Math.min(this.topSpeed + (this.nitro > 0 ? 18 : 0), this.speed + accel * dt);
    if (this.nitro <= 0 && this.speed > this.topSpeed) this.speed -= 8 * dt;
    this.z += this.speed * dt;
    this.distance += this.speed * dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.double = Math.max(0, this.double - dt);
    this.nitro = Math.max(0, this.nitro - dt);
    this.score += this.speed * dt * 0.5 * this.multiplier * (this.def?.arcade ?? 1);

    // recycle scenery
    for (const c of this.chunks) if (c.position.z < this.z - CHUNK * 1.5) c.position.z += CHUNK * CHUNKS;

    // spawn rows ahead
    while (this.nextRow < this.z + 170) { this.spawnRow(this.nextRow); this.nextRow += Math.max(22, 48 - this.time * 0.35) + Math.random() * 14; }

    // obstacles
    const pLen = this.rig.length;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.fly > 0) {
        o.fly += dt; o.mesh.position.y += dt * 8 - o.fly * dt * 18; o.mesh.rotation.z += dt * 6; o.z += o.speed * dt;
        o.mesh.position.z = o.z;
        if (o.fly > 1.5) { o.active = false; o.mesh.visible = false; }
        continue;
      }
      o.z += o.speed * dt;
      // later in a run, a car may drift into a neighbouring lane: it signals first, then moves only if
      // that still leaves an escape lane
      if (o.canChange && !o.pending && !o.laneChange && o.z - this.z < 110 && o.z - this.z > 60) {
        o.canChange = false;
        const dir = o.lane === 1 ? -1 : o.lane === -1 ? 1 : (Math.random() < 0.5 ? -1 : 1);
        if (this.leavesEscape(o, o.lane + dir)) { o.pending = dir; o.blinkT = 1.2; }
      }
      if (o.pending && (o.blinkT -= dt) <= 0) {
        if (this.leavesEscape(o, o.lane + o.pending)) o.laneChange = o.pending;
        o.pending = 0;
      }
      const signal = o.pending || o.laneChange;
      const on = !!signal && Math.floor(this.time * 3) % 2 === 0;
      o.blinkers[0].visible = on && signal < 0;
      o.blinkers[1].visible = on && signal > 0;
      if (o.laneChange) {
        o.x += Math.sign(o.laneChange) * 3.2 * dt;
        if (Math.abs(o.x - (o.lane + Math.sign(o.laneChange)) * LANE) < 0.05 || Math.abs(o.x) > LANE) { o.lane += Math.sign(o.laneChange); o.x = o.lane * LANE; o.laneChange = 0; }
      }
      o.mesh.position.set(o.x, 0, o.z);
      const dz = Math.abs(o.z - this.z), lat = Math.abs(o.x - this.x);
      const overlapZ = dz < (o.len + pLen) / 2 - 0.3;
      if (overlapZ) o.minLat = Math.min(o.minLat, lat);
      if (overlapZ && lat < 2.05 && !o.hit) {
        if (this.invuln > 0 || this.nitro > 0) {
          if (this.nitro > 0) { o.hit = true; o.fly = 0.01; this.events?.popup('SMASH +100', 'gold'); this.score += 100 * this.multiplier; }
        } else {
          o.hit = true; o.fly = 0.01;
          this.hearts--; this.streak = 0; this.invuln = 1.6; this.speed *= 0.65;
          this.events?.crash(this.hearts);
          if (this.hearts <= 0) { this.running = false; this.events?.over(Math.floor(this.score), this.nearMisses, this.coins); }
        }
      }
      if (!o.passed && o.z < this.z - (o.len + pLen) / 2) {
        o.passed = true;
        if (!o.hit && o.minLat < 4.4) {
          this.streak++; this.nearMisses++;
          const pts = 50 * this.multiplier;
          this.score += pts;
          this.events?.nearMiss(pts, this.streak);
        }
      }
      if (o.z < this.z - 40) { o.active = false; o.mesh.visible = false; }
    }

    // coins & power-ups
    for (const c of this.items) {
      if (!c.active) continue;
      if (this.magnet > 0 && c.kind === 'coin' && Math.abs(c.z - this.z) < 30) c.x += (this.x - c.x) * Math.min(1, dt * 6);
      c.mesh.position.set(c.x, 1.0 + Math.sin(this.time * 4 + c.z) * 0.15, c.z);
      c.mesh.rotation.y += dt * 4;
      if (Math.abs(c.z - this.z) < 1.8 && Math.abs(c.x - this.x) < 1.6) {
        c.active = false; c.mesh.visible = false;
        if (c.kind === 'coin') { this.coins++; this.score += 10 * this.multiplier; }
        else if (c.kind === 'magnet') this.magnet = 10;
        else if (c.kind === 'x2') this.double = 10;
        else if (c.kind === 'nitro') { this.nitro = 4; }
        this.events?.coin(c.kind);
      } else if (c.z < this.z - 10) { c.active = false; c.mesh.visible = false; }
    }
    void prevX;
    this.place(dt);
  }

  events: ArcadeEvents | null = null;

  /** Lanes covered by obstacles whose z lies within the band around z (a car mid lane change covers both). */
  private occupied(z: number, band: number, skip?: Obstacle) {
    const occ = new Set<number>();
    for (const o of this.obstacles) {
      if (!o.active || o.fly > 0 || o === skip || Math.abs(o.z - z) > band) continue;
      occ.add(o.lane);
      if (o.laneChange) occ.add(o.lane + Math.sign(o.laneChange));
      if (o.pending) occ.add(o.lane + o.pending);
    }
    return occ;
  }

  /** True if moving obstacle o to lane `to` keeps at least one lane open around it. */
  private leavesEscape(o: Obstacle, to: number) {
    if (to < -1 || to > 1) return false;
    const occ = this.occupied(o.z, ESCAPE_BAND, o);
    if (occ.has(to)) return false; // would drive into another car
    occ.add(o.lane); occ.add(to); // both lanes are blocked while it moves across
    return occ.size < 3;
  }

  private spawnRow(z: number) {
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    let blocked = Math.random() < Math.min(0.75, 0.25 + this.time * 0.006) ? 2 : 1;
    // never close the road: lanes already taken near this row count against it
    const near = this.occupied(z, ESCAPE_BAND);
    lanes.sort((a, b) => Number(near.has(b)) - Number(near.has(a))); // reuse lanes that are already blocked first
    while (blocked > 0 && new Set([...near, ...lanes.slice(0, blocked)]).size >= 3) blocked--;
    for (let i = 0; i < blocked; i++) {
      const o = this.obstacles.find((x) => !x.active);
      if (!o) break;
      // every car flows at the same speed, so rows keep their spacing and can never bunch up into a wall
      Object.assign(o, { active: true, passed: false, hit: false, fly: 0, minLat: 9, lane: lanes[i], x: lanes[i] * LANE, z, speed: FLOW_SPEED, laneChange: 0, pending: 0, blinkT: 0 });
      o.blinkers.forEach((b) => (b.visible = false));
      o.canChange = this.time > 25 && blocked === 1 && Math.random() < 0.25;
      o.mesh.visible = true; o.mesh.rotation.set(0, 0, 0); o.mesh.position.set(o.x, 0, z);
    }
    if (blocked === 0) return;
    const free = lanes.slice(blocked).find((l) => !near.has(l)) ?? lanes[blocked];
    const r = Math.random();
    if (r < 0.08) this.spawnItem(free * LANE, z, (['magnet', 'x2', 'nitro'] as const)[Math.floor(Math.random() * 3)]);
    else if (r < 0.8) for (let k = 0; k < 6; k++) this.spawnItem(free * LANE, z - 10 + k * 3.2, 'coin');
  }

  private spawnItem(x: number, z: number, kind: Coin['kind']) {
    const c = this.items.find((i) => !i.active && i.kind === kind);
    if (!c) return;
    c.active = true; c.x = x; c.z = z; c.mesh.visible = true;
  }

  private place(dt: number) {
    const rig = this.rig;
    rig.root.position.set(this.x, 0, this.z);
    rig.root.rotation.y = 0;
    const lean = THREE.MathUtils.clamp((this.lane * LANE - this.x) * 0.06, -0.12, 0.12);
    rig.root.rotation.y = lean;
    rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, -lean * 0.4, 1 - Math.exp(-dt * 8));
    rig.wheels.forEach((w) => { w.rotation.x += (this.speed * dt) / rig.wheelRadius; });
    rig.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
    rig.root.updateMatrixWorld();
  }

  /** World-space player position (arcade group is offset from the city). */
  worldPos(out = new THREE.Vector3()) { return out.set(this.x, 0, this.z).add(ARCADE_ORIGIN); }
}
