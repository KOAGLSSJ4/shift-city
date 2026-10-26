import { describe, expect, it } from 'vitest';
import { nearestSegment, route, destinationSegment, nodePos } from '../src/world/RoadNetwork';
import { DESTINATIONS } from '../src/data/world';

describe('road network', () => {
  it('snaps to the closest road', () => {
    const { proj, seg } = nearestSegment({ x: 10, z: -255 });
    expect(proj.z).toBe(-256);
    expect(seg.axis).toBe('x');
  });
  it('routes along roads to every destination', () => {
    for (const d of DESTINATIONS) {
      const r = route({ x: 0, z: 0 }, { x: 0, z: 1 }, d, destinationSegment(d));
      expect(r.points.length).toBeGreaterThan(1);
      // every interior point lies on a road centre-line (x or z is a grid line)
      for (const p of r.points.slice(1, -1)) expect((p.x + 320) % 64 === 0 || (p.z + 320) % 64 === 0).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    }
  });
  it('reports left/right turns', () => {
    // driving +Z on x=0 road, turn toward +X is a left turn in our coordinate system
    const a = nodePos(5 + 6 * 11); // (0, 64)
    const r = route({ x: 0, z: 10 }, { x: 0, z: 1 }, { x: 40, z: 64 }, { a: 5 + 6 * 11, b: 6 + 6 * 11, axis: 'x' });
    expect(a).toEqual({ x: 0, z: 64 });
    expect(r.nextTurn.dir).toBe('left');
  });
});
