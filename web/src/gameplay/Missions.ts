// Free Ride mission types and passenger personalities. Pure rules (no DOM / Three.js) so they're unit-tested.
export type Variant = 'standard' | 'express' | 'vip' | 'surge' | 'long' | 'fragile' | 'hot';
export type Persona = 'chatty' | 'quiet' | 'hurry' | 'tourist' | 'grumpy' | 'party';
export type Moment = 'pickup' | 'bump' | 'harsh' | 'fast' | 'fun' | 'good' | 'bad' | 'musicLove' | 'musicHate';
import type { StationId } from '../data/radio';

export const VARIANTS: Record<Variant, { label: string; blurb: string }> = {
  standard: { label: '', blurb: '' },
  express: { label: 'EXPRESS', blurb: 'Beat the clock for a +40% bonus.' },
  vip: { label: 'VIP SMOOTH RIDE', blurb: 'No bumps, no harsh braking or cornering: up to +60%.' },
  surge: { label: 'SURGE', blurb: 'High demand in this area: fare multiplied.' },
  long: { label: 'LONG HAUL', blurb: 'Cross-town trip: higher fare and bonus XP.' },
  fragile: { label: 'FRAGILE', blurb: "Don't spill it! Bumps and hard turns cut the tip." },
  hot: { label: 'HOT FOOD', blurb: 'Deliver while it is still hot for a +30% tip.' },
};

export const PERSONAS: Record<Persona, { label: string; lines: Partial<Record<Moment, string[]>> }> = {
  chatty: { label: 'chatty', lines: {
    musicLove: ['"Oh, I know this one! *hums along*"'], musicHate: ['"Hmm, not really my kind of music…"'],
    pickup: ['"Hi! Lovely day for a drive, isn\'t it?"', '"Oh good, a driver who looks friendly!"'],
    bump: ['"Whoa! Anyway, as I was saying…"'],
    harsh: ['"Easy there, I nearly spilled my coffee!"'],
    good: ['"Best chat I\'ve had all week. Here\'s a little extra!"'],
    bad: ['"Well… it was certainly a ride."'],
  } },
  quiet: { label: 'quiet', lines: {
    musicLove: ['"…This is nice. Calm."'], musicHate: ['"Could you… turn that down?"'],
    pickup: ['"…Hi."', '"Just the drop-off, thanks."'],
    bump: ['"…"', '"Ow."'],
    harsh: ['"Please. Gently."'],
    fast: ['"Could you slow down a bit?"'],
    good: ['"Thank you. That was peaceful."'],
    bad: ['"I\'ll walk next time."'],
  } },
  hurry: { label: 'in a hurry', lines: {
    musicLove: ['"Yes! Music to drive fast to!"'], musicHate: ['"This is putting me to sleep. Faster music, faster driving!"'],
    pickup: ['"Go go go! I\'m so late!"', '"Fastest route, please. I mean it."'],
    fast: ['"Yes! Keep it up!"', '"Now we\'re moving!"'],
    good: ['"Made it! You\'re a lifesaver, keep the change."'],
    bad: ['"I could have run faster than that."'],
  } },
  tourist: { label: 'tourist', lines: {
    musicLove: ['"Is this a local station? I love it!"'], musicHate: ['"Is this what people here listen to?"'],
    pickup: ['"First time in Shift City! Is that the river?"', '"Wow, look at all the towers!"'],
    bump: ['"Ha! Like a theme park!"'],
    good: ['"What a city! Here, you\'ve earned this."'],
    bad: ['"Interesting driving style… is that local?"'],
  } },
  grumpy: { label: 'grumpy', lines: {
    musicLove: ['"Finally, some peace."'], musicHate: ['"Turn. That. Off."'],
    pickup: ['"You\'re late. Drive."', '"Don\'t talk to me."'],
    bump: ['"Unbelievable."', '"Do they give licences out in cereal boxes now?"'],
    harsh: ['"Are you TRYING to make me sick?"'],
    good: ['"Hmph. Acceptable."'],
    bad: ['"One star. Maybe less."'],
  } },
  party: { label: 'party mood', lines: {
    musicLove: ['"THIS IS MY SONG! Turn it UP!"'], musicHate: ['"Boooring! Find something with a beat!"'],
    pickup: ['"Let\'s GOOO! Turn it up!"', '"Night out! Make it fun!"'],
    fun: ['"WHEEE! Again!"', '"Now THAT\'s a turn!"'],
    good: ['"Best ride ever! Big tip for you!"'],
    bad: ['"Bit of a snooze, honestly."'],
  } },
};

export const line = (p: Persona, m: Moment, rnd = Math.random) => {
  const l = PERSONAS[p].lines[m];
  return l ? l[Math.floor(rnd() * l.length)] : null;
};

/** How a ride went, tracked while the passenger/order is on board. */
/** What each personality thinks of each radio station: 1 likes, -1 dislikes. */
export const MUSIC_TASTE: Record<Persona, Partial<Record<StationId, 1 | -1>>> = {
  chatty: { drive: 1 },
  quiet: { chill: 1, off: 1, hype: -1 },
  hurry: { hype: 1, drive: 1, chill: -1 },
  tourist: { drive: 1, chill: 1 },
  grumpy: { off: 1, hype: -1 },
  party: { hype: 1, off: -1, chill: -1 },
};
export const musicTaste = (p: Persona, s: StationId) => MUSIC_TASTE[p][s] ?? 0;

export interface RideLog {
  /** 1 = perfectly smooth; bumps and harsh moves take it down. */
  comfort: number;
  bumps: number;
  harsh: number;
  /** Seconds spent above ~70 km/h. */
  fast: number;
  /** Seconds of spirited cornering at speed. */
  fun: number;
  /** Seconds of liked radio minus seconds of disliked radio. */
  music: number;
}
export const newLog = (): RideLog => ({ comfort: 1, bumps: 0, harsh: 0, fast: 0, fun: 0, music: 0 });

export function logBump(l: RideLog) { l.bumps++; l.comfort = Math.max(0, l.comfort - 0.25); }
export function logHarsh(l: RideLog) { l.harsh++; l.comfort = Math.max(0, l.comfort - 0.12); }

/** Picks a mission type. Food gets fragile/hot; rides get express/surge/long; VIP needs a premium car. */
export function rollVariant(food: boolean, premium: boolean, rnd = Math.random): Variant {
  const r = rnd();
  if (food) return r < 0.25 ? 'hot' : r < 0.45 ? 'fragile' : 'standard';
  if (premium && r < 0.45) return 'vip';
  return r < 0.2 ? 'express' : r < 0.33 ? 'surge' : r < 0.45 ? 'long' : 'standard';
}

export function rollPersona(rnd = Math.random): Persona {
  const all = Object.keys(PERSONAS) as Persona[];
  return all[Math.floor(rnd() * all.length)];
}

/** Seconds allowed for timed missions: a brisk ~11 m/s average over the Manhattan distance, plus slack. */
export const timeLimit = (distance: number) => Math.round(distance / 11 + 25);

export interface MissionResult { tip: number; note: string; xp: number; starPenalty: number }

/**
 * Extra pay for a finished mission. `base` is the fare actually paid (after the car's multiplier);
 * the result is added on top of the normal tip.
 */
export function missionResult(v: Variant, persona: Persona | undefined, base: number, elapsed: number, limit: number | undefined, log: RideLog): MissionResult {
  let tip = 0, xp = 0, starPenalty = 0;
  const notes: string[] = [];
  const onTime = limit !== undefined && elapsed <= limit;
  switch (v) {
    case 'express': if (onTime) { tip += base * 0.4; notes.push('express bonus'); } break;
    case 'hot': if (onTime) { tip += base * 0.3; notes.push('still hot'); } break;
    case 'vip': tip += base * 0.6 * log.comfort; starPenalty += (1 - log.comfort) * 2; if (log.comfort > 0.95) notes.push('flawless VIP ride'); break;
    case 'fragile': tip += base * 0.35 * log.comfort; starPenalty += (1 - log.comfort) * 1.5; if (log.comfort < 0.5) notes.push('it spilled'); break;
    case 'long': xp += 25; break;
    default: break;
  }
  if (persona) {
    const happy = personaHappy(persona, elapsed, limit, log);
    if (happy > 0) tip += base * 0.12 * happy;
    if (persona === 'grumpy' && log.bumps > 0) starPenalty += 0.5;
    // the radio: right music earns a tip, the wrong music costs stars
    if (log.music > 10) { tip += base * 0.1; notes.push('loved the music'); }
    else if (log.music < -10) starPenalty += 0.4;
  }
  return { tip: Math.round(tip * 100) / 100, note: notes.join(' · '), xp, starPenalty };
}

/** 0..1: how much this passenger enjoyed the ride (drives their tip and goodbye line). */
export function personaHappy(p: Persona, elapsed: number, limit: number | undefined, log: RideLog): number {
  const smooth = Math.max(0, 1 - log.bumps * 0.4 - log.harsh * 0.2);
  switch (p) {
    case 'quiet': return log.fast > 6 ? smooth * 0.5 : smooth;
    case 'hurry': return limit !== undefined ? Math.max(0, Math.min(1, (limit - elapsed) / (limit * 0.35) + 0.3)) : Math.min(1, log.fast / 10);
    case 'tourist': return 0.8;
    case 'grumpy': return log.bumps === 0 && log.harsh === 0 ? 0.6 : 0;
    case 'party': return Math.min(1, log.fun / 4 + 0.2);
    case 'chatty': return 0.4 + smooth * 0.4;
  }
}

/** Surge multiplier for a surge job (1.4x–2.0x in 0.1 steps). */
export const rollSurge = (rnd = Math.random) => Math.round((1.4 + rnd() * 0.6) * 10) / 10;

/** Rider compliments, like the real app's badges. */
export const COMPLIMENTS: Record<string, string> = {
  smooth: 'Smooth driving', music: 'Great music', speedy: 'Speedy service', chat: 'Great conversation', expert: 'Expert navigation',
};
/** A happy rider (4.8+ stars) may leave a compliment that fits the ride. */
export function complimentFor(p: Persona, stars: number, elapsed: number, limit: number | undefined, log: RideLog): string | null {
  if (stars < 4.8) return null;
  if (log.music > 10) return 'music';
  if (log.bumps === 0 && log.harsh === 0 && (p === 'quiet' || p === 'grumpy')) return 'smooth';
  if (p === 'hurry' || (limit !== undefined && elapsed < limit * 0.8)) return 'speedy';
  if (p === 'chatty' || p === 'tourist') return 'chat';
  return log.bumps === 0 ? 'expert' : null;
}
