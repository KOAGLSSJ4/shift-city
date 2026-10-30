// Road graph for the grid city: nearest-segment lookup and street-aware GPS routing (Dijkstra).
import { GRID, HALF, ONE_WAY, PITCH, RING_CORNER, RING_D, ROUNDABOUTS, roadCoord, type Destination } from '../data/world';

export interface Pt { x: number; z: number }
export interface Segment { a: number; b: number; axis: 'x' | 'z' }
export type TurnDir = 'left' | 'right' | 'straight' | 'arrive' | 'uturn' | 'roundabout';
export interface Route { points: Pt[]; length: number; nextTurn: { dir: TurnDir; dist: number; exit?: number } }

const N = GRID + 1;
export const nodeId = (i: number, j: number) => j * N + i;

// ---- ring road: four T-junctions beyond the grid (north, east, south, west), each joined to the middle of a grid edge
const MID = GRID / 2;
export const RING_NODES = [N * N, N * N + 1, N * N + 2, N * N + 3];
export const NODE_COUNT = N * N + RING_NODES.length;
const RING_POS: Pt[] = [{ x: 0, z: -RING_D }, { x: RING_D, z: 0 }, { x: 0, z: RING_D }, { x: -RING_D, z: 0 }];
/** Grid node each ring junction links to (middle of the north, east, south and west edges). */
const RING_LINK = [nodeId(MID, 0), nodeId(GRID, MID), nodeId(MID, GRID), nodeId(0, MID)];
export const isRingNode = (id: number) => id >= N * N;

export const nodePos = (id: number): Pt => (id >= N * N ? RING_POS[id - N * N] : { x: roadCoord(id % N), z: roadCoord(Math.floor(id / N)) });

/** Polyline of ring edge k (ring node k → k+1, clockwise on the map): straight, rounded corner, straight. */
function ringEdge(k: number): Pt[] {
  const c = RING_D - RING_CORNER, a = RING_POS[k], b = RING_POS[(k + 1) % 4];
  const centres: Pt[] = [{ x: c, z: -c }, { x: c, z: c }, { x: -c, z: c }, { x: -c, z: -c }];
  const a0 = -Math.PI / 2 + (k * Math.PI) / 2, cc = centres[k];
  const pts: Pt[] = [a];
  for (let i = 0; i <= 12; i++) {
    const ang = a0 + (i / 12) * (Math.PI / 2);
    pts.push({ x: cc.x + Math.cos(ang) * RING_CORNER, z: cc.z + Math.sin(ang) * RING_CORNER });
  }
  pts.push(b);
  return pts;
}
const RING_EDGES = [0, 1, 2, 3].map(ringEdge);

/** The road between two neighbouring nodes as a polyline from a to b (two points for straight roads). */
export function edgePath(a: number, b: number): Pt[] {
  if (isRingNode(a) && isRingNode(b)) {
    const ka = a - N * N, kb = b - N * N;
    if ((ka + 1) % 4 === kb) return RING_EDGES[ka];
    return [...RING_EDGES[kb]].reverse();
  }
  return [nodePos(a), nodePos(b)];
}
const lengthCache = new Map<string, number>();
export function edgeLength(a: number, b: number): number {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  let L = lengthCache.get(key);
  if (L === undefined) {
    const p = edgePath(a, b);
    L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    lengthCache.set(key, L);
  }
  return L;
}

/** Point `s` metres along the road a → b, plus the direction of travel there. */
export function pointAlong(a: number, b: number, s: number): { p: Pt; dir: Pt } {
  const path = edgePath(a, b);
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1], p1 = path[i], seg = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    if (s <= seg || i === path.length - 1) {
      const t = seg > 0 ? Math.max(0, Math.min(1, s / seg)) : 0, dir = seg > 0 ? { x: (p1.x - p0.x) / seg, z: (p1.z - p0.z) / seg } : { x: 0, z: 1 };
      return { p: { x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t }, dir };
    }
    s -= seg;
  }
  return { p: path[0], dir: { x: 0, z: 1 } };
}

const ROUNDABOUT_IDS = new Set(ROUNDABOUTS.map(([i, j]) => j * N + i));
export const isRoundabout = (id: number) => ROUNDABOUT_IDS.has(id);

/** Angle (radians, atan2(z, x)) of the road leaving node `id` towards node `to`. */
const armAngle = (id: number, to: number) => { const a = nodePos(id), b = nodePos(to); return Math.atan2(b.z - a.z, b.x - a.x); };

/**
 * Exit number at a roundabout (1 = first exit), counting arms in the direction traffic circulates
 * (island on the driver's left with right-hand traffic: decreasing atan2 angle).
 */
export function roundaboutExit(id: number, from: number, to: number): number {
  const a0 = armAngle(id, from), aOut = armAngle(id, to);
  const ccw = (a: number) => { let d = a0 - a; while (d <= 1e-6) d += Math.PI * 2; return d; };
  const target = ccw(aOut);
  return neighbours(id).filter((n) => n !== from && ccw(armAngle(id, n)) <= target + 1e-6).length;
}

/** False if a one-way street forbids driving from node `a` to the neighbouring node `b`. */
export function canDrive(a: number, b: number): boolean {
  const ai = a % N, aj = Math.floor(a / N), bi = b % N, bj = Math.floor(b / N);
  for (const w of ONE_WAY) {
    if (w.axis === 'x' && aj === w.k && bj === w.k && Math.sign(bi - ai) !== w.dir) return false;
    if (w.axis === 'z' && ai === w.k && bi === w.k && Math.sign(bj - aj) !== w.dir) return false;
  }
  return true;
}
/** Neighbours you may legally drive to. */
export const neighboursOut = (id: number) => neighbours(id).filter((n) => canDrive(id, n));

export function neighbours(id: number): number[] {
  if (isRingNode(id)) { const k = id - N * N; return [RING_NODES[(k + 3) % 4], RING_NODES[(k + 1) % 4], RING_LINK[k]]; }
  const i = id % N, j = Math.floor(id / N), out: number[] = [];
  if (i > 0) out.push(nodeId(i - 1, j));
  if (i < GRID) out.push(nodeId(i + 1, j));
  if (j > 0) out.push(nodeId(i, j - 1));
  if (j < GRID) out.push(nodeId(i, j + 1));
  const link = RING_LINK.indexOf(id);
  if (link >= 0) out.push(RING_NODES[link]);
  return out;
}

const clampIdx = (v: number) => Math.max(0, Math.min(GRID - 1, v));

/** Closest road segment to a world point, plus the projected point on its centre-line (grid, ring and links). */
export function nearestSegment(p: Pt): { seg: Segment; proj: Pt } {
  const grid = nearestGridSegment(p);
  // outside the grid, the ring road or a link road may be closer
  if (Math.max(Math.abs(p.x), Math.abs(p.z)) < HALF + 10) return grid;
  let best = { seg: grid.seg, proj: grid.proj, d: Math.hypot(p.x - grid.proj.x, p.z - grid.proj.z) };
  const edges: [number, number][] = [];
  for (let k = 0; k < 4; k++) { edges.push([RING_NODES[k], RING_NODES[(k + 1) % 4]]); edges.push([RING_LINK[k], RING_NODES[k]]); }
  for (const [a, b] of edges) {
    const path = edgePath(a, b);
    for (let i = 1; i < path.length; i++) {
      const q = closestOnSeg(p, path[i - 1], path[i]), d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best.d) best = { seg: { a, b, axis: 'x' }, proj: q, d };
    }
  }
  return { seg: best.seg, proj: best.proj };
}
function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function nearestGridSegment(p: Pt): { seg: Segment; proj: Pt } {
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
  if (d.edge) return { a: d.edge[0], b: d.edge[1], axis: 'x' };
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
    const total = NODE_COUNT;
    const cost = new Float64Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const done = new Uint8Array(total);
    cost[seg.a] = dist(proj, nodePos(seg.a));
    cost[seg.b] = dist(proj, nodePos(seg.b));
    // Slight penalty for nodes behind the car so the GPS prefers driving forward.
    for (const n of [seg.a, seg.b]) {
      const np = nodePos(n);
      if ((np.x - proj.x) * heading.x + (np.z - proj.z) * heading.z < 0) cost[n] += 25;
      // on a one-way street you can only head for the end the traffic flows to
      const other = n === seg.a ? seg.b : seg.a;
      if (!canDrive(other, n)) cost[n] += 1e5;
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
      for (const v of neighboursOut(u)) {
        const c = cost[u] + edgeLength(u, v);
        if (c < cost[v]) { cost[v] = c; prev[v] = u; }
      }
    }
    // enter the destination's street from an end the traffic is allowed to come from
    const ca = cost[toSeg.a] + dist(nodePos(toSeg.a), to) + (canDrive(toSeg.a, toSeg.b) ? 0 : 1e5);
    const cb = cost[toSeg.b] + dist(nodePos(toSeg.b), to) + (canDrive(toSeg.b, toSeg.a) ? 0 : 1e5);
    let n = ca <= cb ? toSeg.a : toSeg.b;
    const ids: number[] = [];
    while (n >= 0) { ids.unshift(n); n = prev[n]; }
    // follow the real road between junctions (curves on the ring road)
    const chain: Pt[] = ids.length ? [nodePos(ids[0])] : [];
    for (let k = 1; k < ids.length; k++) chain.push(...edgePath(ids[k - 1], ids[k]).slice(1));
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
    const nodeHere = nodeAt(points[i]);
    if (nodeHere !== null && isRoundabout(nodeHere)) {
      const prevN = nodeAt(points[i - 1]) ?? nodeAt(stepBack(points[i], points[i - 1])), nextN = nodeAt(points[i + 1]) ?? nodeAt(stepBack(points[i], points[i + 1]));
      if (prevN !== null && nextN !== null && prevN !== nextN) return { dir: 'roundabout', dist: acc, exit: roundaboutExit(nodeHere, prevN, nextN) };
    }
    if (dot < -0.7) return { dir: 'uturn', dist: acc };
    if (Math.abs(cross) > 0.7) return { dir: cross < 0 ? 'left' : 'right', dist: acc };
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return { dir: 'arrive', dist: total };
}

/** Node id at a point exactly on a junction (or null). */
function nodeAt(p: Pt): number | null {
  if (!onGrid(p.x) || !onGrid(p.z)) return null;
  return Math.round((p.z - roadCoord(0)) / PITCH) * N + Math.round((p.x - roadCoord(0)) / PITCH);
}
/** The neighbouring junction in the direction of `toward` from junction `from`. */
function stepBack(from: Pt, toward: Pt): Pt {
  const dx = Math.sign(Math.round(toward.x - from.x)), dz = Math.sign(Math.round(toward.z - from.z));
  return { x: from.x + dx * PITCH, z: from.z + dz * PITCH };
}

const onGrid = (v: number) => Math.abs(((v - roadCoord(0)) % PITCH + PITCH) % PITCH) < 0.01;
const isNode = (p: Pt) => (onGrid(p.x) && onGrid(p.z)) || RING_POS.some((r) => Math.abs(r.x - p.x) < 0.01 && Math.abs(r.z - p.z) < 0.01);

function norm(a: Pt, b: Pt): Pt | null {
  const d = dist(a, b);
  return d < 0.5 ? null : { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
}
