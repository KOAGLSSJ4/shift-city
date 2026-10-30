import { describe, expect, it } from 'vitest';
import { WEEK, WEEK_GOAL } from '../src/data/week';
import { DESTINATIONS } from '../src/data/world';
import { chooseEvening, currentJob, endingFor, fatigue, finishJob, isEvening, newWeekRecord, startWeek } from '../src/gameplay/Week';

const playDay = (w: ReturnType<typeof newWeekRecord>, stars: number, pay: number, choice = 0) => {
  while (currentJob(w)) finishJob(w, pay, stars, 0);
  expect(isEvening(w)).toBe(true);
  chooseEvening(w, WEEK[w.day].evening.choices[choice].effect);
};

describe('The Week', () => {
  it('only uses real destinations', () => {
    const names = new Set(DESTINATIONS.map((d) => d.name));
    for (const d of WEEK) for (const j of d.jobs) { expect(names.has(j.a)).toBe(true); expect(names.has(j.b)).toBe(true); }
  });
  it('a great week with Ava impressed is Driver of the Week', () => {
    const w = newWeekRecord(); startWeek(w);
    for (let d = 0; d < 5; d++) playDay(w, 4.9, 60);
    expect(w.active).toBe(false);
    expect(w.earned).toBeGreaterThanOrEqual(WEEK_GOAL);
    expect(w.ending).toBe('driver');
  });
  it('helping people makes you the city favourite even with poor ratings', () => {
    const w = newWeekRecord(); startWeek(w);
    for (let d = 0; d < 5; d++) playDay(w, 4.6, 10, 0);
    w.flags = ['maya', 'leo', 'okafor'];
    expect(endingFor(w).id).toBe('favourite');
  });
  it('low earnings and few friends is the one bad ending', () => {
    const w = newWeekRecord(); startWeek(w);
    for (let d = 0; d < 5; d++) playDay(w, 3, 5, 0);
    expect(w.ending).toBe('burnout');
  });
  it('energy drains with work, ends the day at zero and makes the car sluggish', () => {
    const w = newWeekRecord(); startWeek(w);
    w.energy = 10;
    expect(fatigue(w)).toBeGreaterThan(0);
    finishJob(w, 30, 4, 2);
    expect(w.energy).toBe(0);
    expect(isEvening(w)).toBe(true);
    expect(w.flags).toContain('exhausted');
  });
});
