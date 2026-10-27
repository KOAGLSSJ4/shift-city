// Pure progression/economy rules. No DOM or Three.js here so it can be unit-tested.
import type { SaveData } from '../core/Save';
import { BALANCE } from '../data/balancing';
import { GOALS, type GoalDef } from '../data/goals';
import { MAX_UPGRADE, vehicleById, type UpgradeTrack, type Upgrades, type VehicleDef } from '../data/vehicles';

export const xpToNext = (level: number) => level * 100;

/** Adds XP and returns how many levels were gained. */
export function addXP(s: SaveData, n: number): number {
  let ups = 0;
  s.xp += n;
  while (s.xp >= xpToNext(s.level)) { s.xp -= xpToNext(s.level); s.level++; ups++; }
  return ups;
}

export const upgradesOf = (s: SaveData, id: string): Upgrades => s.upgrades[id] ?? { engine: 0, brakes: 0, handling: 0 };

export function upgradeCost(def: VehicleDef, level: number): number {
  return Math.round((150 + def.cost * 0.05) * (level + 1) / 10) * 10;
}

export type Result = { ok: true; msg: string } | { ok: false; msg: string };

export function buyVehicle(s: SaveData, id: string): Result {
  const v = vehicleById(id);
  if (s.owned.includes(id)) return { ok: false, msg: 'Already owned' };
  if (s.level < v.level) return { ok: false, msg: `Reach level ${v.level} to unlock` };
  if (s.wallet < v.cost) return { ok: false, msg: `Need $${(v.cost - s.wallet).toFixed(0)} more` };
  s.wallet -= v.cost;
  s.owned.push(id);
  s.selected = id;
  return { ok: true, msg: `${v.name} purchased!` };
}

export function selectVehicle(s: SaveData, id: string): Result {
  if (!s.owned.includes(id)) return { ok: false, msg: 'Not owned' };
  s.selected = id;
  return { ok: true, msg: `${vehicleById(id).name} equipped` };
}

export function buyUpgrade(s: SaveData, id: string, track: UpgradeTrack): Result {
  if (!s.owned.includes(id)) return { ok: false, msg: 'Not owned' };
  const up = { ...upgradesOf(s, id) };
  if (up[track] >= MAX_UPGRADE) return { ok: false, msg: 'Maxed out' };
  const cost = upgradeCost(vehicleById(id), up[track]);
  if (s.wallet < cost) return { ok: false, msg: `Need $${cost - Math.floor(s.wallet)} more` };
  s.wallet -= cost;
  up[track]++;
  s.upgrades[id] = up;
  return { ok: true, msg: `${track} upgraded to level ${up[track]}` };
}

/** 100 arcade points → $5. Only whole units convert; the remainder stays. */
export function convertArcadePoints(s: SaveData): number {
  const units = Math.floor(s.arcade.points / BALANCE.arcadePointsPerUnit);
  if (units <= 0) return 0;
  const cash = units * BALANCE.cashPerUnit;
  s.arcade.points -= units * BALANCE.arcadePointsPerUnit;
  s.wallet += cash;
  return cash;
}

/** Records an arcade run exactly once (guarded by run id). Returns points awarded. */
export function recordArcadeRun(s: SaveData, runId: string, score: number, nearMisses: number): number {
  if (s.arcade.lastRunId === runId) return 0;
  s.arcade.lastRunId = runId;
  s.arcade.runs++;
  s.arcade.best = Math.max(s.arcade.best, score);
  s.arcade.points += Math.floor(score);
  s.stats.nearMisses += nearMisses;
  return Math.floor(score);
}

export interface JobPayment { fare: number; tip: number; total: number; xp: number; note?: string }

export function jobFare(distance: number, vehicle: VehicleDef, premium: boolean): number {
  const base = BALANCE.baseFare + distance * BALANCE.farePerMetre;
  return Math.round(base * (premium ? 1.6 : 1) * 100) / 100;
}

/** Pays for a completed job exactly once. Returns null if this job id was already paid. */
export function payJob(s: SaveData, jobId: string, fare: number, vehicle: VehicleDef, opts: { food: boolean; stars: number; story: boolean; bonusTip?: number; bonusXp?: number }): JobPayment | null {
  if (s.paidJobs.includes(jobId)) return null;
  s.paidJobs.push(jobId);
  if (s.paidJobs.length > 50) s.paidJobs.splice(0, s.paidJobs.length - 50);
  const payout = Math.round(fare * vehicle.fare * 100) / 100;
  const tip = Math.round(((opts.stars >= 4.5 ? payout * 0.04 * vehicle.comfort : 0) + (opts.bonusTip ?? 0)) * 100) / 100;
  const total = payout + tip;
  s.wallet += total;
  s.stats.earned += total;
  s.stats.trips++;
  if (opts.food) s.stats.food++;
  s.stats.rating = (s.stats.rating * s.stats.ratings + opts.stars) / (s.stats.ratings + 1);
  s.stats.ratings = Math.min(s.stats.ratings + 1, 200);
  let xp = BALANCE.xpPerJob + (opts.bonusXp ?? 0);
  if (opts.story && s.story.chapter < 5) { s.story.chapter++; xp += BALANCE.xpPerStoryChapter; }
  addXP(s, xp);
  return { fare: payout, tip, total, xp };
}

export function goalProgress(s: SaveData, g: GoalDef): number {
  switch (g.kind) {
    case 'trips': return s.stats.trips;
    case 'food': return s.stats.food;
    case 'distance': return s.stats.km;
    case 'arcade': return s.arcade.best;
    case 'story': return s.story.chapter;
    case 'cars': return s.owned.length;
    case 'nearmiss': return s.stats.nearMisses;
  }
}

export function claimGoal(s: SaveData, id: string): Result {
  const g = GOALS.find((x) => x.id === id);
  if (!g) return { ok: false, msg: 'Unknown goal' };
  if (s.claimedGoals.includes(id)) return { ok: false, msg: 'Already claimed' };
  if (goalProgress(s, g) < g.goal) return { ok: false, msg: 'Not complete yet' };
  s.claimedGoals.push(id);
  s.wallet += g.reward;
  addXP(s, g.xp);
  return { ok: true, msg: `Goal claimed: +$${g.reward} · +${g.xp} XP` };
}

export const claimableGoals = (s: SaveData) => GOALS.filter((g) => !s.claimedGoals.includes(g.id) && goalProgress(s, g) >= g.goal).length;
