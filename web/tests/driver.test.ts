import { describe, it, expect } from 'vitest';
import { defaultSave, normalize } from '../src/core/Save';
import { acceptanceRate, driverTier, nextTier, offlineLeft, recordAccept, recordDecline, DECLINE_LIMIT, OFFLINE_SECONDS, newDriverRecord } from '../src/gameplay/Driver';
import { payJob } from '../src/gameplay/Economy';
import { vehicleById } from '../src/data/vehicles';

describe('driver app rules', () => {
  it('declines lower the acceptance rate', () => {
    const d = defaultSave().driver;
    expect(acceptanceRate(d)).toBe(1);
    recordAccept(d); recordAccept(d); recordAccept(d); recordDecline(d, 0);
    expect(acceptanceRate(d)).toBe(0.9); // early on, missing history counts as accepted
    for (let i = 0; i < 20; i++) recordAccept(d);
    recordDecline(d, 0); recordDecline(d, 0);
    expect(acceptanceRate(d)).toBeCloseTo(23 / 26);
  });
  it(`${DECLINE_LIMIT} declines in a row take you offline; an accept resets the streak`, () => {
    const d = defaultSave().driver;
    expect(recordDecline(d, 0)).toBe(false);
    recordAccept(d);
    expect(recordDecline(d, 0)).toBe(false);
    expect(recordDecline(d, 0)).toBe(false);
    expect(recordDecline(d, 1000)).toBe(true);
    expect(offlineLeft(d, 1000)).toBe(OFFLINE_SECONDS);
    expect(offlineLeft(d, 1000 + OFFLINE_SECONDS * 1000)).toBe(0);
  });
  it('tiers need trips, acceptance and rating, and pay a fare bonus', () => {
    const s = defaultSave();
    expect(driverTier(s).id).toBe('blue');
    s.stats.trips = 30; s.stats.rating = 4.9;
    expect(driverTier(s).id).toBe('gold');
    for (let i = 0; i < 10; i++) recordDecline(s.driver, 0);
    expect(driverTier(s).id).toBe('blue'); // acceptance too low now
    expect(nextTier(s)!.needs.join()).toContain('acceptance');
    const gold = defaultSave(); gold.stats.trips = 30; gold.stats.rating = 4.9;
    const blue = defaultSave();
    const g = payJob(gold, 'a', 100, vehicleById('classic'), { food: false, stars: 4, story: false })!;
    const b = payJob(blue, 'a', 100, vehicleById('classic'), { food: false, stars: 4, story: false })!;
    expect(g.fare).toBeCloseTo(b.fare * 1.05);
  });
  it('old saves get a clean driver record', () => {
    expect(normalize({}).driver).toEqual(newDriverRecord());
    expect(normalize({ driver: { recent: 'x', declineStreak: -3 } }).driver.declineStreak).toBe(0);
  });
});
