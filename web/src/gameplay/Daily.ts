// Daily login reward (with a streak) and one daily challenge. Pure rules, unit-tested.
import type { SaveData } from '../core/Save';
import { addXP } from './Economy';

export interface DailyRecord {
  /** Day the login reward was last given (YYYY-MM-DD, local time). */
  last: string;
  streak: number;
  /** Day the current challenge belongs to, and the stat value when it started (progress counts from there). */
  day: string;
  base: number;
  /** Day the challenge reward was claimed. */
  claimed: string;
}
export const newDailyRecord = (): DailyRecord => ({ last: '', streak: 0, day: '', base: 0, claimed: '' });

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));

/** $50 on day one, +$25 per day in a row, up to $200. */
export const dailyAmount = (streak: number) => Math.min(200, 50 + 25 * (Math.max(1, streak) - 1));

/** Gives today's login reward once per day. Returns null if already collected today. */
export function claimDailyReward(s: SaveData, now = new Date()): { amount: number; streak: number } | null {
  const today = dayKey(now);
  if (s.daily.last === today) return null;
  s.daily.streak = s.daily.last === yesterday(now) ? s.daily.streak + 1 : 1;
  s.daily.last = today;
  const amount = dailyAmount(s.daily.streak);
  s.wallet += amount;
  return { amount, streak: s.daily.streak };
}

export interface ChallengeDef { id: string; text: string; goal: number; stat: (s: SaveData) => number }
export const CHALLENGES: ChallengeDef[] = [
  { id: 'trips', text: 'Complete 3 trips', goal: 3, stat: (s) => s.stats.trips },
  { id: 'earn', text: 'Earn $150 from trips', goal: 150, stat: (s) => s.stats.earned },
  { id: 'km', text: 'Drive 5 km', goal: 5, stat: (s) => s.stats.km },
  { id: 'near', text: 'Get 15 near misses in Arcade', goal: 15, stat: (s) => s.stats.nearMisses },
  { id: 'food', text: 'Deliver 2 food orders', goal: 2, stat: (s) => s.stats.food },
];
export const CHALLENGE_REWARD = { cash: 100, xp: 15 };

/** Today's challenge (the same for everyone on a given date). */
export function challengeFor(day: string): ChallengeDef {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHALLENGES[h % CHALLENGES.length];
}

/** Starts today's challenge if needed and returns it with progress. */
export function dailyChallenge(s: SaveData, now = new Date()) {
  const today = dayKey(now), c = challengeFor(today);
  if (s.daily.day !== today) { s.daily.day = today; s.daily.base = c.stat(s); }
  const progress = Math.max(0, Math.min(c.goal, c.stat(s) - s.daily.base));
  return { def: c, progress, done: s.daily.claimed === today, ready: s.daily.claimed !== today && progress >= c.goal };
}

export function claimChallenge(s: SaveData, now = new Date()): boolean {
  const ch = dailyChallenge(s, now);
  if (!ch.ready) return false;
  s.daily.claimed = dayKey(now);
  s.wallet += CHALLENGE_REWARD.cash;
  addXP(s, CHALLENGE_REWARD.xp);
  return true;
}
