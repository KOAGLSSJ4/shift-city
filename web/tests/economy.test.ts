import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, migrateLegacy, normalize } from '../src/core/Save';
import { addXP, buyUpgrade, buyVehicle, claimGoal, convertArcadePoints, payJob, recordArcadeRun } from '../src/gameplay/Economy';
import { vehicleById } from '../src/data/vehicles';

describe('economy', () => {
  it('converts 100 arcade points to $5 and keeps the remainder', () => {
    const s = defaultSave(); s.arcade.points = 250;
    expect(convertArcadePoints(s)).toBe(10);
    expect(s.wallet).toBe(10);
    expect(s.arcade.points).toBe(50);
    expect(convertArcadePoints(s)).toBe(0);
  });
  it('pays a job exactly once', () => {
    const s = defaultSave();
    const a = payJob(s, 'job1', 20, vehicleById('metro'), { food: true, stars: 5, story: false });
    const b = payJob(s, 'job1', 20, vehicleById('metro'), { food: true, stars: 5, story: false });
    expect(a).not.toBeNull(); expect(b).toBeNull();
    expect(s.stats.trips).toBe(1); expect(s.stats.food).toBe(1);
    expect(s.wallet).toBeCloseTo(a!.total);
  });
  it('awards an arcade run exactly once', () => {
    const s = defaultSave();
    expect(recordArcadeRun(s, 'r1', 900, 3)).toBe(900);
    expect(recordArcadeRun(s, 'r1', 900, 3)).toBe(0);
    expect(s.arcade.points).toBe(900); expect(s.arcade.best).toBe(900);
  });
  it('keeps a sorted local top 10', () => {
    const s = defaultSave();
    for (let i = 0; i < 14; i++) recordArcadeRun(s, `r${i}`, (i * 37) % 23 * 100 + 50, 0);
    expect(s.arcade.top.length).toBe(10);
    for (let i = 1; i < 10; i++) expect(s.arcade.top[i - 1].score).toBeGreaterThanOrEqual(s.arcade.top[i].score);
    expect(normalize({ arcade: { top: 'junk' } }).arcade.top).toEqual([]);
  });
  it('blocks locked or unaffordable cars and deducts on purchase', () => {
    const s = defaultSave(); s.wallet = 1000;
    expect(buyVehicle(s, 'comfort').ok).toBe(false); // level 2 required
    addXP(s, 100); expect(s.level).toBe(2);
    expect(buyVehicle(s, 'comfort').ok).toBe(true);
    expect(s.wallet).toBe(550); expect(s.selected).toBe('comfort');
    expect(buyVehicle(s, 'comfort').ok).toBe(false);
  });
  it('upgrades cost money and cap at 5', () => {
    const s = defaultSave(); s.wallet = 1e6;
    for (let i = 0; i < 5; i++) expect(buyUpgrade(s, 'metro', 'engine').ok).toBe(true);
    expect(buyUpgrade(s, 'metro', 'engine').ok).toBe(false);
    expect(s.wallet).toBeLessThan(1e6);
  });
  it('goals claim once', () => {
    const s = defaultSave(); s.stats.trips = 1;
    expect(claimGoal(s, 'first').ok).toBe(true);
    expect(claimGoal(s, 'first').ok).toBe(false);
    expect(claimGoal(s, 'five').ok).toBe(false);
  });
});

describe('save', () => {
  it('migrates a v4 save', () => {
    const s = migrateLegacy({ wallet: 500, xp: 20, level: 5, owned: [0, 2], selected: 2, upgrades: 3, arcadeBest: 1200, arcadeTokens: 340, storyChapter: 2, totalTrips: 9, tutorialSeen: true },
      { foodDone: 4, claimed: ['first'] });
    expect(s.owned).toEqual(['metro', 'exec_suv']);
    expect(s.selected).toBe('exec_suv');
    expect(s.upgrades.exec_suv.handling).toBe(3);
    expect(s.arcade.points).toBe(340); expect(s.stats.food).toBe(4);
    expect(s.claimedGoals).toEqual(['first']); expect(s.tutorialDone).toBe(true);
  });
  it('loads legacy keys from storage and survives garbage', () => {
    const mem: Record<string, string> = { 'shift-city-v4': JSON.stringify({ wallet: 42 }) };
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    expect(loadSave(store).wallet).toBe(42);
    mem['shift-city-save'] = '{bad json';
    expect(loadSave(store).wallet).toBe(0);
    expect(normalize({ owned: ['nope'], selected: 'nope', wallet: -5 }).selected).toBe('metro');
  });
});
