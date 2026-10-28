import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArcadeMode } from '../src/gameplay/ArcadeMode';

const LANE = 3.7;
const mats = new Proxy({}, { get: () => new THREE.MeshStandardMaterial() }) as never;
const rig = { root: new THREE.Group(), body: new THREE.Group(), wheels: [], wheelRadius: 0.35, length: 4.6 } as never;
const def = { stats: { top: 60, grip: 1 }, arcade: 1 } as never;

describe('arcade traffic', () => {
  it('always leaves at least one lane open', () => {
    for (let run = 0; run < 4; run++) {
      const a = new ArcadeMode(mats, rig);
      a.start(rig, def);
      a.countdown = 0; a.running = true;
      const obs = (a as unknown as { obstacles: { active: boolean; fly: number; x: number; z: number; len: number }[] }).obstacles;
      for (let f = 0; f < 60 * 150; f++) {
        a.invuln = 99; a.hearts = 3; // ghost player: we only check the traffic pattern
        a.update(1 / 60, 0, 0);
        const live = obs.filter((o) => o.active && o.fly === 0);
        for (const o of live) {
          // cross-section at this car's nose and tail, padded by a car length the player needs to slip through
          for (const z of [o.z - o.len / 2, o.z + o.len / 2]) {
            const lanes = new Set<number>();
            for (const p of live) if (Math.abs(p.z - z) < p.len / 2 + 2.5)
              for (const l of [-1, 0, 1]) if (Math.abs(p.x - l * LANE) < 2.6) lanes.add(l);
            expect(lanes.size, `run ${run} t=${a.time.toFixed(1)}s`).toBeLessThan(3);
          }
        }
      }
    }
  });
});

describe('arcade power-ups', () => {
  const run = () => {
    const a = new ArcadeMode(mats, rig);
    a.start(rig, def);
    a.countdown = 0; a.running = true;
    return a;
  };
  const items = (a: ArcadeMode) => (a as unknown as { items: { active: boolean; kind: string; pop: number }[] }).items;

  it('puts a power-up on the road every few seconds', () => {
    const a = run();
    const seen = new Set<unknown>();
    let powers = 0;
    for (let f = 0; f < 60 * 60; f++) {
      a.invuln = 99; a.hearts = 3;
      a.update(1 / 60, 0, 0);
      for (const it of items(a)) if (it.active && it.kind !== 'coin' && !seen.has(it)) { seen.add(it); powers++; }
      for (const it of items(a)) if (!it.active) seen.delete(it);
    }
    expect(powers).toBeGreaterThanOrEqual(5); // 60 s of play
  });

  it('Sky Boost flies over traffic without losing hearts, then lands', () => {
    const a = run();
    for (let f = 0; f < 60 * 8; f++) { a.invuln = 99; a.update(1 / 60, 0, 0); } // let traffic fill the road
    a.invuln = 0; a.hearts = 3;
    (a as unknown as { activate(k: string): void }).activate('jet');
    let maxY = 0;
    for (let f = 0; f < 60 * 6; f++) { a.update(1 / 60, 0, 0); maxY = Math.max(maxY, a.y); expect(a.hearts).toBe(3); }
    expect(maxY).toBeGreaterThan(4);
    for (let f = 0; f < 60 * 4; f++) { a.invuln = 99; a.update(1 / 60, 0, 0); }
    expect(a.y).toBeLessThan(0.3);
  });

  it('a shield absorbs one crash', () => {
    const a = run();
    a.shield = 20;
    for (let f = 0; f < 60 * 40 && a.shield > 0; f++) a.update(1 / 60, 0, 0); // sit in the middle lane until something hits
    expect(a.shield).toBe(0);
    expect(a.hearts).toBe(3);
  });
});

describe('arcade near misses', () => {
  const obsOf = (a: ArcadeMode) => (a as unknown as { obstacles: { active: boolean; lane: number; x: number; z: number; speed: number; fly: number; mesh: { visible: boolean } }[] }).obstacles;
  const setup = () => {
    const a = new ArcadeMode(mats, rig);
    a.start(rig, def);
    a.countdown = 0; a.running = true;
    (a as unknown as { nextRow: number }).nextRow = 1e9; // no random traffic: we place the car ourselves
    (a as unknown as { nextPower: number }).nextPower = 1e9;
    const o = obsOf(a)[0];
    Object.assign(o, { active: true, passed: false, hit: false, fly: 0, minLat: 9, laneChange: 0, pending: 0, canChange: false, speed: 12, threatLane: null });
    return { a, o };
  };
  it('does not count a car that was always in the next lane', () => {
    const { a, o } = setup();
    Object.assign(o, { lane: 1, x: 3.7, z: a.z + 30 });
    for (let f = 0; f < 60 * 4; f++) a.update(1 / 60, 0, 0);
    expect(a.nearMisses).toBe(0);
  });
  it('counts a car you dodged out of your lane', () => {
    const { a, o } = setup();
    Object.assign(o, { lane: 0, x: 0, z: a.z + 30 });
    let dodged = false;
    for (let f = 0; f < 60 * 4; f++) {
      const close = !dodged && o.z - a.z < 9;
      if (close) dodged = true;
      a.update(1 / 60, close ? 1 : 0, 0);
    }
    expect(a.hearts).toBe(3);
    expect(a.nearMisses).toBe(1);
  });
});
