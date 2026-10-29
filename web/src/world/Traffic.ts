// Lane-following AI traffic that obeys the signals and brakes for cars (and the player) ahead.
import * as THREE from 'three';
import { DRIVE_RIGHT, LANE_W, RING_R, ROAD_W } from '../data/world';
import type { DesignBody } from '../vehicles/designs';
import { buildTrafficCar } from '../vehicles/CarFactory';
import { isRoundabout, neighbours, neighboursOut, nodePos, type Pt } from './RoadNetwork';
import { signal } from './City';

interface Car {
  mesh: THREE.Group;
  from: number; to: number; lane: number;
  s: number; len: number; speed: number; cruise: number;
  /** Path through a junction (a curve, or round a roundabout's island) as a polyline walked by distance. */
  turn: { pts: Pt[]; cum: number[]; d: number; next: number; node: number } | null;
  pos: THREE.Vector3; heading: number;
  length: number; width: number;
  /** Current sideways offset from the road centre (eases toward the lane's offset when changing lanes). */
  shift: number;
  /** Seconds spent stopped behind the player. */
  stuck: number;
}

/** Quadratic Bezier sampled into a polyline (ordinary junction turns). */
function bezierPts(p0: Pt, p1: Pt, p2: Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    out.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z });
  }
  return out;
}

/**
 * Path round a roundabout: from the entry lane onto the ring, round the island keeping it on the left
 * (right-hand traffic: decreasing atan2 angle), then out onto the exit lane.
 */
function ringPath(c: Pt, p0: Pt, p2: Pt): Pt[] {
  const a0 = Math.atan2(p0.z - c.z, p0.x - c.x), a1 = Math.atan2(p2.z - c.z, p2.x - c.x);
  let sweep = a0 - a1;
  while (sweep <= 0.35) sweep += Math.PI * 2; // straight on is half a lap; a U-turn goes all the way round
  const out: Pt[] = [p0];
  const steps = Math.max(6, Math.ceil(sweep / 0.25));
  for (let i = 0; i <= steps; i++) {
    const a = a0 - (sweep * i) / steps;
    out.push({ x: c.x + Math.cos(a) * RING_R, z: c.z + Math.sin(a) * RING_R });
  }
  out.push(p2);
  return out;
}

function cumulative(pts: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return cum;
}

const COLORS = [0xf2f2f2, 0x111316, 0x8a8f96, 0x1d3f73, 0x7a1a1a, 0xc9c9c9, 0x2e4d39, 0xd8c7a0, 0x3a3a3a, 0x9b2c1a];
const BODIES: DesignBody[] = ['hatch', 'sedan', 'sedan', 'suv', 'sedan', 'hatch', 'gt', 'suv'];
const HW = ROAD_W / 2;

export class Traffic {
  readonly group = new THREE.Group();
  readonly cars: Car[] = [];
  private rng = 7;

  constructor(count: number) {
    for (let i = 0; i < count; i++) this.spawn();
  }

  private r() { this.rng = (this.rng * 16807) % 2147483647; return (this.rng - 1) / 2147483646; }

  private spawn() {
    const from = Math.floor(this.r() * 121);
    const nb = neighboursOut(from);
    const to = nb[Math.floor(this.r() * nb.length)];
    const mesh = buildTrafficCar(BODIES[Math.floor(this.r() * BODIES.length)], COLORS[Math.floor(this.r() * COLORS.length)]);
    this.group.add(mesh);
    const cruise = 9 + this.r() * 5;
    const lane = this.r() < 0.5 ? 0 : 1;
    const c: Car = { mesh, from, to, lane, s: HW + 4 + this.r() * 40, len: 64, speed: cruise, cruise, turn: null,
      pos: new THREE.Vector3(), heading: 0, length: mesh.userData.length, width: mesh.userData.width, shift: this.laneOffset(lane), stuck: 0 };
    // don't start on top of another car: try a few other spots on the network
    for (let tries = 0; tries < 30; tries++) {
      this.place(c);
      if (!this.cars.some((o) => o.pos.distanceTo(c.pos) < 10)) break;
      c.from = Math.floor(this.r() * 121);
      const n = neighboursOut(c.from);
      c.to = n[Math.floor(this.r() * n.length)];
      c.s = HW + 4 + this.r() * 40;
    }
    this.cars.push(c);
  }

  private laneOffset(lane: number) { return (DRIVE_RIGHT ? 1 : -1) * (LANE_W / 2 + lane * LANE_W); }

  private lanePoint(from: number, to: number, s: number, lane: number, off = this.laneOffset(lane)): Pt {
    const a = nodePos(from), b = nodePos(to);
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    // right of direction (dx,dz) is (-dz, dx)
    return { x: a.x + dx * s - dz * off, z: a.z + dz * s + dx * off };
  }

  private place(c: Car) {
    let p: Pt, dir: Pt;
    if (c.turn) {
      const { pts, cum, d } = c.turn;
      let k = 1;
      while (k < pts.length - 1 && cum[k] < d) k++;
      const a = pts[k - 1], b = pts[k], seg = Math.max(1e-6, cum[k] - cum[k - 1]);
      const f = Math.min(1, Math.max(0, (d - cum[k - 1]) / seg));
      p = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
      dir = { x: b.x - a.x, z: b.z - a.z };
    } else {
      p = this.lanePoint(c.from, c.to, c.s, c.lane, c.shift);
      const a = nodePos(c.from), b = nodePos(c.to);
      dir = { x: b.x - a.x, z: b.z - a.z };
    }
    c.pos.set(p.x, 0, p.z);
    c.heading = Math.atan2(dir.x, dir.z);
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y = c.heading;
  }

  private chooseNext(c: Car): number {
    const opts = neighboursOut(c.to).filter((n) => n !== c.from);
    if (!opts.length) return c.from;
    const a = nodePos(c.from), b = nodePos(c.to);
    const d = { x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) };
    const kind = (n: number) => {
      const p = nodePos(n), e = { x: Math.sign(p.x - b.x), z: Math.sign(p.z - b.z) };
      const cross = d.x * e.z - d.z * e.x;
      return cross === 0 ? 'straight' : cross < 0 ? 'left' : 'right';
    };
    // inner lane may go straight/left, outer lane straight/right
    const allowed = opts.filter((n) => kind(n) === 'straight' || (c.lane === 0 ? kind(n) === 'left' : kind(n) === 'right'));
    const pool = allowed.length ? allowed : opts;
    const straight = pool.find((n) => kind(n) === 'straight');
    if (straight !== undefined && this.r() < 0.55) return straight;
    return pool[Math.floor(this.r() * pool.length)];
  }

  update(dt: number, time: number, player: { pos: THREE.Vector3; heading: number }) {
    for (const c of this.cars) {
      const fwd = { x: Math.sin(c.heading), z: Math.cos(c.heading) };
      // look-ahead for obstacles
      let gap = Infinity;
      const probe = (px: number, pz: number, len: number) => {
        const rx = px - c.pos.x, rz = pz - c.pos.z;
        const ahead = rx * fwd.x + rz * fwd.z, lat = Math.abs(rx * fwd.z - rz * fwd.x);
        if (ahead > 0 && ahead < 30 && lat < 2.2) gap = Math.min(gap, ahead - (c.length + len) / 2);
      };
      for (const o of this.cars) if (o !== c) probe(o.pos.x, o.pos.z, o.length);
      const carGap = gap;
      probe(player.pos.x, player.pos.z, 4.5);
      // stuck behind a stopped player: after a few seconds, change lanes and go round (if that lane is clear)
      if (!c.turn && gap < carGap && gap < 6 && c.speed < 0.5) c.stuck += dt; else c.stuck = 0;
      if (c.stuck > 2.5) {
        const other = 1 - c.lane;
        const clear = !this.cars.some((o) => o !== c && !o.turn && o.from === c.from && o.to === c.to && o.lane === other && Math.abs(o.s - c.s) < 12);
        if (clear) { c.lane = other; c.stuck = 0; gap = carGap; }
      }
      c.shift += (this.laneOffset(c.lane) - c.shift) * Math.min(1, dt * 2.5);
      // roundabout: give way to cars already circling the island
      if (!c.turn && isRoundabout(c.to)) {
        const stopAt = c.len - ROAD_W / 2 - 4.5, toStop = stopAt - c.s;
        if (toStop < 12 && toStop > -0.5) {
          const centre = nodePos(c.to);
          const busy = this.cars.some((o) => o !== c && o.turn?.node === c.to && Math.hypot(o.pos.x - centre.x, o.pos.z - centre.z) < RING_R + 2
            && Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 14);
          if (busy) gap = Math.min(gap, toStop + 0.5);
        }
      }
      // red light: stop before the crosswalk
      if (!c.turn && !isRoundabout(c.to)) {
        const a = nodePos(c.from), b = nodePos(c.to);
        const axis = Math.abs(b.x - a.x) > 0 ? 'x' : 'z';
        const stopAt = c.len - HW - 4.5;
        const st = signal(axis, time);
        if (neighbours(c.to).length >= 3 && st !== 'green' && c.s < stopAt + 0.5) {
          const toStop = stopAt - c.s;
          if (st === 'red' || toStop > c.speed * 0.9) gap = Math.min(gap, toStop + 0.5);
        }
      }
      const target = gap < 1.5 ? 0 : Math.min(c.cruise, Math.max(0, (gap - 1.5) * 0.9));
      c.speed += Math.max(-9 * dt, Math.min(3 * dt, target - c.speed));
      if (c.speed < 0) c.speed = 0;

      if (c.turn) {
        c.turn.d += c.speed * dt;
        if (c.turn.d >= c.turn.cum[c.turn.cum.length - 1]) {
          c.from = c.to; c.to = c.turn.next; c.s = HW + 4; c.turn = null;
        }
      } else {
        c.s += c.speed * dt;
        if (c.s >= c.len - HW - 4) {
          c.shift = this.laneOffset(c.lane);
          const next = this.chooseNext(c);
          const p0 = this.lanePoint(c.from, c.to, c.len - HW - 4, c.lane);
          const p2 = this.lanePoint(c.to, next, HW + 4, c.lane);
          const b = nodePos(c.to);
          // control point: intersection of the two lane lines (or midpoint for straight)
          const a = nodePos(c.from);
          const inX = Math.abs(b.x - a.x) > 0;
          const p1 = next === c.from ? { x: b.x, z: b.z } : inX === (Math.abs(nodePos(next).x - b.x) > 0) ? { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 } : inX ? { x: p2.x, z: p0.z } : { x: p0.x, z: p2.z };
          const pts = isRoundabout(c.to) ? ringPath(b, p0, p2) : bezierPts(p0, p1, p2);
          c.turn = { pts, cum: cumulative(pts), d: 0, next, node: c.to };
        }
      }
      this.place(c);
    }
  }

  setVisible(v: boolean) { this.group.visible = v; }
}
