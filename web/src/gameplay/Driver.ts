// Driver-app rules modelled on real ride-hailing apps: offers expire, declines lower your acceptance
// rate, too many declines in a row take you offline for a while, and a good record earns a tier with
// fare bonuses. Pure rules (no DOM / Three.js) so they're unit-tested.
import type { SaveData } from '../core/Save';

/** Seconds a Free Ride offer stays on screen before it's missed. */
export const OFFER_SECONDS = 15;
/** Declines (or missed offers) in a row that take you offline. */
export const DECLINE_LIMIT = 3;
/** Real-time seconds you stay offline after hitting the limit. */
export const OFFLINE_SECONDS = 60;
/** Acceptance rate is measured over this many recent offers. */
const WINDOW = 30;

export type TierId = 'blue' | 'gold' | 'platinum' | 'diamond';
export interface Tier { id: TierId; label: string; trips: number; acceptance: number; rating: number; fareBonus: number; premiumBoost: number; colour: string }

/** Highest tier first. Each needs lifetime trips plus a current acceptance rate and star rating. */
export const TIERS: Tier[] = [
  { id: 'diamond', label: 'Diamond', trips: 150, acceptance: 0.9, rating: 4.85, fareBonus: 0.15, premiumBoost: 0.2, colour: '#7fe3ff' },
  { id: 'platinum', label: 'Platinum', trips: 75, acceptance: 0.85, rating: 4.8, fareBonus: 0.1, premiumBoost: 0.12, colour: '#d9e2ea' },
  { id: 'gold', label: 'Gold', trips: 25, acceptance: 0.8, rating: 4.7, fareBonus: 0.05, premiumBoost: 0.05, colour: '#ffcf49' },
  { id: 'blue', label: 'Blue', trips: 0, acceptance: 0, rating: 0, fareBonus: 0, premiumBoost: 0, colour: '#4cc3ff' },
];

export interface DriverRecord {
  /** Recent offers, newest last: true = accepted. */
  recent: boolean[];
  declineStreak: number;
  /** Date.now() until which you're offline (0 = online). Real time, so reloading doesn't skip it. */
  offlineUntil: number;
  /** Trips finished in a row without declining (streak bonus every 3). */
  tripStreak: number;
  /** Earnings log for the earnings screen: [Date.now(), amount], newest last. */
  log: [number, number][];
  /** Rider compliments received, by kind. */
  badges: Record<string, number>;
  /** Destination filter: name of the place you want trips towards ('' = off). */
  filter: string;
}

export const newDriverRecord = (): DriverRecord => ({ recent: [], declineStreak: 0, offlineUntil: 0, tripStreak: 0, log: [], badges: {}, filter: '' });

/** Streak bonus paid on every 3rd trip in a row: $5, $10, $15... up to $25. */
export const streakBonus = (streak: number) => (streak > 0 && streak % 3 === 0 ? Math.min(25, 5 * (streak / 3)) : 0);

/** Today's and the last 7 days' earnings, from the log. */
export function earnings(d: DriverRecord, now = Date.now()) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const today = d.log.filter(([t]) => t >= midnight.getTime());
  const week = d.log.filter(([t]) => t >= now - 7 * 86400_000);
  const sum = (l: [number, number][]) => Math.round(l.reduce((a, [, v]) => a + v, 0) * 100) / 100;
  return { today: sum(today), todayTrips: today.length, week: sum(week), weekTrips: week.length, best: d.log.reduce((m, [, v]) => Math.max(m, v), 0) };
}

/** Until a driver has this many offers on record, the missing ones count as accepted (a fair start). */
const CUSHION = 10;

/** Acceptance rate over the recent window; new drivers start at 100% and a few declines don't sink it. */
export function acceptanceRate(d: DriverRecord): number {
  const n = d.recent.length, yes = d.recent.filter(Boolean).length;
  return (yes + Math.max(0, CUSHION - n)) / Math.max(n, CUSHION);
}

function push(d: DriverRecord, accepted: boolean) {
  d.recent.push(accepted);
  if (d.recent.length > WINDOW) d.recent.splice(0, d.recent.length - WINDOW);
}

export function recordAccept(d: DriverRecord) {
  push(d, true);
  d.declineStreak = 0;
}

/** A decline or a missed (expired) offer. Returns true if this took the driver offline. */
export function recordDecline(d: DriverRecord, now: number): boolean {
  push(d, false);
  d.declineStreak++;
  d.tripStreak = 0;
  if (d.declineStreak >= DECLINE_LIMIT) {
    d.declineStreak = 0;
    d.offlineUntil = now + OFFLINE_SECONDS * 1000;
    return true;
  }
  return false;
}

/** Seconds left offline (0 when online). */
export const offlineLeft = (d: DriverRecord, now: number) => Math.max(0, Math.ceil((d.offlineUntil - now) / 1000));

/** Current tier from lifetime trips, recent acceptance and star rating. */
export function driverTier(s: SaveData): Tier {
  const acc = acceptanceRate(s.driver);
  return TIERS.find((t) => s.stats.trips >= t.trips && acc >= t.acceptance && s.stats.rating >= t.rating) ?? TIERS[TIERS.length - 1];
}

/** The next tier up and what's still missing for it (for the HUD / menu). */
export function nextTier(s: SaveData): { tier: Tier; needs: string[] } | null {
  const cur = driverTier(s);
  const i = TIERS.indexOf(cur);
  if (i <= 0) return null;
  const t = TIERS[i - 1];
  const needs: string[] = [];
  if (s.stats.trips < t.trips) needs.push(`${t.trips - s.stats.trips} more trips`);
  if (acceptanceRate(s.driver) < t.acceptance) needs.push(`${Math.round(t.acceptance * 100)}% acceptance`);
  if (s.stats.rating < t.rating) needs.push(`★ ${t.rating.toFixed(2)} rating`);
  return { tier: t, needs };
}
