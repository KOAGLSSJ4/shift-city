// Job generation for Story and Free Ride. Data-driven: story chapters come from data/story.ts.
import { DESTINATIONS, RESTAURANTS, destinationByName, type Destination } from '../data/world';
import { STORY } from '../data/story';
import type { VehicleDef } from '../data/vehicles';
import { jobFare } from './Economy';

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
  startedAt: number;
  bumps: number;
  bonusTime?: number;
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
  };
}

/** Random Free Ride request. Better vehicles unlock premium/VIP passengers. */
export function randomJob(vehicle: VehicleDef, near?: { x: number; z: number }): Job {
  // bias pickups toward the player so jobs don't always start across the map
  const sorted = near ? [...DESTINATIONS].sort((p, q) => Math.hypot(p.x - near.x, p.z - near.z) - Math.hypot(q.x - near.x, q.z - near.z)) : DESTINATIONS;
  const a = near ? sorted[Math.floor(Math.random() * 5)] : pick(DESTINATIONS);
  let b = pick(DESTINATIONS);
  while (b === a) b = pick(DESTINATIONS);
  const food = Math.random() < 0.42;
  const premium = !food && vehicle.premium > 0 && Math.random() < (vehicle.premium === 2 ? 0.55 : 0.35);
  const d = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  return {
    id: newId(), food, a, b,
    restaurant: food ? pick(RESTAURANTS) : undefined,
    customer: premium ? pick(VIP) : pick(NAMES),
    fare: jobFare(d, vehicle, premium) + Math.round(Math.random() * 500) / 100,
    premium, chapter: null, stage: 'offer', startedAt: 0, bumps: 0,
  };
}

/** Star rating from driving behaviour: bumps cost stars, comfortable cars soften it. */
export function starsFor(job: Job, vehicle: VehicleDef): number {
  const penalty = job.bumps * (0.55 - vehicle.comfort * 0.05);
  return Math.max(1, Math.min(5, Math.round((5 - penalty) * 10) / 10));
}
