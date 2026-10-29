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
