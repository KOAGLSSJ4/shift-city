import { describe, expect, it } from 'vitest';
import { ROUNDABOUTS } from '../src/data/world';
import { isRoundabout, neighbours, nodeId, nodePos, roundaboutExit } from '../src/world/RoadNetwork';

describe('roundabouts', () => {
  const [i, j] = ROUNDABOUTS[0];
  const id = nodeId(i, j);
  it('are registered junctions with four arms', () => {
    expect(isRoundabout(id)).toBe(true);
    expect(neighbours(id).length).toBe(4);
  });
  it('number exits like right-hand traffic: right = 1st, straight = 2nd, left = 3rd', () => {
    const c = nodePos(id);
    for (const from of neighbours(id)) {
      const f = nodePos(from), d = { x: Math.sign(c.x - f.x), z: Math.sign(c.z - f.z) };
      const right = { x: -d.z, z: d.x }; // right of travel direction, as the traffic code uses
      const arm = (v: { x: number; z: number }) => neighbours(id).find((n) => { const p = nodePos(n); return Math.sign(p.x - c.x) === v.x && Math.sign(p.z - c.z) === v.z; })!;
      expect(roundaboutExit(id, from, arm(right))).toBe(1);
      expect(roundaboutExit(id, from, arm(d))).toBe(2);
      expect(roundaboutExit(id, from, arm({ x: -right.x, z: -right.z }))).toBe(3);
    }
  });
});

import { ONE_WAY, PITCH, roadCoord } from '../src/data/world';
import { canDrive, nearestSegment, route } from '../src/world/RoadNetwork';
describe('one-way streets', () => {
  const w = ONE_WAY.find((o) => o.axis === 'x')!;
  it('forbid driving against the arrows', () => {
    expect(canDrive(nodeId(3, w.k), nodeId(3 + w.dir, w.k))).toBe(true);
    expect(canDrive(nodeId(3 + w.dir, w.k), nodeId(3, w.k))).toBe(false);
  });
  it('GPS goes round instead of the wrong way', () => {
    const z = roadCoord(w.k);
    const from = { x: roadCoord(6), z }, to = { x: roadCoord(2) + PITCH / 2, z }; // destination "behind" the flow
    const r = route(from, { x: -w.dir, z: 0 }, to, nearestSegment(to).seg);
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const onRow = Math.abs(a.z - z) < 0.5 && Math.abs(b.z - z) < 0.5;
      if (onRow && Math.abs(b.x - a.x) > 1) expect(Math.sign(b.x - a.x)).toBe(w.dir);
    }
  });
});
