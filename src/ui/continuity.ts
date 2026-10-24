import { snapshot } from '@adam0white/human-framework';
import type { Lab, LifePreparation, PersonaEnvelope, PersonaLife } from '@adam0white/lab-client';
import {
  anchorPersonaLife,
  canonicalCast,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type personaChannel,
  validatePersona,
} from '@adam0white/lab-client';
import type { ClimbState } from '../sim/climb.ts';
import { CAST, castIdOf } from '../sim/party.ts';
import { admitClimber, type Chapter, climberTransfer, DIALECT, RULES } from '../sim/passport.ts';
import { newSeason, openingParty, type SeasonState } from '../sim/season.ts';

type State = { season: SeasonState; climb: ClimbState };
const createGame = (seed: number, chapter?: Chapter): State => newSeason(seed, chapter);

type Shelf = ReturnType<typeof personaChannel>;
type SourceArchive = { revision: string; source: PersonaEnvelope['source']; snapshot: unknown };
export const LOCAL_KEY = 'rope-cast-local-v1';
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  busy = false;
  status = 'Browser continuity and lab recording are separate choices.';
  runId: string = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private fileAllowed = false;
  private denied = false;
  private authored: { generation: number; epoch: string } | null = null;
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf,
    readonly changed: () => void = () => {},
  ) {
    // No run exists on the title. Fresh/load closes the gate before attaching any actor.
  }
  source(): PersonaEnvelope['source'] {
    return {
      game: 'rope',
      build: String(this.lab.build().c ?? 'local'),
      engine: '2.17.0',
      rules: RULES,
    };
  }
  invalidate() {
    this.generation++;
    this.authored = null;
    this.fileAllowed = false;
    this.denied = true;
    this.key = crypto.randomUUID();
    this.lab.setPersonaRecording(this.key);
    this.changed();
  }
  clear() {
    this.invalidate();
    this.state = null;
    this.heads = [];
    this.sources = [];
  }
  async fresh(seed: number, localOnly = false) {
    if (this.busy) throw new Error('A chapter is already being prepared.');
    this.busy = true;
    this.invalidate();
    const generation = this.generation;
    try {
      await this.shelf.ready;
      if (generation !== this.generation) throw new Error('Run changed before admission.');
      const openingEpoch =
        this.shelf.enabled && !localOnly
          ? await this.shelf.request<{ recordingEpoch: string | null }>({ action: 'recording' })
          : null;
      if (generation !== this.generation) throw new Error('Identity changed before opening.');
      let chapter: Chapter | undefined;
      if (this.shelf.enabled && !localOnly) {
        const result = await claimCastChapterBatch(
          this.shelf,
          CAST.map((c) => c.castId),
          this.source(),
          async (inputs: LifePreparation[]) => {
            const initial = Object.fromEntries(openingParty(seed).map((p) => [p.id, structuredClone(p)]));
            for (const input of inputs) {
              const id = input.parent.castId.split('.')[2] ?? '';
              const opening = initial[id];
              if (!opening) throw new Error('Unallocated person.');
              initial[id] = admitClimber(input, opening);
            }
            return initial;
          },
          { isCurrent: () => generation === this.generation },
        );
        if (result)
          chapter = {
            version: DIALECT,
            initial: result.initial,
            inputs: result.inputs,
            claims: result.claims,
          };
      }
      if (generation !== this.generation) throw new Error('Run changed. No late chapter started.');
      const state = createGame(seed, chapter);
      this.state = state;
      this.runId = crypto.randomUUID();
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      this.fileAllowed = false;
      this.denied = false;
      this.authored =
        !chapter?.inputs.length && openingEpoch?.recordingEpoch
          ? { generation, epoch: openingEpoch.recordingEpoch }
          : null;
      this.status = chapter
        ? `Admitted ${chapter.inputs.length} applicable histories in one atomic whole-allocation claim. Other residents are canonical fresh openings.`
        : localOnly
          ? 'Explicit fresh local chapter; browser histories are untouched.'
          : 'Canonical fresh chapter; no carried histories.';
      // Caller installs the prepared state before opening any recording hook.
      return state;
    } finally {
      this.busy = false;
    }
  }
  async validateRunEnvelopes(state: State) {
    if (state.season.chapter)
      await Promise.all(
        [...state.season.chapter.claims, ...state.season.chapter.inputs.map((i) => i.parent)].map((p) =>
          validatePersona(p),
        ),
      );
  }
  async restoreOwnership(state: State, saved?: Ownership, file = false) {
    this.invalidate();
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
      throw new Error('Ownership receipt belongs to another run.');
    if (generation !== this.generation) throw new Error('Run changed during load.');
    this.state = state;
    this.heads = heads;
    this.runId = saved?.runId ?? crypto.randomUUID();
    this.fileOrigin = file || saved?.fileOrigin === true;
    this.sources = saved?.sources ?? [];
    if (JSON.stringify(this.sources).length > maxArchive) throw new Error('Source archive too large.');
    this.denied = false;
    this.status =
      'Restored pinned actors. No current shelf state was read. File imports acquire no embedded ownership.';
  }
  ownership(): Ownership {
    return structuredClone({
      runId: this.runId,
      heads: this.heads,
      sources: this.sources,
      fileOrigin: this.fileOrigin,
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

  private recordingBatches(pinned: PersonaEnvelope[]) {
    const batches: PersonaEnvelope[][] = [];
    for (const p of pinned) {
      let batch = batches.find((b) => b.length < 8 && !b.some((other) => other.castId === p.castId));
      if (!batch) {
        batch = [];
        batches.push(batch);
      }
      batch.push(p);
    }
    return batches;
  }
  async recording(allow = false) {
    if (allow) {
      this.invalidate();
      this.denied = false;
      this.fileAllowed = this.fileOrigin;
    }
    const generation = this.generation;
    const pinned = structuredClone(this.pinnedHistories());
    const revisions = pinned.map((p) => p.revision).join('/');
    const current = () =>
      generation === this.generation &&
      revisions ===
        this.pinnedHistories()
          .map((p) => p.revision)
          .join('/');
    this.lab.setPersonaRecording(this.key);
    if (this.denied || (this.fileOrigin && !this.fileAllowed)) return;
    if (!pinned.length) {
      if (this.fileOrigin) {
        if (allow && current()) this.lab.allowPersonaRecording(true);
      } else this.lab.setPersonaRecording(null);
      return;
    }
    await this.shelf.ready;
    if (!this.shelf.enabled || !current()) return;
    let allPermitted = true;
    let attemptEpoch: string | undefined;
    // The published bridge permits one envelope per cast ID in a batch. Explicit forks can
    // leave two historical branches for a person; every batch must pass before opening the gate.
    for (const batch of this.recordingBatches(pinned)) {
      const selected = batch.map((p) => p.revision).join('/');
      const query = await this.shelf.request<{
        sameEpoch: boolean;
        revisions: string[];
        recordingEpoch: string | null;
      }>({ action: 'recordingBatch', envelopes: batch });
      if (!current() || query.revisions.join('/') !== selected || !query.recordingEpoch) return;
      if (attemptEpoch !== undefined && query.recordingEpoch !== attemptEpoch) return;
      attemptEpoch = query.recordingEpoch;
      if (allow) {
        const accepted = await this.shelf.request<{
          sameEpoch: boolean;
          revisions: string[];
          recordingEpoch: string | null;
        }>({
          action: 'recordingBatch',
          envelopes: batch,
          allowRecording: true,
          recordingEpoch: query.recordingEpoch ?? undefined,
        });
        if (
          !current() ||
          accepted.revisions.join('/') !== selected ||
          accepted.recordingEpoch !== attemptEpoch
        )
          return;
        allPermitted = allPermitted && accepted.sameEpoch;
      } else allPermitted = allPermitted && query.sameEpoch;
    }
    if (current()) this.lab.allowPersonaRecording(allPermitted);
  }

  async deny() {
    this.invalidate();
    this.status = 'Recording declined for this history. Local play and exports remain available.';
    const generation = this.generation,
      pinned = structuredClone(this.pinnedHistories());
    if (!pinned.length) return;
    await this.shelf.ready;
    if (!this.shelf.enabled || generation !== this.generation) return;
    for (const batch of this.recordingBatches(pinned)) {
      const query = await this.shelf.request<{ recordingEpoch: string | null }>({
        action: 'recordingBatch',
        envelopes: batch,
      });
      if (generation !== this.generation) return;
      await this.shelf.request({
        action: 'recordingBatch',
        envelopes: batch,
        allowRecording: false,
        recordingEpoch: query.recordingEpoch ?? undefined,
      });
      if (generation !== this.generation) return;
    }
  }

  async setEnabled(value: boolean) {
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'Continuity choice changed. This loaded chapter stays pinned; only a new chapter admits browser histories.';
  }
  checkpoint(castId: string, fork = false) {
    const generation = this.generation,
      state = this.state,
      runId = this.runId;
    const task = this.operation.then(async () => {
      const current = () => generation === this.generation && state === this.state && runId === this.runId;
      if (
        !state ||
        !current() ||
        (!state.climb.over &&
          state.climb.people.find((p) => castIdOf(p.id) === castId)?.body.alive !== false) ||
        !state.climb.inputs.length
      )
        throw new Error(
          'Finish the played climb before releasing a person. Current activities, injuries and obligations still have to pass their source checks.',
        );
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled) throw new Error('Continuity is off or run changed.');
      const person = state.climb.people.find((p) => castIdOf(p.id) === castId);
      if (!person || !CAST.some((c) => c.castId === castId)) throw new Error('Not an allocated resident.');
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!person.body.alive) {
        if (!parent) throw new Error('No owned living branch to close.');
        if (parent.terminal) return;
        raw = snapshot(person);
        const closed = await closePersonaBranch(parent, this.source(), person.now);
        const { revision: _revision, ...body } = closed;
        envelope = await createPersona({ ...body, transfer: { ...body.transfer, hostRun: runId } });
      } else {
        const captured = await climberTransfer(person);
        raw = captured.raw;
        const branchId = fork ? crypto.randomUUID() : (parent?.branchId ?? crypto.randomUUID());
        const life =
          !fork && parent?.transfer.life
            ? anchorPersonaLife(parent.transfer.life as PersonaLife, castId, Date.now())
            : initialPersonaLife(castId, branchId, Date.now());
        envelope = await createPersona({
          format: 'hf-persona/1',
          castId,
          castRevision: canonicalCast(castId).revision,
          branchId,
          parentRevision: fork ? null : (parent?.revision ?? null),
          source: this.source(),
          transfer: { ...captured.transfer, life, hostRun: runId },
          limitations: captured.limitations,
        });
      }
      if (!current()) throw new Error('Run changed before checkpoint.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        this.sources.push({ revision: envelope.revision, source: envelope.source, snapshot: raw });
        while (JSON.stringify(this.sources).length > maxArchive) this.sources.shift();
        this.changed();
      }
      const epoch = await this.shelf.request<{ recordingEpoch: string | null }>({ action: 'recording' });
      if (!current()) throw new Error('Identity changed before checkpoint.');
      await this.shelf.request({
        action: 'put',
        envelope,
        fork,
        authored:
          !fork &&
          !parent &&
          !this.fileOrigin &&
          !state.season.chapter?.inputs.length &&
          this.authored?.generation === generation &&
          this.authored.epoch === epoch.recordingEpoch,
        recordingEpoch: epoch.recordingEpoch ?? undefined,
      });
      if (!current()) return;
      this.heads = [...this.heads.filter((p) => p.castId !== castId), envelope].sort((a, b) =>
        a.castId.localeCompare(b.castId),
      );
      this.key = crypto.randomUUID();
      this.lab.setPersonaRecording(this.key);
      this.status = `${person.name}: accepted ${envelope.terminal ? 'terminal closure' : 'source checkpoint'}. Unsupported state remains in the local export.`;
      this.changed();
      await this.recording();
    });
    this.operation = task.catch(() => {});
    return task;
  }
  private closing = new Set<string>();
  closeDeaths() {
    for (const head of this.heads) {
      if (
        head.terminal ||
        this.closing.has(head.castId) ||
        this.state?.climb.people.find((p) => castIdOf(p.id) === head.castId)?.body.alive !== false
      )
        continue;
      this.closing.add(head.castId);
      void this.checkpoint(head.castId)
        .catch((error) => {
          this.status = String(error);
        })
        .finally(() => this.closing.delete(head.castId));
    }
  }
  async checkpointAll() {
    for (const c of CAST) {
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        this.status = String(error);
      }
    }
    this.changed();
  }
}

export type Ownership = {
  runId: string;
  heads: PersonaEnvelope[];
  fileOrigin: boolean;
  sources: SourceArchive[];
};
