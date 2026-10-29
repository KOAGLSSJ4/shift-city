// Road graph for the grid city: nearest-segment lookup and street-aware GPS routing (Dijkstra).
import { GRID, PITCH, roadCoord, type Destination } from '../data/world';

export interface Pt { x: number; z: number }
export interface Segment { a: number; b: number; axis: 'x' | 'z' }
export type TurnDir = 'left' | 'right' | 'straight' | 'arrive' | 'uturn';
export interface Route { points: Pt[]; length: number; nextTurn: { dir: TurnDir; dist: number } }

const N = GRID + 1;
export const nodeId = (i: number, j: number) => j * N + i;
export const nodePos = (id: number): Pt => ({ x: roadCoord(id % N), z: roadCoord(Math.floor(id / N)) });

export function neighbours(id: number): number[] {
  const i = id % N, j = Math.floor(id / N), out: number[] = [];
  if (i > 0) out.push(nodeId(i - 1, j));
  if (i < GRID) out.push(nodeId(i + 1, j));
  if (j > 0) out.push(nodeId(i, j - 1));
  if (j < GRID) out.push(nodeId(i, j + 1));
  return out;
}

const clampIdx = (v: number) => Math.max(0, Math.min(GRID - 1, v));

/** Closest road segment to a world point, plus the projected point on its centre-line. */
export function nearestSegment(p: Pt): { seg: Segment; proj: Pt } {
  const ki = Math.round((p.x - roadCoord(0)) / PITCH), kj = Math.round((p.z - roadCoord(0)) / PITCH);
  const vx = roadCoord(Math.max(0, Math.min(GRID, ki))), hz = roadCoord(Math.max(0, Math.min(GRID, kj)));
  const dV = Math.abs(p.x - vx), dH = Math.abs(p.z - hz);
  if (dH <= dV) {
    const j = Math.max(0, Math.min(GRID, kj)), i = clampIdx(Math.floor((p.x - roadCoord(0)) / PITCH));
    return { seg: { a: nodeId(i, j), b: nodeId(i + 1, j), axis: 'x' }, proj: { x: Math.max(roadCoord(0), Math.min(roadCoord(GRID), p.x)), z: hz } };
  }
  const i = Math.max(0, Math.min(GRID, ki)), j = clampIdx(Math.floor((p.z - roadCoord(0)) / PITCH));
  return { seg: { a: nodeId(i, j), b: nodeId(i, j + 1), axis: 'z' }, proj: { x: vx, z: Math.max(roadCoord(0), Math.min(roadCoord(GRID), p.z)) } };
}

export function destinationSegment(d: Destination): Segment {
  return d.axis === 'x'
    ? { a: nodeId(d.i, d.j), b: nodeId(d.i + 1, d.j), axis: 'x' }
    : { a: nodeId(d.j, d.i), b: nodeId(d.j, d.i + 1), axis: 'z' };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** Shortest path along roads from `from` (heading-aware for turn prompts) to `to`. */
export function route(from: Pt, heading: Pt, to: Pt, toSeg: Segment): Route {
  const { seg, proj } = nearestSegment(from);
  const sameSeg = (seg.a === toSeg.a && seg.b === toSeg.b);
  let points: Pt[];
  if (sameSeg) {
    points = [from, proj, to];
  } else {
    const total = N * N;
    const cost = new Float64Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const done = new Uint8Array(total);
    cost[seg.a] = dist(proj, nodePos(seg.a));
    cost[seg.b] = dist(proj, nodePos(seg.b));
    // Slight penalty for nodes behind the car so the GPS prefers driving forward.
    for (const n of [seg.a, seg.b]) {
      const np = nodePos(n);
      if ((np.x - proj.x) * heading.x + (np.z - proj.z) * heading.z < 0) cost[n] += 25;
    }
    for (;;) {
      let u = -1, best = Infinity;
      for (let k = 0; k < total; k++) if (!done[k] && cost[k] < best) { best = cost[k]; u = k; }
      if (u < 0) break;
      done[u] = 1;
      if (u === toSeg.a || u === toSeg.b) {
        // check if the other end might still be cheaper including the final leg; continue until both done
        if (done[toSeg.a] && done[toSeg.b]) break;
      }
      for (const v of neighbours(u)) {
        const c = cost[u] + PITCH;
        if (c < cost[v]) { cost[v] = c; prev[v] = u; }
      }
    }
    const ca = cost[toSeg.a] + dist(nodePos(toSeg.a), to), cb = cost[toSeg.b] + dist(nodePos(toSeg.b), to);
    let n = ca <= cb ? toSeg.a : toSeg.b;
    const chain: Pt[] = [];
    while (n >= 0) { chain.unshift(nodePos(n)); n = prev[n]; }
    points = [from, proj, ...chain, to];
  }
  // drop duplicate points
  points = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 0.5);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  return { points, length, nextTurn: nextTurn(points, heading) };
}

function nextTurn(points: Pt[], heading?: Pt): Route['nextTurn'] {
  // waiting at a junction, the very first leg can already be a turn: compare it with where the car faces
  // (skip the short hop from the car onto its road)
  if (heading && points.length >= 2) {
    const lead = norm(points[0], points[points.length >= 3 && dist(points[0], points[1]) < 6 ? 2 : 1]);
    const hl = Math.hypot(heading.x, heading.z);
    if (lead && hl > 0) {
      const h = { x: heading.x / hl, z: heading.z / hl };
      const cross = h.x * lead.z - h.z * lead.x, dot = h.x * lead.x + h.z * lead.z;
      if (dot < -0.7) return { dir: 'uturn', dist: 0 };
      if (Math.abs(cross) > 0.7) return { dir: cross < 0 ? 'left' : 'right', dist: 0 };
    }
  }
  let acc = 0;
  for (let i = 1; i < points.length - 1; i++) {
    acc += dist(points[i - 1], points[i]);
    const d1 = norm(points[i - 1], points[i]), d2 = norm(points[i], points[i + 1]);
    if (!d1 || !d2) continue;
    const cross = d1.x * d2.z - d1.z * d2.x, dot = d1.x * d2.x + d1.z * d2.z;
    if (!isNode(points[i])) continue; // only intersections count as turns (not the snap onto the road)
    if (dot < -0.7) return { dir: 'uturn', dist: acc };
    if (Math.abs(cross) > 0.7) return { dir: cross < 0 ? 'left' : 'right', dist: acc };
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return { dir: 'arrive', dist: total };
}

const onGrid = (v: number) => Math.abs(((v - roadCoord(0)) % PITCH + PITCH) % PITCH) < 0.01;
const isNode = (p: Pt) => onGrid(p.x) && onGrid(p.z);

function norm(a: Pt, b: Pt): Pt | null {
  const d = dist(a, b);
  return d < 0.5 ? null : { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
}
