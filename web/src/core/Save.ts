// Versioned save schema with migration from the v3/v4 single-file prototype.
import { VEHICLES, type Upgrades } from '../data/vehicles';

export const SAVE_KEY = 'shift-city-save';
export const SAVE_VERSION = 5;

export type GraphicsMode = 'rendered' | 'photoreal' | 'hyper';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type Weather = 'dry' | 'wet' | 'rain';
export interface Settings {
  graphics: GraphicsMode; camera: CameraView; audio: boolean;
  volume: { master: number; engine: number; sfx: number; music: number };
  time: TimeOfDay; weather: Weather; showFps: boolean;
}
export type CameraView = 'cockpit' | 'chase' | 'top';
export interface ArcadeScore { score: number; car: string; date: number; near: number }

export interface SaveData {
  version: number;
  wallet: number;
  xp: number;
  level: number;
  owned: string[];
  selected: string;
  upgrades: Record<string, Upgrades>;
  arcade: { best: number; points: number; runs: number; lastRunId: string; top: ArcadeScore[] };
  /** Name used on the leaderboards. */
  playerName: string;
  story: { chapter: number };
  stats: { trips: number; earned: number; km: number; food: number; nearMisses: number; rating: number; ratings: number };
  paidJobs: string[];
  claimedGoals: string[];
  tutorialDone: boolean;
  settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    wallet: 0, xp: 0, level: 1,
    owned: ['classic'], selected: 'classic',
    upgrades: {},
    arcade: { best: 0, points: 0, runs: 0, lastRunId: '', top: [] },
    playerName: '',
    story: { chapter: 0 },
    stats: { trips: 0, earned: 0, km: 0, food: 0, nearMisses: 0, rating: 4.9, ratings: 1 },
    paidJobs: [], claimedGoals: [], tutorialDone: false,
    settings: { graphics: 'photoreal', camera: 'chase', audio: true, volume: { master: 0.8, engine: 0.7, sfx: 0.8, music: 0.6 }, time: 'day', weather: 'dry', showFps: false },
  };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** v3/v4 saves stored cars by index into this original eight-car line-up. */
const LEGACY_IDS = ['metro', 'comfort', 'exec_suv', 'lux_ev', 'apex_v12', 'rosso_f90', 'royal_gt', 'vortex'];

/** Converts a v3/v4 save (index-based vehicles) into the v5 schema. */
export function migrateLegacy(old: any, missions: any): SaveData {
  const s = defaultSave();
  s.wallet = Math.max(0, num(old.wallet));
  s.xp = Math.max(0, num(old.xp));
  s.level = Math.max(1, Math.floor(num(old.level, 1)));
  const idOf = (i: unknown) => (Number.isInteger(i) && LEGACY_IDS[i as number] ? LEGACY_IDS[i as number] : null);
  const owned = (Array.isArray(old.owned) ? old.owned : [0]).map(idOf).filter(Boolean) as string[];
  s.owned = Array.from(new Set(['classic', 'metro', ...owned]));
  s.selected = idOf(old.selected) ?? 'metro';
  if (!s.owned.includes(s.selected)) s.selected = 'metro';
  const handling = Math.min(5, Math.max(0, Math.floor(num(old.upgrades))));
  if (handling) s.upgrades[s.selected] = { engine: 0, brakes: 0, handling };
  s.arcade.best = num(old.arcadeBest);
  s.arcade.points = Math.max(0, num(old.arcadeTokens));
  s.arcade.runs = num(old.arcadeRuns);
  s.story.chapter = Math.min(5, Math.max(0, Math.floor(num(old.storyChapter))));
  s.stats.trips = num(old.totalTrips);
  s.stats.earned = num(old.totalEarned);
  s.stats.km = num(old.totalKm);
  s.stats.food = Math.max(num(old.totalFood), num(missions?.foodDone));
  s.tutorialDone = !!old.tutorialSeen;
  if (Array.isArray(missions?.claimed)) s.claimedGoals = missions.claimed.filter((x: unknown) => typeof x === 'string');
  return s;
}

/** Fills missing fields and clamps values so a corrupted/older v5 save can't break the game. */
export function normalize(raw: any): SaveData {
  const d = defaultSave();
  const s: SaveData = {
    ...d, ...raw,
    arcade: { ...d.arcade, ...(raw?.arcade ?? {}) },
    story: { ...d.story, ...(raw?.story ?? {}) },
    stats: { ...d.stats, ...(raw?.stats ?? {}) },
    settings: { ...d.settings, ...(raw?.settings ?? {}), volume: { ...d.settings.volume, ...(raw?.settings?.volume ?? {}) } },
    upgrades: { ...(raw?.upgrades ?? {}) },
  };
  s.version = SAVE_VERSION;
  if (!['rendered', 'photoreal', 'hyper'].includes(s.settings.graphics)) s.settings.graphics = 'photoreal';
  if (!['day', 'sunset', 'night'].includes(s.settings.time)) s.settings.time = 'day';
  if (!['dry', 'wet', 'rain'].includes(s.settings.weather)) s.settings.weather = 'dry';
  for (const k of ['master', 'engine', 'sfx', 'music'] as const) s.settings.volume[k] = Math.min(1, Math.max(0, num(s.settings.volume[k], k === 'music' ? 0.6 : 0.8)));
  s.owned = Array.isArray(s.owned) ? s.owned.filter((id) => VEHICLES.some((v) => v.id === id)) : ['classic'];
  // everyone owns the free starter (players from before it existed get it added alongside their cars)
  if (!s.owned.includes('classic')) s.owned.unshift('classic');
  if (!s.owned.includes(s.selected)) s.selected = 'classic';
  if (!Array.isArray(s.paidJobs)) s.paidJobs = [];
  if (!Array.isArray(s.claimedGoals)) s.claimedGoals = [];
  if (!Array.isArray(s.arcade.top)) s.arcade.top = [];
  s.arcade.top = s.arcade.top.filter((e) => e && Number.isFinite(e.score)).slice(0, 10);
  if (typeof s.playerName !== 'string') s.playerName = '';
  s.wallet = Math.max(0, num(s.wallet));
  s.level = Math.max(1, Math.floor(num(s.level, 1)));
  return s;
}

export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Whether this device already has a Shift City save (current or legacy). */
export function hasSave(store: Storage | null = safeStorage()): boolean {
  try { return !!store && !!(store.getItem(SAVE_KEY) ?? store.getItem('shift-city-v4') ?? store.getItem('shift-city-v3')); } catch { return false; }
}

export function loadSave(store: Storage | null = safeStorage()): SaveData {
  if (!store) return defaultSave();
  try {
    const cur = store.getItem(SAVE_KEY);
    if (cur) return normalize(JSON.parse(cur));
    const old = store.getItem('shift-city-v4') ?? store.getItem('shift-city-v3');
    if (old) {
      const m = store.getItem('shift-city-missions-v4') ?? store.getItem('shift-city-missions-v3');
      const parsed = JSON.parse(old);
      if (parsed && typeof parsed.wallet === 'number') return migrateLegacy(parsed, m ? JSON.parse(m) : null);
    }
  } catch { /* fall through to a fresh save */ }
  return defaultSave();
}

export function writeSave(s: SaveData, store: Storage | null = safeStorage()) {
  try { store?.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
