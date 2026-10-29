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
