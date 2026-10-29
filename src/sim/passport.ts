/** Current portable v2 histories; old HF3 files remain intact and refuse explicitly. */
import {
  inspect,
  type PersonAuthoring,
  type PortablePerson,
  validatePortablePerson,
} from '@adam0white/human-framework';
import { canonicalCast, canonicalPersona, type PersonaEnvelope } from '@adam0white/lab-client';
import type { ClimbState } from './climb.ts';
import { ACTIONS, archiveOf, hfRunOf, need } from './hf4.ts';
import { CAST, castIdOf } from './party.ts';
export const RULES = 'rope-hf4-1';
export const DIALECT = 'rope-hf4-cast/1';
export const MAPPING = 'rope-hf4-calendar/1';
export type Chapter = {
  version: typeof DIALECT;
  inputs: PersonaEnvelope[];
  claims: PersonaEnvelope[];
  initial: Record<string, PersonAuthoring>;
};
const SOURCE_ROLES: Record<string, Record<string, string>> = {
  rope: Object.fromEntries(CAST.map((c) => [c.castId.split('.')[2]!, c.castId])),
  commonstead: { oskar: castIdOf('oskar') },
};
const same = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
export function portableOf(envelope: PersonaEnvelope): PortablePerson {
  const cast = canonicalCast(envelope.castId),
    portable = validatePortablePerson(envelope.transfer.portable);
  if (
    (portable.source.personId !== envelope.castId &&
      SOURCE_ROLES[portable.source.game]?.[portable.source.personId] !== envelope.castId) ||
    portable.version !== 2 ||
    envelope.terminal ||
    !CAST.some((c) => c.castId === envelope.castId) ||
    cast.revision !== envelope.castRevision ||
    portable.castId !== envelope.castId ||
    portable.castRevision !== envelope.castRevision ||
    portable.source.game !== envelope.source.game ||
    portable.source.engine !== envelope.source.engine ||
    !/^4\./.test(portable.source.engine) ||
    !cast.games.includes(envelope.source.game) ||
    envelope.transfer.castPassport !== `hf-portable-person/${portable.version}`
  )
    throw Error(
      'This person cannot continue in this season. Keep the source chapter or export it. Start fresh to use a new person.',
    );
  if (envelope.transfer.portableClaim)
    throw Error('This person still belongs to another chapter. Continue or export that chapter first.');
  return portable;
}
function retainedReferences(portable: PortablePerson, person: string) {
  type Kind = 'action' | 'entity' | 'source' | 'norm' | 'proposition';
  const references: { kind: Kind; source: string; target: string }[] = [];
  if (portable.version !== 2) return references;
  const declared = new Set<string>();
  const add = (kind: Kind, id: string | undefined) => {
    if (!id || declared.has(`${kind}:${id}`)) return;
    declared.add(`${kind}:${id}`);
    if ((kind === 'entity' || kind === 'source') && (id === 'self' || id === portable.source.personId)) {
      if (id !== 'self') references.push({ kind, source: id, target: person });
      return;
    }
    const foreign = portable.source.game !== 'rope';
    const historical =
      (foreign && (kind === 'entity' || kind === 'source')) || (kind === 'action' && !ACTIONS.includes(id));
    references.push({
      kind,
      source: id,
      target: historical ? `history:${portable.source.game}:${encodeURIComponent(id)}` : id,
    });
  };
  const memory = portable.retained.memory;
  for (const episode of [...memory.episodes, ...memory.gists]) {
    add('action', episode.action);
    for (const id of [episode.actorId, episode.targetId, episode.placeId]) add('entity', id);
    add('source', episode.voiceId);
  }
  for (const id of Object.keys(memory.sourceTrust)) add('source', id);
  for (const belief of memory.beliefs) {
    add('proposition', belief.prop);
    for (const source of belief.sources) add('source', source.id);
    add('source', belief.provenance?.origin);
    add('source', belief.provenance?.firstFrom);
  }
  for (const row of memory.contradictions) {
    add('source', row.sourceId);
    add('proposition', row.prop);
  }
  for (const row of memory.expectations) {
    const actions = [
      ...new Set([
        ...ACTIONS,
        ...[...memory.episodes, ...memory.gists].flatMap((e) => (e.action ? [e.action] : [])),
      ]),
    ];
    if (actions.includes(row.key)) add('action', row.key);
    else {
      const matches = actions.filter((action) => row.key.startsWith(`${action}@`));
      if (matches.length !== 1)
        throw Error('This remembered expectation cannot be mapped here. Keep the source chapter.');
      const action = matches[0]!;
      add('action', action);
      add('entity', row.key.slice(action.length + 1));
    }
  }
  for (const duty of [...portable.retained.agenda.commitments, ...portable.retained.agenda.owed]) {
    for (const action of [...duty.actions, ...(duty.violatedBy ?? [])]) {
      if (!ACTIONS.includes(action))
        throw Error('This person has a responsibility this hill cannot support. Keep the source chapter.');
      add('action', action);
    }
    if ('toId' in duty) add('entity', duty.toId);
    if ('targetId' in duty) add('entity', duty.targetId);
    add('norm', duty.normId);
  }
  return references;
}

export function admitClimber(input: PersonaEnvelope, opening: PersonAuthoring): PersonAuthoring {
  const portable = portableOf(input);
  if (portable.castId !== castIdOf(opening.id)) throw Error('This history belongs to another person.');
  const result = structuredClone(opening);
  if (portable.version === 2) {
    result.biography = [];
    result.state.beliefs = [];
    result.state.expectations = [];
    result.state.sourceTrust = [];
    result.state.heldNorms = [];
    result.state.agenda.commitments = [];
    result.state.agenda.owed = [];
    result.state.agenda.goals = [];
    result.state.agenda.precommitments = [];
  }
  result.portable = {
    person: portable,
    mapping: {
      offsetMs: portable.version === 2 ? result.state.body.since - portable.retained.at : 0,
      references: retainedReferences(portable, opening.id),
    },
  };
  return result;
}
export function checkChapter(chapter: Chapter) {
  if (
    chapter.version !== DIALECT ||
    !Array.isArray(chapter.inputs) ||
    !Array.isArray(chapter.claims) ||
    chapter.inputs.length > chapter.claims.length ||
    chapter.inputs.length > 5 ||
    new Set(chapter.inputs.map((i) => i.castId)).size !== chapter.inputs.length ||
    !same(Object.keys(chapter.initial).sort(), CAST.map((c) => c.castId.split('.')[2]).sort())
  )
    throw Error('This saved starting party is unsupported. Keep the file and start a fresh season.');
  for (const parent of chapter.inputs) {
    const claim = chapter.claims.find((c) => c.castId === parent.castId);
    if (
      !claim ||
      claim.parentRevision !== parent.revision ||
      claim.branchId !== parent.branchId ||
      claim.source.game !== 'rope' ||
      claim.terminal ||
      claim.castRevision !== parent.castRevision ||
      !same(claim.limitations.slice(0, parent.limitations.length), parent.limitations)
    )
      throw Error('The saved claim does not match its complete source history.');
    const inherited = { ...claim.transfer };
    delete inherited.hostRun;
    delete inherited.portableClaim;
    const original = { ...parent.transfer };
    delete original.hostRun;
    delete original.portableClaim;
    if (!same(inherited, original)) throw Error('The saved claim replaced part of its source history.');
    const ownership = claim.transfer.portableClaim as { game?: string } | undefined;
    if (ownership?.game !== 'rope' || typeof claim.transfer.hostRun !== 'string' || !claim.transfer.hostRun)
      throw Error('The saved claim has no matching season ownership.');
  }
}
export async function climberTransfer(state: ClimbState, personId: string) {
  if (state.hfQueue.length || state.hfPhase)
    throw Error('This season has pending simulation work. Continue before saving shared history.');
  const id = castIdOf(personId),
    cast = canonicalCast(id);
  const inspected = need(
    inspect(hfRunOf(state), {
      perspective: { kind: 'host' },
      people: [personId],
      select: ['persona', 'calendar'],
      portable: { person: personId, castId: id, castRevision: cast.revision },
    }),
  );
  const person = inspected.people[0];
  if (person?.kind !== 'host') throw Error('This person cannot be projected.');
  const portablePart = person.parts.find((p) => p.select === 'persona'),
    calendarPart = person.parts.find((p) => p.select === 'calendar');
  if (portablePart?.select !== 'persona' || calendarPart?.select !== 'calendar')
    throw Error('The complete portable history is unavailable.');
  const portable = validatePortablePerson(portablePart.value),
    raw = canonicalPersona(archiveOf(state));
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    raw,
    transfer: {
      castPassport: `hf-portable-person/${portable.version}`,
      sourceRole: personId,
      portable,
      calendar: calendarPart.value,
      checkpoint: { sha256, atMs: JSON.parse(raw).current.at },
    },
    limitations: [
      'The complete original community Run remains in the local source archive. A new opening maps remembered identities and clocks; it does not record travel, healing or new qualifications.',
    ],
  };
}
