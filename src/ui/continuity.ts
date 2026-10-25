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
  status = 'Saving people’s histories in this browser and recording play for the lab are separate choices.';
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
      engine: '2.21.0',
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
      if (generation !== this.generation)
        throw new Error('The run changed before its people could be prepared.');
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
      this.fileAllowed = false;
      this.denied = false;
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
      throw new Error('The saved permission to update these histories belongs to another run.');
    if (generation !== this.generation) throw new Error('The run changed while it was loading.');
    this.state = state;
    this.heads = heads;
    this.runId = saved?.runId ?? crypto.randomUUID();
    this.fileOrigin = file || saved?.fileOrigin === true;
    this.sources = saved?.sources ?? [];
    if (JSON.stringify(this.sources).length > maxArchive)
      throw new Error('The saved archive is too large to load.');
    this.denied = false;
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
    this.invalidate();
    await this.shelf.ready;
    this.shelf.setEnabled(value);
    this.status =
      'Your choice about using browser histories has changed. This chapter keeps its current people. Only a new chapter can load browser histories.';
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
          'Finish this climb before saving a person for another chapter. Their activities, injuries and responsibilities must also allow departure.',
        );
      await this.shelf.ready;
      if (!current() || !this.shelf.enabled)
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
        this.sources.push({ revision: envelope.revision, source: envelope.source, snapshot: raw });
        while (JSON.stringify(this.sources).length > maxArchive) this.sources.shift();
        this.changed();
      }
      await this.shelf.request({
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
