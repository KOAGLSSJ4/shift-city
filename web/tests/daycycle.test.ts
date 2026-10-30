import { describe, expect, it } from 'vitest';
import { CYCLE, WEATHER_SLOT, timeAt, weatherAt } from '../src/gameplay/DayCycle';

describe('dynamic time + weather', () => {
  it('goes day → golden hour → night → dawn → day', () => {
    expect(timeAt(0)).toBe('day');
    expect(timeAt(400)).toBe('sunset');
    expect(timeAt(600)).toBe('night');
    expect(timeAt(850)).toBe('sunset');
    expect(timeAt(CYCLE + 10)).toBe('day');
  });
  it('rains in roughly a third of slots, then the roads stay wet before drying', () => {
    let rainy = 0;
    for (let s = 0; s < 300; s++) if (weatherAt(s * WEATHER_SLOT + 10) === 'rain') {
      rainy++;
      expect(weatherAt(s * WEATHER_SLOT + 300)).toBe('wet');
      expect(weatherAt(s * WEATHER_SLOT + 500)).toBe('dry');
    }
    expect(rainy / 300).toBeGreaterThan(0.2);
    expect(rainy / 300).toBeLessThan(0.5);
  });
});
