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
