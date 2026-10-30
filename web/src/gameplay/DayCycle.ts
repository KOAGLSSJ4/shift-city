// "Dynamic" time of day and weather: the city moves through day, golden hour, night and dawn, and showers
// roll in now and then. Pure functions of play time (seconds), so it's predictable and unit-tested.
import type { TimeOfDay, Weather } from '../core/Save';

/** One full cycle: day, golden hour, night, dawn (seconds each). */
export const DAY_PHASES: [TimeOfDay, number][] = [['day', 360], ['sunset', 150], ['night', 300], ['sunset', 90]];
export const CYCLE = DAY_PHASES.reduce((a, [, s]) => a + s, 0);

export function timeAt(t: number): TimeOfDay {
  let x = ((t % CYCLE) + CYCLE) % CYCLE;
  for (const [phase, secs] of DAY_PHASES) { if (x < secs) return phase; x -= secs; }
  return 'day';
}

/** Weather comes in 10-minute slots: about a third bring a 4-minute shower, then 3 minutes of wet roads. */
export const WEATHER_SLOT = 600;
const RAIN_SECS = 240, WET_SECS = 180;
export function weatherAt(t: number, seed = 7): Weather {
  const slot = Math.floor(t / WEATHER_SLOT), inSlot = t - slot * WEATHER_SLOT;
  let h = (slot * 2654435761 + seed * 40503) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  if ((h % 1000) / 1000 >= 0.35) return 'dry';
  return inSlot < RAIN_SECS ? 'rain' : inSlot < RAIN_SECS + WET_SECS ? 'wet' : 'dry';
}

/** Rides pay a bit more in the rain (like real ride-hailing). */
export const RAIN_FARE_BONUS = 1.2;

export const CHANGE_TOAST: Record<string, string> = {
  'time:day': 'Morning: a new day in Shift City',
  'time:sunset': 'Golden hour',
  'time:night': 'Night falls: lights on',
  'weather:rain': 'Rain rolling in: rides pay 20% more while it lasts',
  'weather:wet': 'The rain has stopped. Roads are still wet',
  'weather:dry': 'Roads have dried out',
};
