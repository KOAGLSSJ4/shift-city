// Exports the data-driven game definitions to JSON for the Unreal version (shift-city-unreal).
// Run: npx vite-node scripts/export-data.ts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VEHICLES, UPGRADE_TRACKS, MAX_UPGRADE } from '../src/data/vehicles';
import { STORY } from '../src/data/story';
import { GOALS } from '../src/data/goals';
import { BALANCE } from '../src/data/balancing';
import { GRID_DESTINATIONS, RESTAURANTS } from '../src/data/world';

const out = process.argv[2] ?? 'export';
mkdirSync(out, { recursive: true });
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n');

// Unreal works in centimetres; speeds stay in m/s and are converted in C++.
write('vehicles.json', { maxUpgrade: MAX_UPGRADE, upgradeTracks: UPGRADE_TRACKS, vehicles: VEHICLES.map((v) => ({
  id: v.id, name: v.name, kind: v.kind, level: v.level, cost: v.cost, color: hex(v.color), body: v.body,
  fare: v.fare, arcade: v.arcade, seats: v.seats, comfort: v.comfort, premium: v.premium,
  accel: v.stats.accel, topSpeed: v.stats.top, brake: v.stats.brake, grip: v.stats.grip, steer: v.stats.steer,
})) });
write('story.json', { chapters: STORY.map((c) => ({ ...c, bonusTime: c.bonusTime ?? 0 })) });
write('goals.json', { goals: GOALS });
write('balancing.json', { ...BALANCE, pickupRadius: BALANCE.pickupRadius * 100, xpPerLevel: 100 });
write('destinations.json', { restaurants: RESTAURANTS, destinations: GRID_DESTINATIONS().map((d) => ({ name: d.name, landmark: d.landmark })) });
console.log('exported to', out);
