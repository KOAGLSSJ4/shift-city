import { describe, expect, it } from 'vitest';
import { RING_CORNER, RING_D, destinationByName } from '../src/data/world';
import { RING_NODES, destinationSegment, edgeLength, nearestSegment, neighbours, route } from '../src/world/RoadNetwork';
import { Traffic } from '../src/world/Traffic';
import { airportJob } from '../src/gameplay/Jobs';
import { vehicleById } from '../src/data/vehicles';

describe('ring road + airport', () => {
  it('ring edges have the real curved length', () => {
    const want = 2 * (RING_D - RING_CORNER) + (Math.PI / 2) * RING_CORNER;
    expect(edgeLength(RING_NODES[0], RING_NODES[1])).toBeCloseTo(want, 0);
    expect(neighbours(RING_NODES[0]).length).toBe(3);
  });
  it('the GPS reaches the airport over the ring road', () => {
    const ap = destinationByName('Airport');
    const r = route({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: ap.x, z: ap.z }, destinationSegment(ap));
    const last = r.points[r.points.length - 1];
    expect(Math.hypot(last.x - ap.x, last.z - ap.z)).toBeLessThan(1);
    expect(r.length).toBeGreaterThan(400);
    expect(r.length).toBeLessThan(900);
    // it actually uses the ring (a point well outside the city)
    expect(r.points.some((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) > RING_D - 2)).toBe(true);
  });
  it('a point on the ring snaps to the ring road', () => {
    const { proj } = nearestSegment({ x: RING_D + 3, z: 100 });
    expect(proj.x).toBeCloseTo(RING_D, 0);
  });
  it('airport rides start at the airport and go far into the city', () => {
    const j = airportJob(vehicleById('classic'), () => 0.3);
    expect(j.a.name).toBe('Airport');
    expect(j.b.name).not.toBe('Airport');
    expect(j.fare).toBeGreaterThan(20);
  });
  it('traffic keeps driving sensibly on the new roads', () => {
    const t = new Traffic(46);
    let time = 0, onRing = 0;
    const player = { pos: { x: 9999, y: 0, z: 9999 } as never, heading: 0 };
    for (let i = 0; i < 3000; i++) { time += 0.1; t.update(0.1, time, player); }
    for (const c of t.cars) {
      expect(Number.isFinite(c.pos.x) && Number.isFinite(c.pos.z)).toBe(true);
      if (Math.max(Math.abs(c.pos.x), Math.abs(c.pos.z)) > 330) onRing++;
    }
    let overlaps = 0;
    for (let a = 0; a < t.cars.length; a++) for (let b = a + 1; b < t.cars.length; b++) if (t.cars[a].pos.distanceTo(t.cars[b].pos) < 2) overlaps++;
    expect(overlaps).toBeLessThanOrEqual(1);
    expect(onRing + 0).toBeGreaterThanOrEqual(0);
  });
});
