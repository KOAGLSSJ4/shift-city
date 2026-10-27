import { describe, it, expect } from 'vitest';
import { missionResult, newLog, logBump, logHarsh, personaHappy, rollVariant, timeLimit, line, PERSONAS } from '../src/gameplay/Missions';

describe('missions', () => {
  it('pays the express bonus only on time', () => {
    expect(missionResult('express', undefined, 100, 50, 60, newLog()).tip).toBe(40);
    expect(missionResult('express', undefined, 100, 70, 60, newLog()).tip).toBe(0);
  });
  it('VIP and fragile tips scale with comfort and cost stars', () => {
    const smooth = missionResult('vip', undefined, 100, 30, undefined, newLog());
    const log = newLog(); logBump(log); logHarsh(log);
    const rough = missionResult('vip', undefined, 100, 30, undefined, log);
    expect(smooth.tip).toBe(60);
    expect(rough.tip).toBeLessThan(smooth.tip);
    expect(rough.starPenalty).toBeGreaterThan(0);
    const f = newLog(); logBump(f); logBump(f); logBump(f);
    expect(missionResult('fragile', undefined, 100, 30, undefined, f).note).toContain('spilled');
  });
  it('long haul gives bonus XP', () => {
    expect(missionResult('long', undefined, 100, 30, undefined, newLog()).xp).toBe(25);
  });
  it('personalities react to how you drive', () => {
    const calm = newLog(), rough = newLog(); logBump(rough); logBump(rough);
    expect(personaHappy('quiet', 30, undefined, calm)).toBeGreaterThan(personaHappy('quiet', 30, undefined, rough));
    expect(personaHappy('grumpy', 30, undefined, rough)).toBe(0);
    expect(personaHappy('hurry', 20, 100, calm)).toBeGreaterThan(personaHappy('hurry', 95, 100, calm));
    const fun = newLog(); fun.fun = 4;
    expect(personaHappy('party', 30, undefined, fun)).toBe(1);
  });
  it('rolls sensible variants and limits', () => {
    expect(rollVariant(true, false, () => 0.1)).toBe('hot');
    expect(rollVariant(false, true, () => 0.1)).toBe('vip');
    expect(rollVariant(false, false, () => 0.1)).toBe('express');
    expect(timeLimit(1100)).toBe(125);
  });
  it('every persona can greet and say goodbye', () => {
    for (const p of Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]) {
      expect(line(p, 'pickup')).toBeTruthy();
      expect(line(p, 'good')).toBeTruthy();
      expect(line(p, 'bad')).toBeTruthy();
    }
  });
});
