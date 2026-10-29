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
/** You must still be in a car's lane when it's this close (m) for the dodge to count as a near miss. */
const NEAR_MISS_GAP = 12;
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
  pending: number; blinkT: number; blinkers: THREE.Object3D[];
  /** Lane the player was in when this car was dead ahead in their lane (null = never a threat). */
  threatLane: number | null }
export type ItemKind = 'coin' | PowerKind | 'mystery';
export type PowerKind = 'magnet' | 'x2' | 'nitro' | 'shield' | 'jet';
interface Coin { mesh: THREE.Object3D; active: boolean; z: number; x: number; y: number; kind: ItemKind; pop: number }

/** How long each power-up lasts (the shield lasts until it saves you, or this long). */
export const POWER_TIME: Record<PowerKind, number> = { magnet: 12, x2: 12, nitro: 4, shield: 25, jet: 7 };
const POWER_WEIGHT: [PowerKind, number][] = [['magnet', 26], ['x2', 20], ['shield', 20], ['jet', 16], ['nitro', 18]];
const FLY_HEIGHT = 5.2;

export interface ArcadeEvents {
  coin(kind: ItemKind): void;
  /** Mystery box result, already applied (e.g. '+500', 'EXTRA LIFE', a power-up name). */
  mystery(result: string): void;
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
  invuln = 0; magnet = 0; double = 0; nitro = 0; shield = 0; jet = 0; y = 0;
  runId = '';
  private chunks: THREE.Group[] = [];
  private obstacles: Obstacle[] = [];
  private items: Coin[] = [];
  private nextRow = 60;
  private nextPower = 0;
  private nextMystery = 0;
  private fx!: { magnet: THREE.Mesh; shield: THREE.Mesh; flames: THREE.Group };
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
      this.obstacles.push({ mesh, lane: 0, x: 0, z: 0, speed: 0, len, active: false, passed: false, minLat: 9, hit: false, fly: 0, laneChange: 0, canChange: false, pending: 0, blinkT: 0, blinkers, threatLane: null });
    }
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24); coinGeo.rotateZ(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcf49, metalness: 1, roughness: 0.18, emissive: 0x7a4a00, emissiveIntensity: 0.5 });
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(coinGeo, coinMat); m.visible = false; this.group.add(m);
      this.items.push({ mesh: m, active: false, z: 0, x: 0, y: 1, kind: 'coin', pop: 0 });
    }
    for (const kind of ['magnet', 'x2', 'nitro', 'shield', 'jet', 'mystery'] as const) for (let i = 0; i < 2; i++) {
      const m = makeIcon(kind); m.visible = false; this.group.add(m);
      this.items.push({ mesh: m, active: false, z: 0, x: 0, y: 1.2, kind, pop: 0 });
    }
    // power-up effects that ride along with the player car
    const magnet = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    magnet.rotation.x = Math.PI / 2;
    const shield = new THREE.Mesh(new THREE.SphereGeometry(2.9, 32, 16), new THREE.MeshBasicMaterial({ color: 0x54d8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    shield.scale.set(0.85, 0.6, 1);
    const flames = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sx of [-0.55, 0.55]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 12), flameMat);
      f.rotation.x = Math.PI; f.position.set(sx, -0.5, -0.9);
      flames.add(f);
    }
    for (const m of [magnet, shield, flames]) { m.visible = false; this.group.add(m); }
    this.fx = { magnet, shield, flames };
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
    Object.assign(this, { running: false, countdown: 3, score: 0, coins: 0, streak: 0, nearMisses: 0, hearts: 3, distance: 0, speed: 24, time: 0, lane: 0, x: 0, z: 0, y: 0, invuln: 0, magnet: 0, double: 0, nitro: 0, shield: 0, jet: 0, nextRow: 70, nextPower: 7, nextMystery: 28 });
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
  /** Active timed power-ups for the HUD: remaining seconds and full duration. */
  get powers(): { kind: PowerKind; left: number; total: number }[] {
    const out: { kind: PowerKind; left: number; total: number }[] = [];
    const add = (kind: PowerKind, left: number) => { if (left > 0) out.push({ kind, left, total: POWER_TIME[kind] }); };
    add('jet', this.jet); add('nitro', this.nitro); add('magnet', this.magnet); add('x2', this.double); add('shield', this.shield);
    return out;
  }

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
    this.shield = Math.max(0, this.shield - dt);
    const wasFlying = this.jet > 0;
    this.jet = Math.max(0, this.jet - dt);
    if (wasFlying && this.jet <= 0) this.invuln = Math.max(this.invuln, 1.0); // a moment of grace after landing
    const wantY = this.jet > 0.5 ? FLY_HEIGHT : 0;
    this.y += (wantY - this.y) * (1 - Math.exp(-dt * (wantY > this.y ? 4 : 3)));
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
      const airborne = this.y > 1.4 || this.jet > 0; // safe from take-off to touch-down
      const overlapZ = !airborne && dz < (o.len + pLen) / 2 - 0.3;
      if (overlapZ) o.minLat = Math.min(o.minLat, lat);
      // a car only becomes a near-miss candidate if it's still in your lane when it's close: a late, risky dodge
      if (!airborne && o.z > this.z && o.z - this.z < NEAR_MISS_GAP && lat < 1.6) o.threatLane = Math.round(this.x / LANE); // where the car physically is
      if (overlapZ && lat < 2.05 && !o.hit) {
        if (this.invuln > 0 || this.nitro > 0) {
          if (this.nitro > 0) { o.hit = true; o.fly = 0.01; this.events?.popup('SMASH +100', 'gold'); this.score += 100 * this.multiplier; }
        } else if (this.shield > 0) {
          o.hit = true; o.fly = 0.01; this.shield = 0; this.invuln = 1.2;
          this.events?.popup('SHIELD SAVED YOU!', 'cyan');
        } else {
          o.hit = true; o.fly = 0.01;
          this.hearts--; this.streak = 0; this.invuln = 1.6; this.speed *= 0.65;
          this.events?.crash(this.hearts);
          if (this.hearts <= 0) { this.running = false; this.events?.over(Math.floor(this.score), this.nearMisses, this.coins); }
        }
      }
      if (!o.passed && o.z < this.z - (o.len + pLen) / 2) {
        o.passed = true;
        // near miss = you were heading for it and changed lanes to slip past
        if (!o.hit && o.minLat < 4.4 && o.threatLane !== null && o.threatLane !== Math.round(this.x / LANE)) {
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
      if (c.pop > 0) {
        // collected: zip into the car and shrink away
        c.pop += dt;
        c.x += (this.x - c.x) * Math.min(1, dt * 18); c.y += (this.y + 1.2 - c.y) * Math.min(1, dt * 18); c.z += (this.z - c.z) * Math.min(1, dt * 18);
        const k = Math.max(0.01, 1 - c.pop * 5);
        c.mesh.scale.setScalar(k);
        c.mesh.position.set(c.x, c.y, c.z);
        if (c.pop > 0.2) { c.active = false; c.mesh.visible = false; c.mesh.scale.setScalar(1); }
        continue;
      }
      // the magnet pulls coins from every lane (and from the sky lane while flying)
      if (this.magnet > 0 && c.kind === 'coin' && c.z - this.z < 45 && c.z - this.z > -2) {
        const f = Math.min(1, dt * 7);
        c.x += (this.x - c.x) * f; c.y += (this.y + 1 - c.y) * f; c.z += (this.z - c.z) * f * 0.5;
      }
      c.mesh.position.set(c.x, c.y + Math.sin(this.time * 4 + c.z) * 0.15, c.z);
      c.mesh.rotation.y += dt * (c.kind === 'coin' ? 5 : 2.5);
      if (Math.abs(c.z - this.z) < 1.9 && Math.abs(c.x - this.x) < 1.7 && Math.abs(c.y - (this.y + 1)) < 2.2) {
        c.pop = 0.001;
        this.collect(c.kind);
      } else if (c.z < this.z - 10) { c.active = false; c.mesh.visible = false; }
    }
    void prevX;
    this.place(dt);
  }

  events: ArcadeEvents | null = null;

  private collect(kind: ItemKind) {
    if (kind === 'coin') { this.coins++; this.score += 10 * this.multiplier; }
    else if (kind === 'mystery') { this.openMystery(); return; }
    else this.activate(kind);
    this.events?.coin(kind);
  }

  private activate(kind: PowerKind) {
    const t = POWER_TIME[kind];
    if (kind === 'magnet') this.magnet = t;
    else if (kind === 'x2') this.double = t;
    else if (kind === 'nitro') this.nitro = t;
    else if (kind === 'shield') this.shield = t;
    else if (kind === 'jet') { this.jet = t; this.skyCoins(); }
  }

  /** Mystery box: a points bundle, a coin shower, an extra life or a random power-up. */
  private openMystery() {
    const r = Math.random();
    let result: string;
    if (r < 0.3) { const pts = [250, 500, 1000][Math.floor(Math.random() * 3)] * this.multiplier; this.score += pts; result = `+${pts.toLocaleString()}`; }
    else if (r < 0.5) { this.coins += 25; this.score += 250 * this.multiplier; result = '+25 COINS'; }
    else if (r < 0.65 && this.hearts < 3) { this.hearts++; result = 'EXTRA LIFE ♥'; }
    else { const k = pickPower(); this.activate(k); result = POWER_LABEL[k]; }
    this.events?.mystery(result);
  }

  /** A weaving trail of coins up in the sky for the length of a Sky Boost. */
  private skyCoins() {
    const len = this.speed * POWER_TIME.jet * 0.9;
    for (let d = 30; d < len; d += 4.5) {
      const lane = Math.round(Math.sin(d / 40) * 1.2);
      this.spawnItem(THREE.MathUtils.clamp(lane, -1, 1) * LANE, this.z + d, 'coin', FLY_HEIGHT + 1);
    }
  }

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
      Object.assign(o, { active: true, passed: false, hit: false, fly: 0, minLat: 9, lane: lanes[i], x: lanes[i] * LANE, z, speed: FLOW_SPEED, laneChange: 0, pending: 0, blinkT: 0, threatLane: null });
      o.blinkers.forEach((b) => (b.visible = false));
      o.canChange = this.time > 25 && blocked === 1 && Math.random() < 0.25;
      o.mesh.visible = true; o.mesh.rotation.set(0, 0, 0); o.mesh.position.set(o.x, 0, z);
    }
    if (blocked === 0) return;
    const free = lanes.slice(blocked).find((l) => !near.has(l)) ?? lanes[blocked];
    // a power-up every 8-13 s and a mystery box every ~30 s, always in a lane you can reach
    if (this.time >= this.nextPower) { this.nextPower = this.time + 8 + Math.random() * 5; this.spawnItem(free * LANE, z, pickPower()); return; }
    if (this.time >= this.nextMystery) { this.nextMystery = this.time + 26 + Math.random() * 10; this.spawnItem(free * LANE, z, 'mystery'); return; }
    const open = [-1, 0, 1].filter((l) => !lanes.slice(0, blocked).includes(l) && !near.has(l));
    const r = Math.random();
    if (r < 0.45) for (let k = 0; k < 6; k++) this.spawnItem(free * LANE, z - 10 + k * 3.2, 'coin');
    else if (r < 0.65) for (let k = 0; k < 10; k++) this.spawnItem(free * LANE, z - 16 + k * 3.2, 'coin');
    else if (r < 0.85 && open.length > 1) {
      // weave: the line slides from one open lane into the other
      const [a, b] = Math.random() < 0.5 ? open : [...open].reverse();
      for (let k = 0; k < 8; k++) { const t = THREE.MathUtils.smoothstep(k, 2, 5); this.spawnItem((a + (b - a) * t) * LANE, z - 12 + k * 3.2, 'coin'); }
    }
  }

  private spawnItem(x: number, z: number, kind: ItemKind, y = kind === 'coin' ? 1.0 : 1.3) {
    const c = this.items.find((i) => !i.active && i.kind === kind);
    if (!c) return;
    Object.assign(c, { active: true, x, z, y, pop: 0 });
    c.mesh.visible = true; c.mesh.scale.setScalar(1);
    c.mesh.position.set(x, y, z);
  }

  private place(dt: number) {
    const rig = this.rig;
    rig.root.position.set(this.x, this.y, this.z);
    const { magnet, shield, flames } = this.fx;
    magnet.visible = this.magnet > 0 && (this.magnet > 2 || Math.floor(this.time * 8) % 2 === 0);
    magnet.position.set(this.x, this.y + 0.4, this.z);
    magnet.scale.setScalar(1 + Math.sin(this.time * 10) * 0.06);
    shield.visible = this.shield > 0 && (this.shield > 2 || Math.floor(this.time * 8) % 2 === 0);
    shield.position.set(this.x, this.y + 0.7, this.z);
    flames.visible = this.jet > 0 || this.y > 0.3;
    flames.position.set(this.x, this.y, this.z);
    flames.scale.y = 0.8 + Math.random() * 0.4;
    rig.root.rotation.y = 0;
    const lean = THREE.MathUtils.clamp((this.lane * LANE - this.x) * 0.06, -0.12, 0.12);
    rig.root.rotation.y = lean;
    rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, -lean * 0.4, 1 - Math.exp(-dt * 8));
    rig.wheels.forEach((w) => { w.rotation.x += (this.speed * dt) / rig.wheelRadius; });
    rig.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
    rig.root.updateMatrixWorld();
  }

  /** World-space player position (arcade group is offset from the city). */
  worldPos(out = new THREE.Vector3()) { return out.set(this.x, this.y, this.z).add(ARCADE_ORIGIN); }
}

export const POWER_LABEL: Record<PowerKind, string> = { magnet: 'MAGNET!', x2: 'DOUBLE SCORE!', nitro: 'NITRO!', shield: 'SHIELD!', jet: 'SKY BOOST!' };

function pickPower(): PowerKind {
  const total = POWER_WEIGHT.reduce((n, [, w]) => n + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of POWER_WEIGHT) if ((r -= w) < 0) return k;
  return 'magnet';
}

/** Chunky floating pickup icons, each with a glowing halo so they read from far away. */
function makeIcon(kind: PowerKind | 'mystery'): THREE.Group {
  const g = new THREE.Group();
  const glow = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.3 });
  const col = { magnet: 0xff3b5c, x2: 0x54ffd0, nitro: 0x4c8dff, shield: 0x54d8ff, jet: 0xffa040, mystery: 0xffcf49 }[kind];
  if (kind === 'magnet') {
    const u = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 10, 24, Math.PI), glow(col)); u.rotation.z = Math.PI;
    const tips = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.2 });
    for (const x of [-0.5, 0.5]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.36), tips); t.position.set(x, 0.12, 0); g.add(t); }
    g.add(u);
  } else if ((kind === 'x2' || kind === 'mystery') && typeof document === 'undefined') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow(col))); // headless (tests): no canvas for the label
  } else if (kind === 'x2' || kind === 'mystery') {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = kind === 'x2' ? '#0b3d33' : '#4a3200'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = kind === 'x2' ? '#54ffd0' : '#ffcf49'; x.font = '900 76px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(kind === 'x2' ? '2×' : '?', 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.3 })));
  } else if (kind === 'nitro') {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 18), glow(col));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 })); cap.position.y = 0.66;
    g.add(can, cap); g.rotation.z = 0.4;
  } else if (kind === 'shield') {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.18, 6), glow(col)); s.rotation.x = Math.PI / 2;
    g.add(s);
  } else {
    for (const x of [-0.25, 0.25]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 14), glow(col)); t.position.x = x; g.add(t); }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 })); fin.position.y = 0.2; g.add(fin);
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.name = 'halo';
  g.add(halo);
  g.scale.setScalar(1.15);
  return g;
}
