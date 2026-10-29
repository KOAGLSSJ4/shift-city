// Job generation for Story and Free Ride. Data-driven: story chapters come from data/story.ts.
import { DESTINATIONS, RESTAURANTS, destinationByName, type Destination } from '../data/world';
import { STORY } from '../data/story';
import type { VehicleDef } from '../data/vehicles';
import { jobFare } from './Economy';
import { newLog, rollPersona, rollSurge, rollVariant, timeLimit, type Persona, type RideLog, type Variant } from './Missions';

export type JobStage = 'offer' | 'pickup' | 'dropoff' | 'done';
export interface Job {
  id: string;
  food: boolean;
  a: Destination;
  b: Destination;
  restaurant?: string;
  customer: string;
  fare: number;
  premium: boolean;
  chapter: number | null;
  stage: JobStage;
  /** Seconds left to accept a Free Ride offer (undefined = no time limit, e.g. story). */
  expires?: number;
  startedAt: number;
  bumps: number;
  bonusTime?: number;
  variant: Variant;
  persona?: Persona;
  /** Seconds allowed from pickup to drop-off for timed missions (express, hot food). */
  limit?: number;
  surge?: number;
  /** Time the passenger/order came on board (CityMode clock). */
  pickedAt?: number;
  log: RideLog;
}

const NAMES = ['Sam', 'Priya', 'Tunde', 'Lucia', 'Ken', 'Amara', 'Jonas', 'Mei', 'Kwame', 'Sofia', 'Omar', 'Hannah', 'Diego', 'Zara', 'Leo', 'Ifeoma'];
const VIP = ['Ms. Duval (CEO)', 'Mr. Adeyemi (VIP)', 'Lady Hart', 'Dr. Romano', 'Sir Bellamy'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export function storyJob(chapter: number): Job | null {
  const ch = STORY[chapter];
  if (!ch) return null;
  return {
    id: newId(), food: ch.food, a: destinationByName(ch.a), b: destinationByName(ch.b),
    restaurant: ch.food ? 'Noodle Street' : undefined, customer: ch.passenger,
    fare: ch.price, premium: chapter >= 4, chapter, stage: 'offer', startedAt: 0, bumps: 0, bonusTime: ch.bonusTime,
    variant: 'standard', log: newLog(),
  };
}

/** Random Free Ride request. Better vehicles unlock premium/VIP passengers. */
export function randomJob(vehicle: VehicleDef, near?: { x: number; z: number }, premiumBoost = 0): Job {
  // bias pickups toward the player so jobs don't always start across the map
  const sorted = near ? [...DESTINATIONS].sort((p, q) => Math.hypot(p.x - near.x, p.z - near.z) - Math.hypot(q.x - near.x, q.z - near.z)) : DESTINATIONS;
  const a = near ? sorted[Math.floor(Math.random() * 5)] : pick(DESTINATIONS);
  const food = Math.random() < 0.42;
  const premium = !food && vehicle.premium > 0 && Math.random() < (vehicle.premium === 2 ? 0.55 : 0.35) + premiumBoost;
  const variant = rollVariant(food, premium);
  let b = pick(DESTINATIONS);
  while (b === a) b = pick(DESTINATIONS);
  // long haul: the farthest destination from the pickup
  if (variant === 'long') b = [...DESTINATIONS].sort((p, q) => dist(a, q) - dist(a, p))[0];
  const d = dist(a, b);
  const surge = variant === 'surge' ? rollSurge() : undefined;
  let fare = jobFare(d, vehicle, premium) + Math.round(Math.random() * 500) / 100;
  if (surge) fare *= surge;
  if (variant === 'long') fare *= 1.25;
  return {
    id: newId(), food, a, b,
    restaurant: food ? pick(RESTAURANTS) : undefined,
    customer: premium ? pick(VIP) : pick(NAMES),
    fare: Math.round(fare * 100) / 100,
    premium, chapter: null, stage: 'offer', startedAt: 0, bumps: 0,
    variant, persona: food ? undefined : rollPersona(), surge,
    limit: variant === 'express' || variant === 'hot' ? timeLimit(d) : undefined,
    log: newLog(),
  };
}

/** A surge zone like the real app's heat map: rides picked up inside it pay a multiplier. */
export interface SurgeZone { name: string; x: number; z: number; r: number; mult: number; until: number }
export const SURGE_ZONE_SECONDS = 180;
export function rollSurgeZone(now: number, rnd = Math.random): SurgeZone {
  const d = DESTINATIONS[Math.floor(rnd() * DESTINATIONS.length)];
  return { name: d.name, x: d.x, z: d.z, r: 90, mult: rollSurge(rnd), until: now + SURGE_ZONE_SECONDS };
}
/** Makes a ride that starts inside the zone a surge ride. Returns true if it applied. */
export function applySurgeZone(job: Job, zone: SurgeZone): boolean {
  if (job.food || job.surge || Math.hypot(job.a.x - zone.x, job.a.z - zone.z) > zone.r) return false;
  job.variant = 'surge';
  job.surge = zone.mult;
  job.fare = Math.round(job.fare * zone.mult * 100) / 100;
  return true;
}

const dist = (p: Destination, q: Destination) => Math.abs(p.x - q.x) + Math.abs(p.z - q.z);

/** Star rating from driving behaviour: bumps cost stars, comfortable cars soften it. */
export function starsFor(job: Job, vehicle: VehicleDef): number {
  const penalty = job.bumps * (0.55 - vehicle.comfort * 0.05);
  return Math.max(1, Math.min(5, Math.round((5 - penalty) * 10) / 10));
}
