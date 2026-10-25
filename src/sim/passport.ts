import {
  admitCalendarPersona,
  DEFAULT_NORMS,
  isContinuingCommitment,
  type Person,
  projectCalendarPersona,
  restore,
  snapshot,
  validateCalendarPersona,
} from '@adam0white/human-framework';
import {
  canonicalCast,
  canonicalPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { CAST, castIdOf } from './party.ts';

export const RULES = 'rope-cast-1';
export const DIALECT = 'rope-cast/1';
export const MAPPING = 'rope-calendar/1';
export type Chapter = {
  version: typeof DIALECT;
  inputs: LifePreparation[];
  claims: PersonaEnvelope[];
  initial: Record<string, Person>;
};
const same = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
const identity = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, key]));
const supportedActions = new Set(['rest', 'eat', 'drink', 'descend', 'wait']);

/** Finite Small Works Nora/Sam, native Commonstead and forwarded Glance Nerys maps. No clinical or duty waiver. */
export function admitClimber(input: LifePreparation, opening: Person): Person {
  const p = input.parent;
  const cast = canonicalCast(p.castId);
  if (
    !CAST.some((c) => c.castId === p.castId) ||
    p.castId !== castIdOf(opening.id) ||
    p.castRevision !== cast.revision ||
    p.terminal
  )
    throw new Error('This person belongs to an unsupported identity or edition, or their history is closed.');
  if (!same(preparePersonaLife(p, input.clockMs).life, input.life))
    throw new Error('This person’s life history does not match the saved record.');
  const native =
    p.source.game === 'rope' &&
    p.source.rules === RULES &&
    p.transfer.castPassport === DIALECT &&
    p.transfer.sourceRole === opening.id;
  const peer =
    p.castId === 'hf.cast.oskar.rope' &&
    p.source.game === 'commonstead' &&
    p.source.rules === 'commonstead-3' &&
    p.transfer.castPassport === 'commonstead-cast/1' &&
    p.transfer.sourceRole === p.castId;
  if (!peer && !native)
    throw new Error(
      'The Rope cannot continue this person’s history from that game. Export it or choose fresh local play.',
    );
  const portable = validateCalendarPersona(p.transfer.person);
  const sourceId = peer ? p.castId : opening.id;
  const mapping = peer ? 'commonstead-calendar/1' : MAPPING;
  if (
    portable.person.mappingVersion !== mapping ||
    portable.person.source.id !== sourceId ||
    portable.person.source.engine !== '2.17.0' ||
    portable.person.name !== cast.name
  )
    throw new Error('The person’s original role, history format, simulation version or name does not match.');
  const receipt = p.transfer.checkpoint as Record<string, unknown> | undefined;
  if (
    !receipt ||
    receipt.schema !== portable.person.source.schema ||
    receipt.sourceMinute !== portable.person.source.now ||
    !same(receipt.rng, portable.person.rng) ||
    typeof receipt.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)
  )
    throw new Error('The original game’s complete saved record has no verification receipt.');
  if (portable.calendar.norms.some((norm) => !DEFAULT_NORMS.some((known) => same(known, norm))))
    throw new Error('This history uses rules of conduct that The Rope does not understand.');
  if (
    [...portable.calendar.commitments, ...portable.calendar.owed].some((c) =>
      [...c.actions, ...(c.violatedBy ?? [])].some((a) => !supportedActions.has(a)),
    )
  )
    throw new Error(
      'This person has an obligation that they cannot fulfil here. Keep their history in the original game.',
    );
  const target = restore(snapshot(opening));
  const shifted = structuredClone(portable);
  const offset = target.now - portable.person.source.now;
  shifted.calendar.offset = offset;
  for (const c of shifted.calendar.commitments) {
    c.from += offset;
    c.until += offset;
    if (c.recurUntil !== undefined) c.recurUntil += offset;
    if (c.exempt) c.exempt.at += offset;
  }
  for (const d of shifted.calendar.owed) {
    d.at += offset;
    if (d.lapseSince !== undefined) d.lapseSince += offset;
  }
  if (shifted.calendar.lapse) shifted.calendar.lapse.since += offset;
  const age = portable.person.source.now - portable.person.life.bornAt;
  if (age < cast.age * 525600)
    throw new Error('The person’s recorded age does not match their established history.');
  target.life.bornAt = portable.person.life.bornAt + offset;
  target.body.health = portable.person.health.health;
  target.body.fitness = portable.person.health.fitness;
  target.body.circadianPeak = portable.person.health.circadianPeak;
  // Retain health only through HF's strict compatible-body check; never heal a source condition.
  if (peer) {
    const skills = Object.keys(shifted.person.skills);
    shifted.person.skills = {};
    if (skills.length)
      shifted.person.limitations.push(
        `These Commonstead skills remain in the original archive: ${skills.join(', ')}. They do not give this person a climbing qualification.`,
      );
  }
  const admitted = admitCalendarPersona(shifted, target, {
    mappingVersion: mapping,
    sourceId,
    targetId: opening.id,
    targetNorms: DEFAULT_NORMS,
  }).person;
  if (peer && opening.skills.climbing) admitted.skills.climbing = structuredClone(opening.skills.climbing);
  return admitted;
}

export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    chapter.inputs.length > 8 ||
    !Array.isArray(chapter.claims) ||
    chapter.claims.length !== chapter.inputs.length ||
    new Set(chapter.inputs.map((i) => i.parent.castId)).size !== chapter.inputs.length ||
    !same(Object.keys(chapter.initial).sort(), CAST.map((c) => c.castId.split('.')[2]).sort())
  )
    throw new Error('The starting party is incomplete or does not match the required people.');
  for (const input of chapter.inputs) {
    const claim = chapter.claims.find((p) => p.castId === input.parent.castId);
    if (
      !claim ||
      claim.terminal ||
      claim.castRevision !== input.parent.castRevision ||
      claim.branchId !== input.parent.branchId ||
      claim.parentRevision !== input.parent.revision ||
      claim.source.game !== 'rope' ||
      claim.source.engine !== '2.17.0' ||
      claim.source.rules !== RULES ||
      !same(claim.transfer, { ...input.parent.transfer, life: input.life })
    )
      throw new Error('The saved claim to this person’s history does not match its required record.');
  }
}

/** Capture an actual idle boundary. Full source stays local; shelf carries only finite projection. */
export async function climberTransfer(person: Person) {
  if (person.body.injuries.length || person.body.illnesses.length || person.body.downed || !person.body.alive)
    throw new Error(
      'This person has a health condition that must remain in the original game. Their health cannot recover during a transfer.',
    );
  const retained = person.agenda.commitments.filter((c) => isContinuingCommitment(person.agenda, c));
  const owed = person.agenda.owed ?? [];
  const projection = projectCalendarPersona(person, {
    version: MAPPING,
    skills: identity(['climbing'].filter((key) => key in person.skills)),
    calendar: {
      version: 'hf-persona-calendar-map/1',
      offset: 0,
      sourceNorms: DEFAULT_NORMS,
      references: {
        commitments: identity([
          ...retained.flatMap((c) => [c.id, ...(c.makeUpOf ? [c.makeUpOf] : [])]),
          ...owed.flatMap((d) => [d.ofId, ...(d.scheduledAs ? [d.scheduledAs] : [])]),
        ]),
        chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
        actions: identity([
          ...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
          ...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
        ]),
        entities: identity(retained.flatMap((c) => [c.toId, c.targetId].filter((x): x is string => !!x))),
        norms: identity(DEFAULT_NORMS.map((n) => n.id)),
      },
    },
  });
  const raw = snapshot(person);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(raw)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    raw,
    transfer: {
      castPassport: DIALECT,
      sourceRole: person.id,
      person: projection,
      checkpoint: {
        schema: person.schema,
        sourceMinute: person.now,
        rng: structuredClone(person.rng),
        sha256,
      },
    },
    limitations: [
      ...projection.person.limitations.slice(0, 4),
      ...(projection.person.limitations.length > 4
        ? [
            `The saved summary and full local archive list ${projection.person.limitations.length - 4} more parts of the original history that were left out.`,
          ]
        : []),
      'Mountain positions, supplies, discoveries, social memories and temporary physical needs remain in the full original archive. Moving a calendar record takes no game time. It does not represent travel, healing, payment or new qualifications.',
    ],
  };
}
export { lifeAdmission };
