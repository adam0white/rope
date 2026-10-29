import { readRunHistory } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { offersFor, queueInput, snapshot, step } from '../src/sim/climb.ts';
import { archiveOf, FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { castIdOf } from '../src/sim/party.ts';
import { admitClimber, climberTransfer, DIALECT, RULES } from '../src/sim/passport.ts';
import { exportClimb, newSeason, openingParty, replayExport } from '../src/sim/season.ts';

it('carries prepared life into a costed hut activity and a replayable journal', async () => {
  const origin = newSeason(7).climb;
  origin.over = true;
  queueInput(origin, { t: 'release-person', to: 'oskar' });
  for (let i = 0; i < 12 && !origin.hfReleased.oskar; i++) step(origin);
  step(origin);
  const captured = await climberTransfer(origin, 'oskar');
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: castIdOf('oskar'),
    castRevision: '1',
    branchId: 'arrival-test',
    parentRevision: null,
    source: { game: 'rope', build: 'test', engine: FRAMEWORK_VERSION, rules: RULES },
    transfer: captured.transfer,
    limitations: captured.limitations,
  });
  const prepared = preparePersonaLife(parent, 1800000000000);
  const { revision, ...body } = parent;
  const claim = await createPersona({
    ...body,
    parentRevision: parent.revision,
    source: { game: 'rope', build: 'test', engine: FRAMEWORK_VERSION, rules: RULES },
    transfer: { ...parent.transfer, life: prepared.life, hostRun: 'test', portableClaim: { game: 'rope' } },
  });
  const initial = Object.fromEntries(
    openingParty(8).map((p) => [p.id, p.id === 'oskar' ? admitClimber(parent, p) : p]),
  );
  const { climb, season } = newSeason(8, {
    version: DIALECT,
    inputs: [parent],
    claims: [claim],
    initial,
    preparations: [prepared],
  });
  expect(climb.journal.some((j) => j.who === 'oskar' && j.text.includes('prepar'))).toBe(true);
  expect(offersFor(climb, 'oskar').some((o) => o.id === 'arrival-preparation' && o.duration === 8)).toBe(
    true,
  );
  for (let i = 0; i < 10; i++) step(climb);
  const receipts = readRunHistory(archiveOf(climb)).flatMap((t) => t.inputs);
  const exported = exportClimb(season.start!, climb, FRAMEWORK_VERSION, season.chapter);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  for (const [work, place, duration] of [
    ['local-help', 'public-garden', 4],
    ['free-time', 'home', 0],
  ] as const) {
    const life = { ...initialPersonaLife(parent.castId, parent.branchId, 1800000000000), work, place };
    const variant = await createPersona({ ...body, transfer: { ...body.transfer, life } });
    const preparation = preparePersonaLife(variant, 1800000000000);
    const { revision: variantRevision, ...variantBody } = variant;
    const variantClaim = await createPersona({
      ...variantBody,
      parentRevision: variantRevision,
      transfer: {
        ...variant.transfer,
        life: preparation.life,
        hostRun: 'test',
        portableClaim: { game: 'rope' },
      },
    });
    const party = Object.fromEntries(
      openingParty(8).map((p) => [p.id, p.id === 'oskar' ? admitClimber(variant, p) : p]),
    );
    const result = newSeason(8, {
      version: DIALECT,
      inputs: [variant],
      claims: [variantClaim],
      initial: party,
      preparations: [preparation],
    }).climb;
    const offer = offersFor(result, 'oskar').find((o) => o.id === 'arrival-preparation');
    expect(offer?.duration ?? 0).toBe(duration);
    expect(
      result.journal.some(
        (j) => j.who === 'oskar' && j.text.includes(duration ? 'preparations to make' : 'time to help'),
      ),
    ).toBe(true);
  }
  expect(
    receipts.some(
      (i) =>
        i.kind === 'action.resolved' &&
        i.payload.person === 'oskar' &&
        i.payload.outcome?.actionId === 'wait' &&
        i.payload.outcome.status === 'completed' &&
        i.payload.outcome.end - i.payload.outcome.start >= 8 * 60000,
    ),
  ).toBe(true);
});
