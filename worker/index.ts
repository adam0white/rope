/**
 * The Rope's Worker: static assets, plus POST /api/camp, which asks a small Workers AI model to voice camp talk
 * from facts the client sends (HF decision records and journal lines). The reply is text only; the game shows it
 * as talk and never reads state from it. Caps (owner budget, $5 in total): kill switch CAMP_AI="off"; a per-IP
 * limit and a global daily cap, both held in isolate memory (no storage, so they are per isolate: conservative
 * in intent, not exact); small model; small max_tokens; bounded input. Any refusal or failure returns
 * { fallback: true } and the client shows its own labelled, deterministic lines.
 */
interface Env {
  ASSETS: { fetch(r: Request): Promise<Response> };
  AI: { run(model: string, input: unknown): Promise<{ response?: string }> };
  CAMP_AI?: string;
}

const MODEL = '@cf/meta/llama-3.2-1b-instruct';
const MAX_TOKENS = 180;
const PER_IP_PER_HOUR = 6;
const DAILY_CAP = 200;
const MAX_BODY = 6000;

const perIp = new Map<string, number[]>();
let day = '';
let today = 0;

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function allow(ip: string, now: number): boolean {
  const d = new Date(now).toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    today = 0;
    perIp.clear();
  }
  if (today >= DAILY_CAP) return false;
  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= PER_IP_PER_HOUR) return false;
  hits.push(now);
  perIp.set(ip, hits);
  today++;
  return true;
}

const strs = (v: unknown, n: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .slice(0, n)
        .map((x) => x.slice(0, 240))
    : [];

async function camp(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (env.CAMP_AI !== 'on') return json({ fallback: true, why: 'off' });
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ fallback: true, why: 'too long' });
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!allow(ip, Date.now())) return json({ fallback: true, why: 'limit' });
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(body);
  } catch {
    return json({ fallback: true, why: 'bad input' });
  }
  const facts = [
    `Mountain: ${String(f.mountain ?? '').slice(0, 40)}`,
    'What happened to each person:',
    ...strs(f.people, 6),
    'What people said when they disagreed with the leader (time, name, kind of answer, reason, their words):',
    ...strs(f.answers, 8),
    'The journal:',
    ...strs(f.journal, 20),
  ].join('\n');
  try {
    const out = await env.AI.run(MODEL, {
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content:
            'You write four short lines of quiet talk at a mountain hut in the evening, between the people named in the facts. Use only the facts given; invent no events, injuries or summits. Each line is "Name: words". No narration, no numbers, no lists, no advice to the reader.',
        },
        { role: 'user', content: facts },
      ],
    });
    const text = (out.response ?? '').trim().slice(0, 900);
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][a-z]+: /.test(l))
      .slice(0, 5);
    if (!lines.length) return json({ fallback: true, why: 'empty' });
    return json({ lines, model: MODEL });
  } catch {
    return json({ fallback: true, why: 'error' });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/camp') return camp(req, env);
    return env.ASSETS.fetch(req);
  },
};
