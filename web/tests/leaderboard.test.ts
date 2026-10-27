import { describe, it, expect, vi, beforeAll } from 'vitest';

// in-memory stand-in for the Upstash pipeline endpoint
const zset = new Map<string, number>();
const kv = new Map<string, number>();
function run(cmd: (string | number)[]) {
  const [op, ...a] = cmd;
  switch (op) {
    case 'ZADD': zset.set(String(a[2]), Number(a[1])); return 1;
    case 'ZREVRANK': { const s = [...zset.entries()].sort((x, y) => y[1] - x[1]); const i = s.findIndex((e) => e[0] === a[1]); return i < 0 ? null : i; }
    case 'ZREMRANGEBYRANK': return 0;
    case 'ZRANGE': return [...zset.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).flatMap(([m, sc]) => [m, String(sc)]);
    case 'INCR': { const v = (kv.get(String(a[0])) ?? 0) + 1; kv.set(String(a[0]), v); return v; }
    case 'EXPIRE': return 1;
  }
  return null;
}

let handler: (req: unknown, res: unknown) => Promise<unknown>;
beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => ({ ok: true, json: async () => JSON.parse(init.body).map((c: (string | number)[]) => ({ result: run(c) })) }));
  // @ts-expect-error plain JS serverless function
  handler = (await import('../api/leaderboard.js')).default;
});

function call(method: string, body?: unknown) {
  const out: { status: number; json?: any } = { status: 0 };
  const res = { setHeader() {}, status(c: number) { out.status = c; return res; }, json(j: unknown) { out.json = j; return res; }, end() { return res; } };
  return handler({ method, body, headers: { 'x-forwarded-for': '1.2.3.4' } }, res).then(() => out);
}

describe('world leaderboard function', () => {
  it('accepts plausible runs and ranks them', async () => {
    expect((await call('POST', { name: 'Ada<script>', score: 5000, time: 30, car: 'Kite Pico', runId: 'a' })).json.rank).toBe(1);
    expect((await call('POST', { name: 'Bo', score: 9000, time: 40, car: 'Furia V12', runId: 'b' })).json.rank).toBe(1);
    const top = (await call('GET')).json.top;
    expect(top.map((e: { name: string }) => e.name)).toEqual(['Bo', 'Adascript']);
  });
  it('rejects impossible scores', async () => {
    expect((await call('POST', { name: 'X', score: 10_000_000, time: 10 })).status).toBe(400);
    expect((await call('POST', { name: 'X', score: 100, time: 0 })).status).toBe(400);
  });
});
