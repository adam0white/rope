import { expect, it } from 'vitest';
import { campFacts, campFallback } from '../src/sim/camp.ts';
import { queueInput, startClimb, step } from '../src/sim/climb.ts';
import worker from '../worker/index.ts';

const post = (body: unknown, ip = '1.2.3.4') =>
  new Request('https://x/api/camp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'cf-connecting-ip': ip },
  });
const env = (
  on: string,
  run: () => Promise<{ response?: string }> = async () => ({
    response: 'Nell: We got down.\nnarration\nOskar: We did.',
  }),
) => ({
  ASSETS: { fetch: async () => new Response('asset') },
  AI: { run },
  CAMP_AI: on,
});

it('camp facts preserve an actual HF deferral and journal; the fallback is deterministic', () => {
  const s = startClimb(1, 3);
  // Authored host locations exercise the actual HF response; this is not a completed climb.
  for (const member of [...s.members, s.leader]) member.pos = { place: null, leg: 'meadow', t: 0.5 };
  s.members.find((m) => m.id === 'oskar')!.pos.t = 0.6;
  queueInput(s, { t: 'say', to: 'tamar', act: 'gather', with: 'oskar', force: 'ask' });
  step(s);
  const f = campFacts(s, 'Hollin');
  expect(f.people).toHaveLength(5);
  expect(f.answers.some((answer) => answer.includes('Oskar') && answer.includes('deferred'))).toBe(true);
  expect(campFallback(f)).toEqual(campFallback(campFacts(s, 'Hollin')));
});

it('the camp Worker: kill switch, model lines only, per-IP limit', async () => {
  let calls = 0;
  const off = await (
    await worker.fetch(
      post({}),
      env('off', async () => {
        calls++;
        return {};
      }),
    )
  ).json();
  expect(off).toEqual({ fallback: true, why: 'off' });
  expect(calls).toBe(0);
  const ok = (await (await worker.fetch(post({ people: ['Nell: down'] }), env('on'))).json()) as {
    lines: string[];
  };
  expect(ok.lines).toEqual(['Nell: We got down.', 'Oskar: We did.']);
  let last: unknown;
  for (let i = 0; i < 8; i++) last = await (await worker.fetch(post({}, '9.9.9.9'), env('on'))).json();
  expect(last).toEqual({ fallback: true, why: 'limit' });
});
