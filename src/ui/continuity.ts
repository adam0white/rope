import { ENGINE_VERSION, snapshot } from '@adam0white/human-framework';
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
const maxArchive = 1_000_000;

/** Run-scoped ownership, recording and source archive. No current shelf reads on local load. */
export class Continuity {
  generation = 0;
  heads: PersonaEnvelope[] = [];
  fileOrigin = false;
  busy = false;
  status = 'Saving people’s histories in this browser and recording play for the lab are separate choices.';
  runId: string = crypto.randomUUID();
  sources: SourceArchive[] = [];
  private key = crypto.randomUUID();
  private operation = Promise.resolve();
  private state: State | null = null;
  constructor(
    readonly lab: Lab,
    readonly shelf: Shelf | null,
    readonly changed: () => void = () => {},
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
    this.sources = [];
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
      let chapter: Chapter | undefined;
      if (shelf.enabled && !localOnly) {
        const result = await claimCastChapterBatch(
          shelf,
          CAST.map((c) => c.castId),
          this.source(),
          async (inputs: LifePreparation[]) => {
            const initial = Object.fromEntries(openingParty(seed).map((p) => [p.id, structuredClone(p)]));
            for (const input of inputs) {
              const id = input.parent.castId.split('.')[2] ?? '';
              const opening = initial[id];
              if (!opening) throw new Error('This person is not part of this game’s cast.');
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
      if (generation !== this.generation) throw new Error('The run changed. No new chapter was started.');
      const state = createGame(seed, chapter);
      this.state = state;
      this.runId = crypto.randomUUID();
      this.sources = [];
      this.heads = chapter?.claims ?? [];
      this.fileOrigin = false;
      this.status = chapter
        ? `This season uses ${chapter.inputs.length} saved browser histories. They were all reserved together. Everyone else starts with their original history.`
        : localOnly
          ? 'You started a new local chapter. Saved browser histories have not changed.'
          : 'This chapter starts with the original cast. It uses no saved browser histories.';
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
    const sources = structuredClone(saved?.sources ?? []);
    if (!Array.isArray(sources) || (!file && JSON.stringify(sources).length > maxArchive))
      throw new Error('The saved archive is too large to load.');
    this.invalidate();
    this.state = state;
    this.heads = heads;
    this.runId = saved?.runId ?? crypto.randomUUID();
    this.fileOrigin = file || saved?.fileOrigin === true;
    this.sources = sources;
    this.status =
      'The people saved with this run have been restored. Their current browser histories were not loaded. Importing a file gives this run no permission to update those histories.';
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
    const shelf = this.shelf;
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
          'Finish this climb before saving a person for another chapter. Their activities, injuries and responsibilities must also allow departure.',
        );
      await shelf.ready;
      if (!current() || !shelf.enabled)
        throw new Error('Saving browser histories is off, or the run has changed.');
      const person = state.climb.people.find((p) => castIdOf(p.id) === castId);
      if (!person || !CAST.some((c) => c.castId === castId))
        throw new Error('This person is not part of this game’s cast.');
      const parent = this.heads.find((p) => p.castId === castId);
      let envelope: PersonaEnvelope;
      let raw: unknown;
      if (!person.body.alive) {
        if (!parent)
          throw new Error('This run controls no living history for this person that it can close.');
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
      if (!current()) throw new Error('The run changed before the history could be saved.');
      // Preserve full actual source before publication, including failed CAS attempts, local only.
      if (raw) {
        const retained = [
          ...this.sources,
          { revision: envelope.revision, source: envelope.source, snapshot: raw },
        ];
        // Capacity is serialized JSON UTF16 code units, as in the native loader.
        if (JSON.stringify(retained).length > maxArchive)
          throw new Error(
            'Complete source archive exceeds capacity. Download this run. This history was not published.',
          );
        this.sources = retained;
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
    for (const c of CAST) {
      if (!current()) return;
      try {
        await this.checkpoint(c.castId);
      } catch (error) {
        if (!current()) return;
        this.status = String(error);
      }
    }
    if (current()) this.changed();
  }
}

export type Ownership = {
  runId: string;
  heads: PersonaEnvelope[];
  fileOrigin: boolean;
  sources: SourceArchive[];
};

/** Only the protected path selects a file session. */
export function fileEntry(pathname: string): 'native' | 'file' {
  return pathname === '/file/' || pathname === '/file' ? 'file' : 'native';
}
