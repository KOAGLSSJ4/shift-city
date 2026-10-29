// Story v1.1 "The Week": progress, stats and endings. Pure rules (no DOM / Three.js), unit-tested.
import { ENDINGS, WEEK, WEEK_GOAL, type Effect, type Ending, type WeekJob } from '../data/week';

export interface WeekRecord {
  /** 0-4 = Monday-Friday; 5 = the week is over. */
  day: number;
  /** Index of the next job today; equal to the job count when it's evening. */
  job: number;
  /** 0-100. Low energy makes the car slower to respond; at 0 the day ends early. */
  energy: number;
  /** Money earned this week (trips + evening choices). */
  earned: number;
  /** Star ratings this week (averaged for the ending). */
  stars: number[];
  /** Characters you helped (and other story flags). */
  flags: string[];
  /** Rating bonus from choices (e.g. polishing the car). */
  ratingBonus: number;
  /** Set when the week is finished. */
  ending: string;
  /** True while a week is being played. */
  active: boolean;
}

export const newWeekRecord = (): WeekRecord => ({ day: 0, job: 0, energy: 100, earned: 0, stars: [], flags: [], ratingBonus: 0, ending: '', active: false });

export const ENERGY_PER_JOB = 12;
export const ENERGY_OVERNIGHT = 20;
/** Below this the car feels sluggish (fatigue). */
export const TIRED_AT = 35;

export function startWeek(w: WeekRecord) { Object.assign(w, newWeekRecord(), { active: true }); }

export const currentDay = (w: WeekRecord) => WEEK[w.day];
export function currentJob(w: WeekRecord): WeekJob | null {
  const d = currentDay(w);
  return d && w.job < d.jobs.length ? d.jobs[w.job] : null;
}
export const isEvening = (w: WeekRecord) => w.active && !!currentDay(w) && w.job >= currentDay(w).jobs.length;

/** A story job was delivered. Bumps cost extra energy; a good ride (4.5+) sets the job's flag. */
export function finishJob(w: WeekRecord, earned: number, stars: number, bumps: number) {
  const job = currentJob(w);
  if (!job) return;
  w.earned = Math.round((w.earned + earned) * 100) / 100;
  w.stars.push(stars);
  w.energy = Math.max(0, w.energy - ENERGY_PER_JOB - 3 * bumps);
  if (job.flag && stars >= 4.5 && !w.flags.includes(job.flag)) w.flags.push(job.flag);
  w.job++;
  // exhausted: skip the rest of today's jobs and go straight to the evening
  if (w.energy <= 0) { w.job = currentDay(w).jobs.length; if (!w.flags.includes('exhausted')) w.flags.push('exhausted'); }
}

/** Applies an evening choice and moves to the next morning (or finishes the week). Returns money to pay out. */
export function chooseEvening(w: WeekRecord, effect: Effect): number {
  const money = effect.money ?? 0;
  w.earned = Math.round((w.earned + money) * 100) / 100;
  w.energy = Math.max(0, Math.min(100, w.energy + (effect.energy ?? 0)));
  w.ratingBonus += effect.rating ?? 0;
  if (effect.flag && !w.flags.includes(effect.flag)) w.flags.push(effect.flag);
  w.day++;
  w.job = 0;
  if (w.day >= WEEK.length) { w.ending = endingFor(w).id; w.active = false; }
  else w.energy = Math.min(100, w.energy + ENERGY_OVERNIGHT);
  return money;
}

export const weekRating = (w: WeekRecord) =>
  Math.min(5, (w.stars.length ? w.stars.reduce((a, b) => a + b, 0) / w.stars.length : 4.5) + w.ratingBonus);

/** Characters befriended (Maya, Leo, Mrs. Okafor, Mr. Okafor, Rosa). */
export const friends = (w: WeekRecord) => ['maya', 'leo', 'okafor', 'mrokafor', 'rosa'].filter((f) => w.flags.includes(f)).length;

/** Three good endings, one bad one. */
export function endingFor(w: WeekRecord): Ending {
  const rating = weekRating(w);
  if (w.flags.includes('ava') && rating >= 4.6 && w.earned >= WEEK_GOAL) return ENDINGS.driver;
  if (friends(w) >= 3) return ENDINGS.favourite;
  if (w.earned >= WEEK_GOAL) return ENDINGS.steady;
  return ENDINGS.burnout;
}

/** 0 = fresh, 1 = exhausted: how sluggish the car feels (only below TIRED_AT energy). */
export const fatigue = (w: WeekRecord) => (w.active && w.energy < TIRED_AT ? (TIRED_AT - w.energy) / TIRED_AT : 0);
