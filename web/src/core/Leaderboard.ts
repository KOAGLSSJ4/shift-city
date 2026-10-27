// Optional world leaderboard (Vercel function in web/api/leaderboard.js). Every call fails quietly:
// on portals or without the backend the game just shows the local top 10.
export interface WorldEntry { name: string; score: number; car: string }

const ENDPOINT: string = import.meta.env.VITE_LEADERBOARD_URL ?? (import.meta.env.VITE_TARGET === 'web' ? 'api/leaderboard' : '');

export const leaderboardEnabled = () => !!ENDPOINT;

async function call<T>(init?: RequestInit): Promise<T | null> {
  if (!ENDPOINT) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(ENDPOINT, { ...init, signal: ctl.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWorldTop(): Promise<WorldEntry[] | null> {
  return (await call<{ top: WorldEntry[] }>())?.top ?? null;
}

export async function submitWorldScore(run: { name: string; score: number; time: number; near: number; car: string; runId: string }): Promise<number | null> {
  const r = await call<{ rank: number | null }>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) });
  return r?.rank ?? null;
}
