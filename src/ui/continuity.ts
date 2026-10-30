import { validatePortablePerson } from '@adam0white/human-framework';
import type { Lab, PersonaEnvelope } from '@adam0white/lab-client';
import {
  canonicalCast,
  canonicalPersona,
  closePersonaBranch,
  createPersona,
  type LifePreparation,
  type personaChannel,
  portableWriteBlockers,
  validatePersona,
} from '@adam0white/lab-client';
import type { ClimbState } from '../sim/climb.ts';
import { archiveOf, ENGINE_VERSION } from '../sim/hf4.ts';
import { CAST, castIdOf } from '../sim/party.ts';
import { admitClimber, type Chapter, climberTransfer, DIALECT, portableOf, RULES } from '../sim/passport.ts';
import { newSeason, openingParty, type SeasonState } from '../sim/season.ts';

import { type SkippedHistory, skippedMetadata } from './skip-metadata.ts';

export type { SkippedHistory } from './skip-metadata.ts';

type State = { season: SeasonState; climb: ClimbState };
const createGame = (seed: number, chapter?: Chapter): State => newSeason(seed, chapter);

type Shelf = ReturnType<typeof personaChannel>;
export type SourceArchive = {
  revision: string;
  source: PersonaEnvelope['source'];
  envelope: PersonaEnvelope;
  archiveSha256: string;
};
export type RawArchive = { sha256: string; raw: string };
// A complete source is stored once even when all five people share its checkpoint.
export const maxArchive = 128 * 1024 * 1024; // serialized UTF16 units; full sources are never shortened
const digest = async (raw: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  skipped: SkippedHistory[] = [];
  fileOrigin = false;
  localOnly = false;
  busy = false;
  status = 'Saving people’s histories in this browser and recording play for the lab are separate choices.';
  runId: string = crypto.randomUUID();
  sources: SourceArchive[] = [];
  archives: RawArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf | null,
    readonly changed: () => void = () => {},
    readonly archiveLimit = maxArchive,
  ) {
    this.fileOrigin = shelf === null;
    // No run exists on the title. Fresh/load closes the gate before attaching any actor.
  }
  private requireShelf(): Shelf {
    if (this.fileOrigin || !this.shelf)
      throw new Error('File play cannot create or publish browser histories.');
    return this.shelf;
  }
  source(): PersonaEnvelope['source'] {
    return {
      game: 'rope',
      build: String(this.lab.build().c ?? 'local'),
      engine: ENGINE_VERSION,
      rules: RULES,
    };
  }
  invalidate() {
    this.generation++;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  clear() {
    this.requireShelf();
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.skipped = [];
    this.localOnly = false;
    this.sources = [];
    this.archives = [];
  }
  async fresh(seed: number, localOnly = false) {
    const shelf = this.requireShelf();
    if (this.busy) throw new Error('A chapter is already being prepared.');
    this.busy = true;
    this.invalidate();
    const generation = this.generation;
    try {
      await shelf.ready;
      if (!localOnly && generation === this.generation && !shelf.enabled) {
        // Owner 2026-10-27: shared people continue automatically through the public channel.
        shelf.setEnabled(true);
        await shelf.ready;
      }
      if (generation !== this.generation)
        throw new Error('The run changed before its people could be prepared.');
      const heads = localOnly
        ? []
        : await Promise.all(
            CAST.map(
              async ({ castId }) =>
                [castId, await shelf.request<PersonaEnvelope | null>({ action: 'get', castId })] as const,
            ),
          );
      if (generation !== this.generation)
        throw new Error('The run changed before its people could be prepared.');
      const incoming: PersonaEnvelope[] = [];
      const preparations: LifePreparation[] = [];
      const skipped: SkippedHistory[] = [];
      const initial = Object.fromEntries(openingParty(seed).map((p) => [p.id, p]));
      if (!localOnly)
        for (const [castId, head] of heads) {
          if (!head) continue;
          let reason = 'Their saved history could not be used here.';
          let admitted: ReturnType<typeof admitClimber>;
          let personId: string;
          try {
            const blockers = portableWriteBlockers(castId, 'rope');
            if (blockers.length) {
              reason = 'Their saved history cannot be used here until the other games support it.';
              throw new Error(reason);
            }
            reason = 'Their saved history uses an unsupported edition or could not be checked.';
            await validatePersona(head);
            if (head.terminal) {
              reason = 'Their saved history has ended.';
              throw new Error(reason);
            }
            if (head.transfer.portableClaim) {
              reason = 'They are still in another chapter.';
              throw new Error(reason);
            }
            if (!head.transfer.portable) throw new Error('This history uses an unsupported edition.');
            const portable = validatePortablePerson(head.transfer.portable);
            if (portable.version !== 2) throw new Error('This history uses an unsupported portable version.');
            reason = 'Their saved history cannot continue in this season.';
            portableOf(head);
            const id = CAST.find((c) => c.castId === castId)?.castId.split('.')[2];
            const opening = id && initial[id];
            if (!opening) throw new Error('This person has no role in this season.');
            admitted = admitClimber(head, opening);
            personId = id;
          } catch {
            skipped.push({
              castId,
              reason: `${canonicalCast(castId).name}: ${reason} This season uses a separate local story. Their saved history has not been replaced.`,
            });
            continue;
          }
          const preparation = await shelf.request<LifePreparation | null>({ action: 'prepare', castId });
          if (!preparation || canonicalPersona(preparation.parent) !== canonicalPersona(head))
            throw new Error('The shared history changed while preparing the arrival. Choose again.');
          initial[personId] = admitted;
          preparations.push(preparation);
          incoming.push(head);
        }
      const runId = crypto.randomUUID();
      const claims: PersonaEnvelope[] = [];
      if (!localOnly)
        for (const [castId, head] of heads) {
          if (skipped.some((s) => s.castId === castId)) continue;
          claims.push(
            await createPersona({
              format: 'hf-persona/1',
              castId,
              castRevision: canonicalCast(castId).revision,
              branchId: head?.branchId ?? crypto.randomUUID(),
              parentRevision: head?.revision ?? null,
              source: this.source(),
              transfer: {
                ...(head?.transfer ?? { castPassport: 'rope-hf4-active/1' }),
                ...(preparations.find((p) => p.parent.castId === castId)
                  ? { life: preparations.find((p) => p.parent.castId === castId)!.life }
                  : {}),
                hostRun: runId,
                portableClaim: { game: 'rope' },
              },
              limitations: [
                ...(head?.limitations ?? []),
                'This person belongs to this season until a supported checkpoint can be saved between activities.',
              ],
            }),
          );
        }
      const chapter: Chapter | undefined = incoming.length
        ? { version: DIALECT, initial, inputs: incoming, claims, preparations }
        : undefined;
      // Construct the complete receiving Run before claiming any shared head.
      const state = createGame(seed, chapter);
      if (generation !== this.generation) throw new Error('The run changed before claiming its people.');
      if (claims.length)
        await shelf.request({
          action: 'putBatch',
          envelopes: claims,
          expectedHeads: Object.fromEntries(heads.map(([castId, head]) => [castId, head?.revision ?? null])),
        });
      if (generation !== this.generation) throw new Error('The run changed. No new chapter was started.');
      this.state = state;
      this.runId = runId;
      this.sources = [];
      this.archives = [];
      this.heads = claims;
      this.skipped = skipped;
      this.fileOrigin = false;
      this.localOnly = localOnly;
      this.status = chapter
        ? `This season uses ${chapter.inputs.length} saved browser histories. They were all reserved together. Everyone else starts with their original history.`
        : localOnly
          ? 'You started a new local chapter. Saved browser histories have not changed.'
          : skipped.length
            ? 'Older, occupied or ended histories remain unchanged on the shelf. This is a new local story for those people; it cannot overwrite their histories.'
            : 'This chapter starts with the original cast. It uses no saved browser histories.';
      if (skipped.length) this.status += ` ${skipped.map((s) => s.reason).join(' ')}`;
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  async validateRunEnvelopes(state: State) {
    if (state.season.chapter)
      await Promise.all(
        [...state.season.chapter.claims, ...state.season.chapter.inputs].map((p) => validatePersona(p)),
      );
  }
  async restoreOwnership(state: State, saved?: Ownership, file = false) {
    // A missing native permission record is unknown, never an owning default.
    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved) ||
      typeof saved.runId !== 'string' ||
      !saved.runId ||
      typeof saved.fileOrigin !== 'boolean' ||
      !Array.isArray(saved.heads) ||
      !Array.isArray(saved.sources) ||
      (Object.hasOwn(saved, 'localOnly') && typeof saved.localOnly !== 'boolean')
    )
      throw new Error('This save lacks history permissions. Keep it and start a fresh season.');
    const generation = this.generation;
    await this.validateRunEnvelopes(state);
    const heads = saved && !file ? await Promise.all(saved.heads.map((p) => validatePersona(p))) : [];
    if (
      heads.length > 5 ||
      new Set(heads.map((p) => p.castId)).size !== heads.length ||
      heads.some(
        (p) =>
          !CAST.some((c) => c.castId === p.castId) ||
          p.source.game !== 'rope' ||
          p.source.rules !== RULES ||
          !(
            state.season.chapter?.claims.some((c) => c.revision === p.revision) ||
            p.transfer.hostRun === saved?.runId
          ),
      )
    )
      throw new Error('The saved permission to update these histories belongs to another run.');
    if (generation !== this.generation) throw new Error('The run changed while it was loading.');
    const skipped =
      skippedMetadata(saved, 'skipped', [
        ...(saved?.heads ?? []),
        ...(state.season.chapter?.claims ?? []),
        ...(state.season.chapter?.inputs ?? []),
        ...(saved?.sources ?? []).map((s) => s.envelope),
      ]) ?? [];
    if (
      saved &&
      !file &&
      !saved.fileOrigin &&
      !saved.localOnly &&
      CAST.some(
        (c) => !heads.some((p) => p.castId === c.castId) && !skipped.some((s) => s.castId === c.castId),
      )
    )
      throw new Error('This save lacks history permissions. Keep it and start a fresh season.');
    if (
      saved.localOnly &&
      (saved.heads.length ||
        skipped.length ||
        saved.sources.length ||
        (saved.archives?.length ?? 0) ||
        (state.season.chapter?.claims.length ?? 0) ||
        (state.season.chapter?.inputs.length ?? 0))
    )
      throw new Error('Local-only play cannot own shared histories.');
    const sources = structuredClone(saved?.sources ?? []);
    const archives = structuredClone(saved?.archives ?? []);
    if (
      !Array.isArray(sources) ||
      !Array.isArray(archives) ||
      (!file && JSON.stringify({ sources, archives }).length > this.archiveLimit)
    )
      throw new Error('The saved archive is too large to load.');
    this.invalidate();
    this.state = state;
    this.heads = heads;
    this.skipped = skipped;
    this.runId = saved?.runId ?? crypto.randomUUID();
    this.fileOrigin = file || saved.fileOrigin;
    this.localOnly = saved.localOnly === true;
    this.sources = sources;
    this.archives = archives;
    this.status =
      'The people saved with this run have been restored. Their current browser histories were not loaded. Importing a file gives this run no permission to update those histories.';
    if (skipped.length) this.status += ` ${skipped.map((s) => s.reason).join(' ')}`;
  }
  ownership(): Ownership {
    return structuredClone({
      runId: this.runId,
      heads: this.heads,
      ...(this.skipped.length ? { skipped: this.skipped } : {}),
      sources: this.sources,
      archives: this.archives,
      fileOrigin: this.fileOrigin,
      localOnly: this.localOnly,
    });
  }
  attach(state: State) {
    this.state = state;
  }
  pinnedHistories() {
    const group = new Map(
      (this.state?.season.chapter?.claims ?? []).map((p) => [`${p.castId}/${p.branchId}`, p]),
    );
    for (const p of this.heads) group.set(`${p.castId}/${p.branchId}`, p);
    return [...group.values()].sort((a, b) =>
      `${a.castId}/${a.branchId}`.localeCompare(`${b.castId}/${b.branchId}`),
    );
  }

  async recording(_allow = false) {
    this.lab.setPersonaRecording(this.key);
    this.lab.allowPersonaRecording(true);
  }

  async deny() {
    // Recording is controlled only by the menu switch.
  }

  async setEnabled(value: boolean) {
    const shelf = this.requireShelf();
    this.invalidate();
    await shelf.ready;
    shelf.setEnabled(value);
    this.status =
      'Your choice about using browser histories has changed. This chapter keeps its current people. Only a new chapter can load browser histories.';
  }
  checkpoint(castId: string, fork = false) {
    if (this.fileOrigin || !this.shelf) return Promise.reject(new Error('File play cannot publish people.'));
    if (this.localOnly) return Promise.reject(new Error('Local-only play cannot publish people.'));
    const shelf = this.shelf;
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const task = this.operation.then(async () => {
      if (this.skipped.some((s) => s.castId === castId))
        throw new Error('This history was skipped. This local story cannot publish, fork or close it.');
      const current = () => generation === this.generation && state === this.state && runId === this.runId;
      if (
        !state ||
        !current() ||
        (!state.climb.over &&
          state.climb.people.find((p) => castIdOf(p.id) === castId)?.body.alive !== false) ||
        !state.climb.inputs.length
      )
        throw new Error(
          'Finish this climb before saving a person for another chapter. Their activities, injuries and responsibilities must also allow departure.',
        );
      await shelf.ready;
      if (!current() || !shelf.enabled)
        throw new Error('Saving browser histories is off, or the run has changed.');
      const person = state.climb.people.find((p) => castIdOf(p.id) === castId);
      if (!person || !CAST.some((c) => c.castId === castId))
        throw new Error('This person is not part of this game’s cast.');
      const blockers = portableWriteBlockers(castId, 'rope');
      if (blockers.length)
        throw new Error(
          `${person.name}: shared history cannot be saved until ${blockers.join(', ')} supports it.`,
        );
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!person.body.alive) {
        if (!parent)
          throw new Error('This run controls no living history for this person that it can close.');
        if (parent.terminal) return;
        raw = canonicalPersona(archiveOf(state.climb));
        const closed = await closePersonaBranch(parent, this.source(), Math.round(person.now * 60_000));
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({
          ...body,
          transfer: {
            ...body.transfer,
            hostRun: runId,
            terminalCheckpoint: {
              sha256: await digest(raw as string),
              atMs: archiveOf(state.climb).current.at,
            },
          },
        });
      } else {
        const captured = await climberTransfer(state.climb, person.id);
        raw = captured.raw;
        const branchId = fork ? crypto.randomUUID() : (parent?.branchId ?? crypto.randomUUID());
        envelope = await createPersona({
          format: 'hf-persona/1',
          castId,
          castRevision: canonicalCast(castId).revision,
          branchId,
          parentRevision: fork ? null : (parent?.revision ?? null),
          source: this.source(),
          transfer: { ...captured.transfer, hostRun: runId },
          limitations: captured.limitations,
        });
      }
      if (!current()) throw new Error('The run changed before the history could be saved.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        if (typeof raw !== 'string') throw new Error('The complete HF source archive is unavailable.');
        const sha256 = await digest(raw);
        if (!current()) throw new Error('The run changed before the history could be saved.');
        const existing = this.archives.find((a) => a.sha256 === sha256);
        if (existing && existing.raw !== raw) throw new Error('Conflicting complete source archive.');
        const archives = existing ? this.archives : [...this.archives, { sha256, raw }];
        const retained = [
          ...this.sources,
          { revision: envelope.revision, source: envelope.source, envelope, archiveSha256: sha256 },
        ];
        if (JSON.stringify({ sources: retained, archives }).length > this.archiveLimit)
          throw new Error(
            'Complete source archive exceeds capacity. Download this run. This history was not published.',
          );
        this.sources = retained;
        this.archives = archives;
        this.changed();
      }
      if (!current()) throw new Error('The run changed before the history could be saved.');
      await shelf.request({
        action: 'put',
        envelope,
        fork,
      });
      if (!current()) return;
      this.heads = [...this.heads.filter((p) => p.castId !== castId), envelope].sort((a, b) =>
        a.castId.localeCompare(b.castId),
      );
      this.key = crypto.randomUUID();
      this.lab.setPersonaRecording(this.key);
      this.status = `${person.name}: ${envelope.terminal ? 'This history has ended.' : 'The current history has been saved.'} Details that other games cannot use remain in the local export.`;
      this.changed();
      if (current()) await this.recording();
    });
    this.operation = task.catch(() => {});
    return task;
  }
  private closing = new Map<string, () => boolean>();
  closeDeaths() {
    if (this.fileOrigin || !this.shelf) return;
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const current = () => generation === this.generation && state === this.state && runId === this.runId;
    for (const head of this.heads) {
      if (
        head.terminal ||
        this.closing.get(head.castId)?.() ||
        this.state?.climb.people.find((p) => castIdOf(p.id) === head.castId)?.body.alive !== false
      )
        continue;
      this.closing.set(head.castId, current);
      void this.checkpoint(head.castId)
        .catch((error) => {
          if (current()) this.status = String(error);
        })
        .finally(() => {
          if (this.closing.get(head.castId) === current) this.closing.delete(head.castId);
        });
    }
  }
  async checkpointAll() {
    if (this.fileOrigin || !this.shelf) return;
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const current = () => generation === this.generation && state === this.state && runId === this.runId;
    const failures: string[] = [];
    for (const c of CAST) {
      if (!current()) return;
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        if (!current()) return;
        failures.push(String(error));
      }
    }
    if (current()) {
      if (failures.length) this.status = failures.join(' ');
      this.changed();
    }
  }
}

export type Ownership = {
  runId: string;
  heads: PersonaEnvelope[];
  skipped?: SkippedHistory[];
  fileOrigin: boolean;
  localOnly?: boolean;
  sources: SourceArchive[];
  archives?: RawArchive[];
};

/** Only the protected path selects a file session. */
export function fileEntry(pathname: string): 'native' | 'file' {
  return pathname === '/file/' || pathname === '/file' ? 'file' : 'native';
}
