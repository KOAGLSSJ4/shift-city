import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/Save';
import { claimChallenge, claimDailyReward, dailyAmount, dailyChallenge } from '../src/gameplay/Daily';

const day = (d: number) => new Date(2026, 9, d, 12);

describe('daily reward', () => {
  it('pays once per day and grows with a streak', () => {
    const s = defaultSave();
    expect(claimDailyReward(s, day(1))).toEqual({ amount: 50, streak: 1 });
    expect(claimDailyReward(s, day(1))).toBeNull();
    expect(claimDailyReward(s, day(2))).toEqual({ amount: 75, streak: 2 });
    expect(s.wallet).toBe(125);
  });
  it('resets the streak after a missed day and caps at $200', () => {
    const s = defaultSave();
    claimDailyReward(s, day(1)); claimDailyReward(s, day(2));
    expect(claimDailyReward(s, day(4))?.streak).toBe(1);
    expect(dailyAmount(30)).toBe(200);
  });
});

describe('daily challenge', () => {
  it('counts progress from the start of the day and pays once', () => {
    const s = defaultSave();
    s.stats.trips = 10; s.stats.earned = 500; s.stats.km = 40; s.stats.nearMisses = 99; s.stats.food = 7;
    const ch = dailyChallenge(s, day(5));
    expect(ch.progress).toBe(0);
    expect(claimChallenge(s, day(5))).toBe(false);
    s.stats.trips += 3; s.stats.earned += 150; s.stats.km += 5; s.stats.nearMisses += 15; s.stats.food += 2;
    const wallet = s.wallet;
    expect(dailyChallenge(s, day(5)).ready).toBe(true);
    expect(claimChallenge(s, day(5))).toBe(true);
    expect(s.wallet).toBe(wallet + 100);
    expect(claimChallenge(s, day(5))).toBe(false);
  });
});

import { buyPowerUpgrade, MAX_POWER_LEVEL, powerUpgradeCost } from '../src/gameplay/Economy';
describe('power-up upgrades', () => {
  it('costs banked arcade points and stops at the max level', () => {
    const s = defaultSave();
    s.arcade.points = 1000;
    expect(buyPowerUpgrade(s, 'magnet').ok).toBe(false);
    s.arcade.points = 1e6;
    for (let i = 0; i < MAX_POWER_LEVEL; i++) expect(buyPowerUpgrade(s, 'magnet').ok).toBe(true);
    expect(s.arcade.powers.magnet).toBe(MAX_POWER_LEVEL);
    expect(buyPowerUpgrade(s, 'magnet').ok).toBe(false);
    expect(s.arcade.points).toBe(1e6 - [0, 1, 2, 3, 4].reduce((a, l) => a + powerUpgradeCost(l), 0));
  });
});

import { missionResult, musicTaste, newLog } from '../src/gameplay/Missions';
import { nextStation, tracksFor } from '../src/data/radio';
describe('car radio', () => {
  it('cycles stations and every station except off has music', () => {
    expect(nextStation('drive')).toBe('chill');
    expect(nextStation('off')).toBe('drive');
    for (const s of ['drive', 'chill', 'hype'] as const) expect(tracksFor(s).length).toBeGreaterThan(0);
  });
  it('the right music earns a tip, the wrong music costs stars', () => {
    expect(musicTaste('party', 'hype')).toBe(1);
    expect(musicTaste('grumpy', 'hype')).toBe(-1);
    const liked = { ...newLog(), music: 30 }, hated = { ...newLog(), music: -30 }, none = newLog();
    const base = missionResult('standard', 'party', 20, 60, undefined, none);
    expect(missionResult('standard', 'party', 20, 60, undefined, liked).tip).toBeGreaterThan(base.tip);
    expect(missionResult('standard', 'party', 20, 60, undefined, hated).starPenalty).toBeGreaterThan(base.starPenalty);
  });
});

import { earnings, recordDecline, streakBonus } from '../src/gameplay/Driver';
import { payJob } from '../src/gameplay/Economy';
import { vehicleById } from '../src/data/vehicles';
describe('trip streak + earnings', () => {
  it('pays a bonus every 3rd trip in a row and declining resets it', () => {
    expect([1, 2, 3, 6, 30].map(streakBonus)).toEqual([0, 0, 5, 10, 25]);
    const s = defaultSave(), car = vehicleById('classic');
    const opts = { food: false, stars: 4, story: false };
    payJob(s, 'a', 10, car, opts); payJob(s, 'b', 10, car, opts);
    expect(payJob(s, 'c', 10, car, opts)?.streak).toBe(5);
    recordDecline(s.driver, Date.now());
    expect(s.driver.tripStreak).toBe(0);
    const e = earnings(s.driver);
    expect(e.todayTrips).toBe(3);
    expect(e.today).toBeCloseTo(s.wallet, 2);
  });
});

import { applySurgeZone, randomJob, rollSurgeZone } from '../src/gameplay/Jobs';
import { DESTINATIONS } from '../src/data/world';
describe('surge zones', () => {
  it('multiplies rides picked up inside the zone only', () => {
    const z = rollSurgeZone(0, () => 0.5);
    const car = vehicleById('classic');
    const make = () => { const j = randomJob(car); j.food = false; j.surge = undefined; j.variant = 'standard'; return j; };
    const inside = make(); inside.a = DESTINATIONS.find((d) => d.name === z.name)!;
    const fare = inside.fare;
    expect(applySurgeZone(inside, z)).toBe(true);
    expect(inside.fare).toBeCloseTo(fare * z.mult, 1);
    expect(inside.variant).toBe('surge');
    const outside = make(); outside.a = DESTINATIONS.reduce((f, d) => (Math.hypot(d.x - z.x, d.z - z.z) > Math.hypot(f.x - z.x, f.z - z.z) ? d : f));
    expect(applySurgeZone(outside, z)).toBe(false);
  });
});

import { headsTowards } from '../src/gameplay/Jobs';
describe('destination filter', () => {
  it('knows whether a trip heads towards a place', () => {
    const j = randomJob(vehicleById('classic'));
    expect(headsTowards(j, j.b)).toBe(true);
    expect(headsTowards(j, j.a)).toBe(false);
  });
});
