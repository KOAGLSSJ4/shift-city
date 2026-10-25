// Vehicle catalog. Names/prices are placeholders carried over from v4 (fictional brands).
export type BodyType = 'hatch' | 'sedan' | 'suv' | 'gt' | 'super' | 'royal' | 'hyper';

export interface VehicleStats {
  accel: number;   // m/s² at full throttle
  top: number;     // m/s
  brake: number;   // m/s² deceleration
  grip: number;    // lateral grip factor (1 = baseline)
  steer: number;   // max steer angle (radians)
}

export interface VehicleDef {
  id: string;
  name: string;
  kind: string;
  level: number;
  cost: number;
  color: number;
  body: BodyType;
  /** Optional authored glTF model (photoreal asset) replacing the procedural body. */
  model?: string;
  fare: number;      // fare multiplier in Story/Free Ride
  arcade: number;    // arcade score multiplier
  seats: number;
  comfort: number;   // 1..5, affects tips
  premium: 0 | 1 | 2; // 0 = standard, 1 = premium jobs, 2 = VIP jobs
  stats: VehicleStats;
  dims: { length: number; width: number; height: number; wheelbase: number };
}

export const VEHICLES: VehicleDef[] = [
  { id: 'metro', name: 'Metro Hatchback', kind: 'Starter', level: 1, cost: 0, color: 0x19a99e, body: 'hatch',
    fare: 1, arcade: 1, seats: 4, comfort: 2, premium: 0,
    stats: { accel: 5.2, top: 40, brake: 9, grip: 1.0, steer: 0.62 },
    dims: { length: 3.9, width: 1.75, height: 1.5, wheelbase: 2.45 } },
  { id: 'comfort', name: 'Comfort Sedan', kind: 'Comfort', level: 2, cost: 450, color: 0x4a8ee5, body: 'sedan',
    fare: 1.15, arcade: 1.05, seats: 4, comfort: 3, premium: 0,
    stats: { accel: 6.0, top: 46, brake: 10, grip: 1.05, steer: 0.58 },
    dims: { length: 4.7, width: 1.82, height: 1.45, wheelbase: 2.8 } },
  { id: 'exec_suv', name: 'Executive SUV', kind: 'Executive', level: 4, cost: 1300, color: 0x303c51, body: 'suv',
    fare: 1.35, arcade: 1.08, seats: 6, comfort: 4, premium: 1,
    stats: { accel: 6.2, top: 48, brake: 9.5, grip: 0.95, steer: 0.55 },
    dims: { length: 4.95, width: 1.98, height: 1.8, wheelbase: 2.95 } },
  { id: 'lux_ev', name: 'Luxury Electric GT', kind: 'Premium', level: 7, cost: 3500, color: 0xf3dca0, body: 'gt',
    fare: 1.6, arcade: 1.15, seats: 4, comfort: 4, premium: 1,
    stats: { accel: 9.0, top: 62, brake: 11.5, grip: 1.15, steer: 0.56 },
    dims: { length: 4.95, width: 1.95, height: 1.38, wheelbase: 2.95 } },
  { id: 'apex_v12', name: 'Apex V12', kind: 'Supercar', level: 10, cost: 9000, color: 0xf4c219, body: 'super',
    fare: 1.65, arcade: 1.4, seats: 2, comfort: 2, premium: 1,
    stats: { accel: 11, top: 78, brake: 13, grip: 1.3, steer: 0.55 },
    dims: { length: 4.6, width: 2.0, height: 1.15, wheelbase: 2.7 } },
  { id: 'rosso_f90', name: 'Rosso F90', kind: 'Supercar', level: 13, cost: 16000, color: 0xd01020, body: 'super',
    model: 'assets/cars/rosso.glb',
    fare: 1.7, arcade: 1.6, seats: 2, comfort: 2, premium: 1,
    stats: { accel: 11.8, top: 82, brake: 13.5, grip: 1.35, steer: 0.55 },
    dims: { length: 4.55, width: 1.95, height: 1.2, wheelbase: 2.65 } },
  { id: 'royal_gt', name: 'Royal Grand Tourer', kind: 'VIP Luxury', level: 17, cost: 32000, color: 0x1c1d24, body: 'royal',
    fare: 2.4, arcade: 1.3, seats: 4, comfort: 5, premium: 2,
    stats: { accel: 7.8, top: 64, brake: 11, grip: 1.05, steer: 0.5 },
    dims: { length: 5.6, width: 2.0, height: 1.6, wheelbase: 3.5 } },
  { id: 'vortex', name: 'Vortex Hyper GT', kind: 'Hypercar', level: 22, cost: 65000, color: 0x2a6fe0, body: 'hyper',
    fare: 1.85, arcade: 2.0, seats: 2, comfort: 3, premium: 2,
    stats: { accel: 14.5, top: 98, brake: 15, grip: 1.45, steer: 0.52 },
    dims: { length: 4.55, width: 2.04, height: 1.12, wheelbase: 2.72 } },
];

export const vehicleById = (id: string): VehicleDef => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

export type UpgradeTrack = 'engine' | 'brakes' | 'handling';
export const UPGRADE_TRACKS: { id: UpgradeTrack; label: string; blurb: string }[] = [
  { id: 'engine', label: 'Engine', blurb: '+7% acceleration, +3% top speed per level' },
  { id: 'brakes', label: 'Brakes', blurb: '+10% braking per level' },
  { id: 'handling', label: 'Handling', blurb: '+6% grip and steering per level' },
];
export const MAX_UPGRADE = 5;

export interface Upgrades { engine: number; brakes: number; handling: number }

/** Effective driving stats after upgrades. */
export function effectiveStats(def: VehicleDef, up: Upgrades): VehicleStats {
  const s = def.stats;
  return {
    accel: s.accel * (1 + 0.07 * up.engine),
    top: s.top * (1 + 0.03 * up.engine),
    brake: s.brake * (1 + 0.1 * up.brakes),
    grip: s.grip * (1 + 0.06 * up.handling),
    steer: s.steer * (1 + 0.03 * up.handling),
  };
}
