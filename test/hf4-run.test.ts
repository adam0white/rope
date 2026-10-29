import {
  inspect,
  preview,
  readRunHistory,
  replay as replayHF,
  restoreRun,
  step as stepHF,
} from '@adam0white/human-framework';
import { createPersona } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { advanceFrame, queueInput, replay, restore, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf, FRAMEWORK_VERSION, hfRunOf, need } from '../src/sim/hf4.ts';
import { castIdOf } from '../src/sim/party.ts';
import {
  admitClimber,
  type Chapter,
  climberTransfer,
  DIALECT,
  portableOf,
  RULES,
} from '../src/sim/passport.ts';
import { exportClimb, newSeason, openingParty, replayExport, valley } from '../src/sim/season.ts';

it('records current HF4 requests, costed physical work and exact HF replay', () => {
  const { climb } = newSeason(7);
  for (let i = 0; i < 10; i++) step(climb);
  expect(climb.people.some((p) => p.activity)).toBe(true);
  const archived = archiveOf(climb);
  expect(archived.engine.package).toBe(`@adam0white/human-framework@${FRAMEWORK_VERSION}`);
  const replayed = replayHF(archived);
  expect(replayed.ok).toBe(true);
  const resumed = restore(snapshot(climb));
  for (let i = 0; i < 5; i++) {
    step(climb);
    step(resumed);
  }
  const a = JSON.parse(snapshot(resumed)),
    b = JSON.parse(snapshot(climb));
  function differences(a: unknown, b: unknown, path = ''): string[] {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object')
      return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
        differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k),
      );
    return [path + ':' + JSON.stringify(a) + ' != ' + JSON.stringify(b)];
  }
  expect(differences(a, b).slice(0, 10)).toEqual([]);
});

it('records an actual public climbing answer and a costed completed hut-path receipt', () => {
  const { climb } = newSeason(7);
  const input = queueInput(climb, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 110; i++) step(climb);
  expect(climb.lines.some((line) => line.input === input && line.who === 'oskar')).toBe(true);
  expect(climb.members.find((m) => m.id === 'oskar')!.path).toContain('meadow');
  const archive = archiveOf(climb);
  const completed = readRunHistory(archive)
    .flatMap((t) => t.inputs)
    .find(
      (i) =>
        i.kind === 'action.resolved' &&
        i.payload.person === 'oskar' &&
        i.payload.outcome?.actionId === 'climb' &&
        i.payload.outcome.status === 'completed',
    );
  expect(completed).toBeDefined();
  if (completed?.kind === 'action.resolved')
    expect(completed.payload.outcome!.end - completed.payload.outcome!.start).toBeGreaterThanOrEqual(
      90 * 60000,
    );
  expect(replayHF(archive).ok).toBe(true);
});

it('preserves pending requests and exact partial-frame game replay', () => {
  const { climb, season } = newSeason(7);
  advanceFrame(climb);
  const state = JSON.parse(snapshot(climb));
  expect(state.hfPhase.result.boundary.type).toBe('world-required');
  const restored = need(restoreRun(state.hf));
  expect(need(stepHF(restored, { until: state.hfPhase.target, inputs: [] })).boundary).toEqual(
    state.hfPhase.result.boundary,
  );
  const resumed = restore(snapshot(climb));
  const reconstructed = replay(season.start!, climb.inputs, climb.minute, undefined, climb.hfPhase);
  expect(JSON.parse(snapshot(reconstructed))).toEqual(JSON.parse(snapshot(climb)));
  for (let i = 0; i < 5; i++) {
    step(climb);
    step(resumed);
    step(reconstructed);
  }
  expect(JSON.parse(snapshot(resumed))).toEqual(JSON.parse(snapshot(climb)));
  expect(JSON.parse(snapshot(reconstructed))).toEqual(JSON.parse(snapshot(climb)));
});

it('ends optional chapter goals only after an actual costed release choice and preserves its remembered place', async () => {
  const { climb } = newSeason(7);
  // Authored closed-at-hut opening. No climb, descent or journey completion is awarded.
  climb.over = true;
  const opening = snapshot(climb);
  const input = queueInput(climb, { t: 'release-person', to: 'oskar' });
  for (let i = 0; i < 12 && !climb.hfReleased.oskar; i++) step(climb);
  expect(climb.lines.some((l) => l.who === 'oskar' && l.input === input)).toBe(true);
  expect(climb.hfReleased.oskar).toBe(true);
  // Admit the next-ms agenda receipt, without changing or clearing retained memory.
  step(climb);
  const captured = await climberTransfer(climb, 'oskar');
  expect(captured.transfer.portable.version).toBe(2);
  if (captured.transfer.portable.version === 2)
    expect(
      captured.transfer.portable.retained.memory.episodes.some(
        (e) => e.action === 'rest' && e.placeId === 'place:hollin:hut' && e.voiceId === 'leader',
      ),
    ).toBe(true);
  const canonicalBeforeAdmission = snapshot(climb);
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: castIdOf('oskar'),
    castRevision: '1',
    branchId: 'lived-control',
    parentRevision: null,
    source: { game: 'rope', build: 'control', engine: FRAMEWORK_VERSION, rules: RULES },
    transfer: captured.transfer,
    limitations: captured.limitations,
  });
  const targetParty = openingParty(8).map((p) => (p.id === 'oskar' ? admitClimber(envelope, p) : p));
  const { revision, ...body } = envelope;
  const claim = await createPersona({
    ...body,
    parentRevision: revision,
    source: { game: 'rope', build: 'control', engine: FRAMEWORK_VERSION, rules: RULES },
    transfer: {
      ...body.transfer,
      hostRun: 'admission-control',
      portableClaim: { game: 'rope' },
    },
    limitations: [...body.limitations, 'active chapter'],
  });
  const chapter: Chapter = {
    version: DIALECT,
    inputs: [envelope],
    claims: [claim],
    initial: Object.fromEntries(targetParty.map((p) => [p.id, p])),
  };
  const admitted = newSeason(8, chapter);
  const target = admitted.climb;
  step(target);
  expect(replayHF(archiveOf(target)).ok).toBe(true);
  const exported = exportClimb(admitted.season.start!, target, FRAMEWORK_VERSION, chapter);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  const changed = structuredClone(chapter);
  changed.claims[0]!.limitations = ['replaced original history'];
  expect(() => newSeason(8, changed)).toThrow('source history');
  expect(JSON.parse(snapshot(climb))).toEqual(JSON.parse(canonicalBeforeAdmission));
  const wrong = structuredClone(envelope);
  wrong.transfer.portable = {
    ...captured.transfer.portable,
    source: { ...captured.transfer.portable.source, personId: 'bilal' },
  };
  expect(() => portableOf(wrong)).toThrow('cannot continue');
  const profileOnly = structuredClone(envelope);
  profileOnly.transfer.portable = { ...captured.transfer.portable, version: 1 };
  expect(() => portableOf(profileOnly)).toThrow();
  const reconstructed = replay(opening, climb.inputs, climb.minute);
  expect(JSON.parse(snapshot(reconstructed))).toEqual(JSON.parse(snapshot(climb)));
});

it('continues the same public Run through a short valley interval', () => {
  const { climb } = newSeason(7);
  for (let i = 0; i < 3; i++) step(climb);
  const before = archiveOf(climb);
  const from = climb.minute;
  valley(climb, from + 120);
  const after = archiveOf(climb);
  expect(readRunHistory(after).length).toBeGreaterThan(readRunHistory(before).length);
  expect(after.initial).toEqual(before.initial);
  expect(replayHF(after).ok).toBe(true);
  const resumed = restore(snapshot(climb));
  valley(climb, from + 125);
  valley(resumed, from + 125);
  const a = JSON.parse(snapshot(resumed)),
    b = JSON.parse(snapshot(climb));
  function differences(a: unknown, b: unknown, path = ''): string[] {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object')
      return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
        differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path + '.' + k),
      );
    return [path + ':' + JSON.stringify(a) + ' != ' + JSON.stringify(b)];
  }
  expect(differences(a, b).slice(0, 10)).toEqual([]);
});

it('keeps actor inspection and conditional preview read only', () => {
  const { climb } = newSeason(7);
  step(climb);
  const before = archiveOf(climb),
    run = hfRunOf(climb);
  expect(
    inspect(run, {
      perspective: { kind: 'person', observer: 'oskar' },
      people: ['oskar'],
      select: ['body', 'events'],
    }).ok,
  ).toBe(true);
  expect(
    preview(run, {
      perspective: { kind: 'person', observer: 'oskar' },
      person: 'oskar',
      until: before.current.at + 60000,
      inputs: [],
      bodyForecast: [{ label: 'rest', durationMs: 60000, load: { mode: 'awake', effort: 0, focus: 0 } }],
    }).ok,
  ).toBe(true);
  expect(archiveOf(climb)).toEqual(before);
});

it('gets a real HF reply to a new request while the person is already working', () => {
  const { climb } = newSeason(7);
  step(climb);
  expect(climb.people.find((p) => p.id === 'oskar')?.activity).toBeTruthy();
  const input = queueInput(climb, { t: 'say', to: 'oskar', act: 'rest', force: 'ask' });
  step(climb);
  expect(climb.lines.some((l) => l.who === 'oskar' && l.input === input)).toBe(true);
  const archive = archiveOf(climb);
  expect(
    archive.current.events.some((e) => e.person === 'oskar' && e.data.kind === 'suggestion-resolved'),
  ).toBe(true);
});
