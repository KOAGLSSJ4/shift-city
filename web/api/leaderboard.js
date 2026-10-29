// Vercel serverless function: global Arcade Rush leaderboard backed by Upstash Redis (REST API).
// Needs the Upstash REST URL + token env vars (Vercel → Storage → Upstash adds them; see env() below).
// Without them it answers 503 and the game simply hides the world board.
//   GET  /api/leaderboard          → { top: [{ name, score, car }] }
//   POST /api/leaderboard {name, score, time, near, car, runId} → { rank }
const KEY = 'shiftcity:arcade:v1';
const MAX_ENTRIES = 200;
const MAX_POINTS_PER_SECOND = 4000; // well above the best possible run; rejects edited scores

// Vercel's Upstash integration names these differently depending on how it was connected
// (UPSTASH_REDIS_REST_*, KV_REST_API_*, or either with a custom prefix), so accept any of them.
const env = (suffixes) => {
  for (const s of suffixes) if (process.env[s]) return process.env[s];
  const key = Object.keys(process.env).find((k) => suffixes.some((s) => k.endsWith('_' + s)));
  return key ? process.env[key] : undefined;
};
const URL_ = env(['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL']);
const TOKEN = env(['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN']);

async function redis(...commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((r) => r.result);
}

const clean = (name) => String(name ?? '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 14) || 'Driver';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readTop() {
  const [flat] = await redis(['ZRANGE', KEY, 0, 9, 'REV', 'WITHSCORES']);
  const top = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { const m = JSON.parse(flat[i]); top.push({ name: m.n, car: m.c, score: Number(flat[i + 1]) }); } catch { /* skip bad rows */ }
  }
  return top;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'leaderboard not configured' });
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ top: await readTop() });
    }
    if (req.method !== 'POST') return res.status(405).end();
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const score = Math.floor(Number(b.score)), time = Number(b.time);
    if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(time) || time < 3 || time > 3600 || score > time * MAX_POINTS_PER_SECOND) {
      return res.status(400).json({ error: 'invalid run' });
    }
    // light rate limit: 30 submissions per IP per hour
    const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
    const rl = `shiftcity:rl:${ip}`;
    const [count] = await redis(['INCR', rl], ['EXPIRE', rl, 3600, 'NX']);
    if (count > 30) return res.status(429).json({ error: 'slow down' });
    const member = JSON.stringify({ n: clean(b.name), c: String(b.car ?? '').slice(0, 24), id: String(b.runId ?? '').slice(0, 40) });
    const [, rank] = await redis(['ZADD', KEY, score, member], ['ZREVRANK', KEY, member], ['ZREMRANGEBYRANK', KEY, 0, -(MAX_ENTRIES + 1)]);
    return res.status(200).json({ rank: rank === null ? null : rank + 1 });
  } catch (e) {
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}
