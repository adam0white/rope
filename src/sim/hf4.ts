/** Rope's HF4 boundary. Actor readings come only from public inspect; all changes use step. */
import {
  type ActionResolution,
  createPerson,
  createRun,
  DEFAULT_NORMS,
  exportRun,
  step as frameworkStep,
  type Input,
  inspect,
  type Offer,
  type PerceptData,
  type PersonAuthoring,
  type PersonView,
  type Result,
  type Run,
  type RunArchive,
  restoreRun,
  type StepResult,
  type VisibleEvent,
} from '@adam0white/human-framework';
import frameworkPackage from '@adam0white/human-framework/package.json' with { type: 'json' };
import type { ClimbState } from './climb.ts';
import { SEASON } from './mountain.ts';
export const FRAMEWORK_VERSION = frameworkPackage.version;
export const ENGINE_VERSION = FRAMEWORK_VERSION;
/** Diagnostic timings for each actual public step call; excludes host work and archive export. */
export type StepTiming = { wallMs: number; cpuMs: number };
let stepObserver: ((sample: StepTiming) => void) | undefined;
export function observeSteps(observer: (sample: StepTiming) => void): () => void {
  stepObserver = observer;
  return () => {
    stepObserver = undefined;
  };
}
function step(...args: Parameters<typeof frameworkStep>): ReturnType<typeof frameworkStep> {
  if (!stepObserver) return frameworkStep(...args);
  const start = performance.now(),
    cpu = typeof process !== 'undefined' ? process.cpuUsage() : undefined;
  try {
    return frameworkStep(...args);
  } finally {
    const elapsed = cpu ? process.cpuUsage(cpu) : undefined;
    stepObserver({
      wallMs: performance.now() - start,
      cpuMs: elapsed ? (elapsed.user + elapsed.system) / 1000 : 0,
    });
  }
}
export const MINUTE = 60_000;
export const DAY = 86_400_000;
export type HostParts = Extract<PersonView, { kind: 'host' }>['parts'][number];
export type Part<K extends HostParts['select']> = Extract<HostParts, { select: K }>['value'];
export type Commitment = Part<'agenda'>['commitments'][number];
export type PersonReading = {
  id: string;
  name: string;
  now: number;
  life: { bornAt: number; sex: 'male' | 'female' };
  body: Part<'body'>['state'];
  bodyReadout: Part<'body'>['readout'];
  skills: Record<string, { level: number }>;
  agenda: Part<'agenda'>;
  will: Part<'relationships'>;
  activity: Activity | null;
  events: VisibleEvent[];
  lexicon?: { plainEnglish: boolean };
};
export type Person = PersonReading;
export interface Affordance {
  id: string;
  action: string;
  label: string;
  duration: number;
  effort: number;
  focus?: number;
  targetId?: string;
  placeId?: string;
  with?: string[];
  alongside?: string[];
  mode?: 'awake' | 'sleep';
  skill?: { id: string; difficulty: number; domain?: 'general' | 'motor' | 'language' | 'knowledge' };
  advertises: Record<string, number>;
  tags?: string[];
  norms?: Offer['norms'];
  fulfills?: string[];
  diminishes?: string[];
  advances?: string[];
  jointId?: string;
  risk?: { chance: number; severity: number; kind: string };
  material?: number;
  requires?: Offer['demands']['requires'];
  followedBy?: { label?: string; duration: number; effort: number; focus?: number }[];
  forecastAt?: { comfortAt?: number; spentAt?: number };
  voidsBladder?: boolean;
}
export interface FollowOn {
  label?: string;
  duration: number;
  effort: number;
  focus?: number;
}
export interface ReceivedConsequence {
  id: string;
  revision: number;
  trigger: { action: string; placeId?: string; targetId?: string };
  successor: { action: string; placeId?: string; targetId?: string; duration: number; effort: number };
  availableFrom: number;
  availableUntil: number;
  expiresAt: number;
  chance: number;
  confidence: number;
}
export interface Activity {
  id: string;
  affordanceId: string;
  action: string;
  targetId?: string;
  affordance: Affordance;
  startedAt: number;
  endsAt: number;
  effort: number;
  focus: number;
  mode: 'awake' | 'sleep';
  reviewAt: number;
  protest?: boolean;
}
export interface Suggestion {
  voiceId: string;
  affordanceId?: string;
  action?: string;
  strength: number;
  since?: number;
  adviceId?: string;
  appeal?: Extract<
    Input<'suggestion.received'>['payload']['received'],
    { kind: 'ordinary' }
  >['suggestion']['appeal'];
  insist?: boolean;
}
export interface SuggestionResolution {
  voiceId: string;
  verdict: 'assented' | 'complied' | 'deferred' | 'modified' | 'refused' | 'commanded';
  says: string;
  reason: string;
  kind?: string;
  counterOffer?: { affordanceId?: string; label: string };
  commitmentId?: string;
}
export interface DecisionRecord {
  narration?: string;
  review?: boolean;
  chosenAffordanceId?: string | null;
  suggestion?: SuggestionResolution;
  suggestions?: SuggestionResolution[];
}
export interface Percept {
  at: number;
  channel: 'saw' | 'heard' | 'told' | 'felt' | 'outcome' | 'social';
  kind: string;
  actorId?: string;
  targetId?: string;
  placeId?: string;
  valence?: number;
  salience: number;
  summary: string;
  [key: string]: unknown;
}
export interface Outcome {
  affordanceId: string;
  action: string;
  targetId?: string;
  status: 'completed' | 'failed' | 'interrupted';
  at: number;
  needs?: Record<string, number>;
  percepts?: Percept[];
  summary?: string;
  quality?: number;
  fulfills?: string[];
  advances?: string[];
  material?: number;
  injury?: unknown;
  illness?: unknown;
  exposures?: { kind: string; amount?: number }[];
  practice?: unknown;
  voidedBladder?: boolean;
}
export interface SimEvent {
  kind: string;
  personId: string;
  at: number;
  withId?: string;
  [key: string]: unknown;
}
export interface World {
  observed?: (at: number) => void;
  converse: (speaker: Person, listener: Person) => false | { placeId: string };
  now: () => number;
  affordancesFor: (p: Person) => Affordance[];
  perceptsFor: (p: Person, since: number, until: number) => Percept[];
  scarcityFor: (p: Person) => number;
  beginOptions: (p: Person, o: Affordance, d: DecisionRecord) => boolean | undefined;
  resolve: (p: Person, a: Activity, reason: 'ended' | 'interrupted') => Outcome;
}
export const ageYears = (p: Pick<Person, 'now' | 'life'>) => (p.now - p.life.bornAt) / (365.25 * 1440);
export const readBody = (p: Person) => p.bodyReadout;
export const readPerson = (p: Person) => ({ body: p.bodyReadout });
export const voiceOf = (p: Person, id: string) => p.will.voices.find((v) => v.voiceId === id);
export const readBladder = (p: Person) => p.body.bladder;
export function need<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code} ${r.error.path}: ${r.error.message}`);
  return r.value;
}
const runs = new WeakMap<ClimbState, Run>();
interface Runtime {
  at: number;
  revision: number;
  identities: Map<string, PersonAuthoring['identity']>;
}
const runtimes = new WeakMap<ClimbState, Runtime>();
function runtimeOf(s: ClimbState): Runtime {
  let runtime = runtimes.get(s);
  if (!runtime) {
    const identities = new Map(s.hf.initial.people.map((p) => [p.id, p.identity]));
    for (const tx of s.hf.history)
      for (const input of tx.inputs)
        if (input.kind === 'person.arrived')
          identities.set(input.payload.authored.id, input.payload.authored.identity);
    runtime = { at: s.hf.current.at, revision: s.hf.current.world.revision, identities };
    runtimes.set(s, runtime);
  }
  return runtime;
}
export function hfRunOf(s: ClimbState): Run {
  let run = runs.get(s);
  if (!run) {
    run = need(restoreRun(s.hf));
    runs.set(s, run);
  }
  return run;
}
export function archiveOf(s: ClimbState): RunArchive {
  return exportRun(hfRunOf(s)) as RunArchive;
}
export function syncReadings(s: ClimbState): void {
  const run = hfRunOf(s),
    runtime = runtimeOf(s),
    oldPeople = new Map(s.people.map((p) => [p.id, p]));
  const views = need(
    inspect(run, {
      perspective: { kind: 'host' },
      people: [...runtime.identities.keys()],
      select: ['summary', 'body', 'skills', 'agenda', 'relationships', 'events'],
      ...(s.hfEventCursor ? { afterEvent: s.hfEventCursor } : {}),
    }),
  );
  s.people = views.people.map((view) => {
    if (view.kind !== 'host') throw new Error('Host reading required');
    const part = <K extends HostParts['select']>(key: K): Part<K> => {
      const p = view.parts.find((p) => p.select === key);
      if (!p) throw new Error(`Missing ${key}`);
      return p.value as Part<K>;
    };
    const identity = runtime.identities.get(view.id)!;
    const body = part('body');
    const agenda = structuredClone(part('agenda'));
    for (const c of agenda.commitments) {
      c.from /= MINUTE;
      c.until /= MINUTE;
    }
    for (const g of agenda.goals) {
      g.adoptedAt /= MINUTE;
      g.lastAdvancedAt /= MINUTE;
      if (g.deadline !== undefined) g.deadline /= MINUTE;
    }
    return {
      id: view.id,
      name: identity.name,
      now: runtime.at / MINUTE,
      life: { bornAt: identity.birthAt / MINUTE, sex: identity.sex },
      body: structuredClone(body.state),
      bodyReadout: structuredClone(body.readout),
      skills: Object.fromEntries(part('skills').map((v) => [v.id, { level: v.competence }])),
      agenda,
      will: structuredClone(part('relationships')),
      activity: s.hfActive?.[view.id] ?? null,
      events: [...(oldPeople.get(view.id)?.events ?? []), ...part('events')].slice(-128),
      lexicon: { plainEnglish: true },
    } as Person;
  });
}
export function authoredPerson(
  id: string,
  name: string,
  sex: 'female' | 'male' = 'female',
  at = 300 * MINUTE,
): PersonAuthoring {
  return {
    id,
    identity: { name, birthAt: at - 30 * 365 * DAY, sex },
    biography: [],
    origin: {
      kind: 'authored',
      basis: { kind: 'evidence', id: `author:${id}` },
      traits: { kind: 'explicit-authoring', evidence: { kind: 'evidence', id: `traits:${id}` } },
    },
    state: {
      traits: {
        honesty: 0.5,
        emotionality: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        conscientiousness: 0.5,
        openness: 0.5,
      },
      values: {
        benevolence: 0.5,
        universalism: 0.5,
        tradition: 0.5,
        conformity: 0.5,
        security: 0.5,
        achievement: 0.5,
        power: 0.5,
        hedonism: 0.5,
        stimulation: 0.5,
        selfDirection: 0.5,
      },
      body: {
        satiety: 0.8,
        hydration: 0.85,
        sleepPressure: 0.2,
        exertion: 0,
        fitness: 0.5,
        health: 1,
        pain: 0,
        sleepDebtHours: 0,
        depletion: 0,
        circadianPeakMs: 16 * 60 * MINUTE,
        asleep: false,
        since: at,
        doze: {
          context: { posture: 'upright', stimulation: 0.5 },
          basis: { kind: 'authored', author: 'world', at: at },
        },
        bladder: { fill: 0, pending: 0 },
        injuries: [],
        illnesses: [],
        exposures: [],
      },
      needs: {
        safety: 0.8,
        belonging: 0.7,
        esteem: 0.6,
        autonomy: 0.7,
        competence: 0.6,
        leisure: 0.6,
        meaning: 0.6,
      },
      skills: [],
      heldNorms: [],
      beliefs: [],
      consequences: [],
      sourceTrust: [],
      context: {
        scarcity: { kind: 'prior', value: 0, basis: 'engineering:source-zero-context' },
        smoking: { kind: 'unobserved' },
      },
      relationships: [],
      voices: [{ voiceId: 'player', trust: 0.5 }],
      agenda: {
        exemptions: { traveling: { kind: 'unobserved' }, illnessSeverity: { kind: 'unobserved' } },
        commitments: [],
        goals: [],
        precommitments: [],
        owed: [],
      },
      family: { contactCovered: [], aptitudes: {} },
      groups: [],
      reserve: {},
      retention: { trace: 32, chronicleDays: 120 },
      habits: [],
      expectations: [],
      affect: { mood: { valence: 0, arousal: 0.3 }, regulation: 0.3, emotions: [] },
      promptings: { reading: 'none', responses: [] },
      review: { style: 'accounting', atMsOfDay: 21 * 60 * MINUTE },
      bonds: { courtships: [], marriages: [] },
    },
  };
}

export const ACTIONS = [
  'walk',
  'climb',
  'summit',
  'descend',
  'rest',
  'eat',
  'drink',
  'relieve',
  'wait',
  'rope',
  'pack',
  'scout',
  'gather',
  'talk',
  'sleep',
  'pray',
  'escort',
];
export function createClimbRun(s: ClimbState, people: PersonAuthoring[]): void {
  const identities = new Map<string, { kind: string; name: string; evidence?: string }>();
  for (const m of SEASON) {
    for (const place of m.places)
      identities.set(`place:${m.id}:${place.id}`, { kind: 'place', name: place.name });
    for (const leg of m.legs) identities.set(`place:${m.id}:${leg.id}`, { kind: 'route', name: leg.name });
  }
  identities.set('valley', { kind: 'place', name: 'the valley' });
  identities.set('leader', { kind: 'person', name: 'the party leader' });
  identities.set('nell-mother', { kind: 'person', name: "Nell's mother" });
  identities.set('storm', { kind: 'weather', name: 'mountain weather' });
  const retainedActions = new Set<string>(),
    retainedSources = new Set<string>();
  for (const p of people)
    for (const ref of p.portable?.mapping.references ?? []) {
      if (
        ref.kind === 'entity' &&
        !identities.has(ref.target) &&
        !people.some((person) => person.id === ref.target)
      )
        identities.set(ref.target, {
          kind: 'historical-entity',
          name: ref.source,
          evidence: `portable:${p.portable!.person.castId}:${p.portable!.person.castRevision}:${p.portable!.person.source.game}:${ref.source}`,
        });
      if (ref.kind === 'action') retainedActions.add(ref.target);
      if (ref.kind === 'source') retainedSources.add(ref.target);
    }
  const run = need(
    createRun({
      id: `rope:${s.seed}`,
      seed: s.seed,
      start: Math.round(s.minute * MINUTE),
      host: { id: 'rope', edition: 'rope-hf4/1', schema: 'rope-hf4/1' },
      definitions: {
        actions: [...new Set([...ACTIONS, ...retainedActions])].map((id) => ({
          id,
          label: id,
          demands: { effort: 0, focus: 0, mode: 'awake', requires: {} },
          tags: [],
          norms: [],
        })),
        norms: DEFAULT_NORMS,
        marriageCustoms: [],
        skills: [{ id: 'climbing', label: 'climbing', domain: 'motor' }],
        skillTransfers: [],
        methods: [],
        routines: [],
        sources: [
          { type: 'host', id: 'rope' },
          { type: 'voice', id: 'leader' },
          ...people.map((p) => ({ type: 'person' as const, id: p.id })),
          { type: 'person', id: 'nell-mother' },
          ...[...retainedSources]
            .filter((id) => !['rope', 'leader', 'nell-mother', ...people.map((p) => p.id)].includes(id))
            .map((id) => ({ type: 'voice' as const, id })),
        ],
        lexicon: {
          names: { leader: 'you', ...Object.fromEntries(people.map((p) => [p.id, p.identity.name])) },
          roles: {},
          prefer: 'name',
          actions: {},
        },
        calendar: {
          id: 'rope-calendar',
          epoch: { id: 'rope-opening', simulationAt: 0, dayIndex: 0, msOfDay: 0 },
          dayMs: DAY,
          days: [{ dayIndex: 0, start: 0, windows: [] }],
        },
      },
      lifecycle: { kinPremises: [], kinScopes: [] },
      world: {
        revision: 0,
        facts: [...identities].map(([id, value]) => ({
          id: `map:${id}`,
          subject: id,
          predicate: 'kind',
          value: { kind: value.kind, name: value.name },
          at: Math.round(s.minute * MINUTE),
          provenance: { source: 'rope', evidenceId: value.evidence ?? `rope-map:${id}` },
        })),
        hostState: {},
      },
    }),
  );
  for (const p of people) need(createPerson(run, p));
  runs.set(s, run);
  s.hf = archiveOf(s);
  syncReadings(s);
}
export function enqueue<K extends Input['kind']>(
  s: ClimbState,
  kind: K,
  payload: Extract<Input, { kind: K }>['payload'],
): void {
  // Host observations can arrive after a sub-minute world-required boundary.
  // Ordinary inputs must follow that cursor; only its receipts may reuse it.
  const at = Math.max(Math.round(s.minute * MINUTE), runtimes.get(s)?.at ?? s.hf.current.at) + 1;
  s.hfQueue.push({
    id: `host:${at}:${s.hfQueue.length}:${kind}`,
    at,
    source: { type: 'host', id: 'rope' },
    kind,
    payload,
  } as Input);
}
export function interruptPerson(c: { state: ClimbState }, p: Person, _at: number, reason: string): void {
  if (!p.activity) return;
  const activityId = p.activity.id;
  if (
    c.state.hfQueue.some(
      (input) =>
        input.kind === 'activity.interrupted' &&
        input.payload.person === p.id &&
        input.payload.activityId === activityId,
    )
  )
    return;
  enqueue(c.state, 'activity.interrupted', { person: p.id, activityId, reason });
}
export function sendInjury(
  s: ClimbState,
  p: Person,
  injury: Extract<Input<'body.received'>['payload']['receipt'], { type: 'injured' }>['injury'],
): void {
  enqueue(s, 'body.received', {
    person: p.id,
    evidenceId: `injury:${p.id}:${s.minute}`,
    receipt: { type: 'injured', injury: injury as never },
  });
}
export function worldEntity(s: ClimbState, id: string) {
  if (
    id.startsWith('place:') ||
    id.startsWith('history:') ||
    id === 'valley' ||
    ['leader', 'nell-mother', ...s.people.map((p) => p.id)].includes(id)
  )
    return id;
  return `place:${s.mountain}:${id}`;
}
function offerFor(person: string, o: Affordance, state: ClimbState): Offer {
  return {
    id: o.id,
    actionId: o.action,
    label: o.label,
    person,
    durationMs: Math.max(1, Math.round(o.duration * MINUTE)),
    target: o.targetId ? worldEntity(state, o.targetId) : undefined,
    place: o.placeId ? worldEntity(state, o.placeId) : undefined,
    participants: o.with ?? [],
    alongside: o.alongside ?? [],
    demands: {
      effort: o.effort,
      focus: o.focus ?? 0,
      mode: o.mode ?? 'awake',
      requires: o.requires ?? {},
      ...(o.skill ? { skill: { ...o.skill, domain: o.skill.domain ?? 'general' } } : {}),
    },
    tags: o.tags ?? [],
    norms: o.norms ?? [],
    expected: {
      needs: o.advertises,
      material: o.material,
      risk: o.risk,
      voidsBladder: o.voidsBladder,
      followedBy: (o.followedBy ?? []).map(({ duration, ...f }) => ({
        ...f,
        durationMs: Math.round(duration * MINUTE),
      })),
      provenance: ['authored:rope-hf4/1'],
    },
    fulfills: o.fulfills ?? [],
    advances: o.advances ?? [],
    diminishes: o.diminishes ?? [],
  };
}
export function perceptFor(p: Percept, id: string, state?: ClimbState): PerceptData {
  const { at, demonstrates, advice, ...data } = p;
  return {
    ...data,
    ...(p.placeId && state ? { placeId: worldEntity(state, p.placeId) } : {}),
    ...(p.targetId && state ? { targetId: worldEntity(state, p.targetId) } : {}),
    id,
    occurredAt: Math.round(at * MINUTE),
    claims: p.claims ?? [],
    norms: p.norms ?? [],
    advice: ((advice ?? []) as { action: string; affordanceId?: string; strength?: number }[]).map(
      (a, i) => ({ ...a, adviceId: `${id}:advice:${i}` }),
    ),
    consequences: ((p.consequences ?? []) as ReceivedConsequence[]).map((c) => ({
      ...c,
      trigger: {
        ...c.trigger,
        ...(c.trigger.placeId && state ? { placeId: worldEntity(state, c.trigger.placeId) } : {}),
        ...(c.trigger.targetId && state ? { targetId: worldEntity(state, c.trigger.targetId) } : {}),
      },
      successor: {
        ...c.successor,
        duration: undefined,
        durationMs: Math.round(c.successor.duration * MINUTE),
        ...(c.successor.placeId && state ? { placeId: worldEntity(state, c.successor.placeId) } : {}),
        ...(c.successor.targetId && state ? { targetId: worldEntity(state, c.successor.targetId) } : {}),
      },
      availableFrom: Math.round(c.availableFrom * MINUTE),
      availableUntil: Math.round(c.availableUntil * MINUTE),
      expiresAt: Math.round(c.expiresAt * MINUTE),
    })),
    withdrawConsequences: [],
    witnesses: [],
    reports: [],
    provenance: [],
    ...(demonstrates
      ? {
          demonstrates: {
            skill: (demonstrates as { skill: string }).skill,
            level: (demonstrates as { level: number }).level,
            durationMs: Math.round((demonstrates as { minutes: number }).minutes * MINUTE),
            domain: 'motor',
          },
        }
      : {}),
  } as unknown as PerceptData;
}

export function heard(p: Person, text: string, at: number): boolean {
  return p.events.some(
    (e) =>
      e.data.kind === 'observation-attended' &&
      e.data.summary === text &&
      e.data.occurredAt >= at * MINUTE &&
      e.data.attention > 0,
  );
}
function decisionAt(p: Person, offer: Affordance): DecisionRecord {
  const e = p.events.findLast(
    (e) => e.data.kind === 'decision' && e.data.decision.chosenAffordanceId === offer.id,
  );
  if (!e || e.data.kind !== 'decision') return {};
  const convert = (r: NonNullable<typeof e.data.decision.suggestion>): SuggestionResolution => ({
    ...r,
    says: e.narration.map((l) => l.text).join(' ') || r.reason,
  });
  return {
    ...e.data.decision,
    narration: e.narration.map((l) => l.text).join(' '),
    suggestion: e.data.decision.suggestion ? convert(e.data.decision.suggestion) : undefined,
    suggestions: e.data.decision.suggestions?.map(convert),
  };
}
export function* stepPeople(
  s: ClimbState,
  makeWorld: (s: ClimbState) => World,
  to: number,
  suggestions: Record<string, Suggestion>,
  observeIdle?: (p: Person) => void,
  sliceMinutes = 1,
): Generator<void, SimEvent[], void> {
  const run = hfRunOf(s),
    runtime = runtimeOf(s),
    at = Math.round(s.minute * MINUTE) + 1,
    until = Math.round(to * MINUTE);
  const resumed = s.hfPhase?.result;
  let target = s.hfPhase?.target ?? Math.min(until, Math.floor(at / MINUTE) * MINUTE + sliceMinutes * MINUTE);
  s.hfPhase ??= { from: s.minute, to, target, steps: 0, lastNote: s.journal.at(-1) };
  const world = makeWorld(s),
    inputs: Input[] = [];
  // One persisted millisecond ingress phase keeps later player inputs after the closed prior quantum.
  if (!resumed)
    for (const p of s.people) {
      if (!p.body.alive) continue;
      const prior = s.hfOffers[p.id]?.revision ?? 0,
        offers = world.affordancesFor(p);
      s.hfOffers[p.id] = { revision: prior + 1, offers };
      inputs.push({
        id: `offers:${p.id}:${at}`,
        at,
        source: { type: 'host', id: 'rope' },
        kind: 'offers.received',
        payload: { person: p.id, revision: prior + 1, offers: offers.map((o) => offerFor(p.id, o, s)) },
      });
      const percepts = world.perceptsFor(p, -1, at / MINUTE);
      if (percepts.length)
        inputs.push({
          id: `observations:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'rope' },
          kind: 'observation.received',
          payload: {
            person: p.id,
            evidenceId: `perception:${p.id}:${at}`,
            percepts: percepts.map((pc, i) => perceptFor(pc, `percept:${p.id}:${at}:${i}`, s)),
          },
        });
      inputs.push({
        id: `scarcity:${p.id}:${at}`,
        at,
        source: { type: 'host', id: 'rope' },
        kind: 'context.received',
        payload: {
          person: p.id,
          evidenceId: `scarcity:${p.id}:${at}`,
          context: { kind: 'scarcity', value: world.scarcityFor(p) },
        },
      });
      const suggestion = suggestions[p.id];
      if (suggestion)
        inputs.push({
          id: `suggestion:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'rope' },
          kind: 'suggestion.received',
          payload: {
            person: p.id,
            received: {
              kind: 'ordinary',
              suggestion: {
                ...suggestion,
                since: Math.round((suggestion.since ?? s.minute) * MINUTE),
                adviceId: `${suggestion.voiceId}:${suggestion.since ?? s.minute}`,
              } as never,
            },
          },
        });
      // Receiving a suggestion already schedules reconsideration. A second request
      // would run again after its start receipt with the suggestion consumed.
      if (!p.activity && !suggestion) {
        observeIdle?.(p);
        inputs.push({
          id: `decision:${p.id}:${at}`,
          at,
          source: { type: 'host', id: 'rope' },
          kind: 'decision.requested',
          payload: {
            person: p.id,
            reason: 'mountain opportunities',
            treatment: 'ordinary',
            offerRevision: prior + 1,
          },
        });
      }
    }
  if (!resumed) {
    inputs.push(...s.hfQueue.filter((input) => input.at <= target));
    s.hfQueue = s.hfQueue.filter((input) => input.at > target);
  }
  let result = resumed ?? need(step(run, JSON.parse(JSON.stringify({ until: target, inputs }))));
  let alreadyRead = !!resumed;
  for (const input of inputs)
    if (input.kind === 'person.arrived')
      runtime.identities.set(input.payload.authored.id, input.payload.authored.identity);
  const events: SimEvent[] = s.hfPhase.events ?? [];
  for (let limit = 0; limit < 10000; limit++) {
    if (!alreadyRead) {
      runtime.at = result.at;
      syncReadings(s);
      if (result.events.length) s.hfEventCursor = result.events.at(-1)!.id;
      s.minute = Math.floor(runtime.at / MINUTE);
      makeWorld(s).observed?.(runtime.at / MINUTE);
      s.hfPhase = {
        ...s.hfPhase!,
        to,
        target,
        steps: s.hfPhase!.steps + 1,
        events,
        result: JSON.parse(JSON.stringify(result)) as StepResult,
      };
      yield;
    } else alreadyRead = false;
    for (const e of result.events) {
      if (e.data.kind === 'claim-told')
        events.push({
          kind: 'converse',
          personId: e.data.speaker,
          withId: e.data.listener,
          at: e.at / MINUTE,
        });
      else if (e.person) events.push({ kind: e.data.kind, personId: e.person, at: e.at / MINUTE });
    }
    if (result.boundary.type === 'until') {
      if (target === until) return events;
      target = Math.min(until, target + sliceMinutes * MINUTE);
      result = need(step(run, { until: target, inputs: [] }));
      continue;
    }
    const { hf, ...host } = s;
    const candidate = { ...structuredClone(host), hf } as ClimbState,
      receipts: Input[] = [];
    for (const request of [...result.boundary.requests].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      candidate.minute = request.boundaryAt / MINUTE;
      const revision =
        runtime.revision +
        receipts.filter((r) => r.kind === 'action.resolved' && r.payload.worldChange).length;
      const base = { requestId: request.id, requestHash: request.requestHash, worldRevision: revision };
      if (request.kind === 'communication') {
        const w = makeWorld(candidate),
          speaker = candidate.people.find((p) => p.id === request.speaker);
        const received = request.recipients.flatMap((id) => {
          const listener = candidate.people.find((p) => p.id === id);
          return speaker && listener && w.converse(speaker, listener)
            ? [
                {
                  recipient: id,
                  evidenceId: `hearing:${request.id}:${id}`,
                  attention: 1,
                  itemIds: request.items.map((i) => i.id),
                },
              ]
            : [];
        });
        receipts.push({
          id: `receipt:${request.id}`,
          at: request.boundaryAt,
          source: { type: 'host', id: 'rope' },
          kind: 'communication.resolved',
          payload: {
            ...base,
            speaker: request.speaker,
            emittedItemIds: received.length ? request.items.map((i) => i.id) : [],
            received,
          },
        });
        continue;
      }
      const p = candidate.people.find((p) => p.id === request.person);
      if (!p) throw new Error('Missing requested actor');
      p.now = request.boundaryAt / MINUTE;
      const w = makeWorld(candidate);
      let payload: ActionResolution;
      const common = {
        ...base,
        person: p.id,
        activityId: request.activityId,
        stage: request.stage,
        observations: [],
      };
      if (request.stage === 'start') {
        const offered = candidate.hfOffers[p.id]?.offers.find((o) => o.id === request.offerId);
        const current = w.affordancesFor(p).find((o) => o.id === request.offerId);
        if (!offered || !current) payload = { ...common, disposition: 'rejected' };
        else {
          const activity: Activity = {
            id: request.activityId,
            affordanceId: offered.id,
            action: offered.action,
            targetId: offered.targetId,
            affordance: offered,
            startedAt: p.now,
            endsAt: p.now + Math.round(offered.duration * MINUTE) / MINUTE,
            reviewAt: p.now + Math.round(offered.duration * MINUTE) / MINUTE,
            effort: offered.effort,
            focus: offered.focus ?? 0,
            mode: offered.mode ?? 'awake',
          };
          candidate.hfActive[p.id] = activity;
          const allowed = w.beginOptions(p, offered, decisionAt(p, offered));
          if (allowed === false) {
            delete candidate.hfActive[p.id];
            payload = { ...common, disposition: 'rejected' };
          } else payload = { ...common, disposition: 'accepted' };
        }
      } else {
        const active = candidate.hfActive[p.id];
        if (!active || active.id !== request.activityId)
          throw new Error('Missing accepted physical activity');
        const actual = w.resolve(p, active, request.stage === 'interrupt' ? 'interrupted' : 'ended');
        const continuation = candidate.members.find((m) => m.id === p.id)?.pending;
        if (request.stage === 'interrupt' && continuation) {
          const suggestion = continuation.s;
          enqueue(candidate, 'suggestion.received', {
            person: p.id,
            received: {
              kind: 'ordinary',
              suggestion: {
                ...suggestion,
                since: Math.round((suggestion.since ?? candidate.minute) * MINUTE),
                adviceId: `${suggestion.voiceId}:${suggestion.since ?? candidate.minute}`,
              },
            },
          });
        }
        delete candidate.hfActive[p.id];
        if (actual.status === 'completed' && active.action === 'chat' && active.targetId) {
          const listener = candidate.people.find((q) => q.id === active.targetId);
          if (listener && w.converse(p, listener)) {
            const view = need(
              inspect(run, { perspective: { kind: 'host' }, people: [p.id], select: ['beliefs'] }),
            ).people[0];
            const beliefs =
              view?.kind === 'host' ? view.parts.find((part) => part.select === 'beliefs') : undefined;
            enqueue(candidate, 'conversation.requested', {
              speaker: p.id,
              listener: listener.id,
              topicIds: beliefs?.select === 'beliefs' ? beliefs.value.map((b) => b.prop) : [],
              maxClaims: 2,
              temptations: [],
              loyalWarning: false,
            });
          }
        }
        if (request.stage === 'finish' && actual.status === 'interrupted') actual.status = 'failed';
        const needs = actual.needs ?? {};
        const physiological = new Set(['food', 'water', 'sleep', 'rest', 'relief']);
        payload = {
          ...common,
          disposition: actual.status,
          outcome: {
            activityId: active.id,
            offerId: active.affordanceId,
            actionId: active.action,
            target: active.targetId ? worldEntity(candidate, active.targetId) : undefined,
            start: Math.round(active.startedAt * MINUTE),
            end: request.boundaryAt,
            status: actual.status,
            evidenceId: `outcome:${request.id}`,
            summary: actual.summary,
            quality: actual.quality,
            actual: {
              psychological: Object.fromEntries(Object.entries(needs).filter(([k]) => !physiological.has(k))),
              consumed: {
                ...(needs.food ? { food: needs.food } : {}),
                ...(needs.water ? { water: needs.water } : {}),
              },
              exposures: (actual.exposures ?? []).map((e, i) => ({
                agent: e.kind,
                amount: e.amount ?? 1,
                exposureId: `exposure:${request.id}:${i}`,
              })),
              observedProgress: [],
              injury: actual.injury as never,
              illness: actual.illness as never,
              material: actual.material,
              voidedBladder: actual.voidedBladder,
            },
            fulfills: actual.fulfills ?? active.affordance.fulfills ?? [],
            advances: actual.advances ?? active.affordance.advances ?? [],
          },
          observations: (actual.percepts ?? []).length
            ? [
                {
                  person: p.id,
                  percepts: actual.percepts!.map((pc, i) =>
                    perceptFor(pc, `outcome-percept:${request.id}:${i}`, candidate),
                  ),
                },
              ]
            : [],
        };
      }
      if (payload.disposition !== 'rejected')
        payload.worldChange = {
          expectedRevision: revision,
          revision: revision + 1,
          put: [],
          remove: [],
          hostState: { active: Object.keys(candidate.hfActive).sort() },
        };
      receipts.push({
        id: `receipt:${request.id}`,
        at: request.boundaryAt,
        source: { type: 'host', id: 'rope' },
        kind: 'action.resolved',
        payload,
      });
    }
    const due = candidate.hfQueue.filter((i) => i.at <= target);
    candidate.hfQueue = candidate.hfQueue.filter((i) => i.at > target);
    result = need(step(run, JSON.parse(JSON.stringify({ until: target, inputs: [...receipts, ...due] }))));
    for (const receipt of receipts) {
      if (receipt.kind !== 'action.resolved') continue;
      const settled = result.events.find(
        (e) => e.data.kind === 'action-settled' && e.data.requestId === receipt.payload.requestId,
      );
      if (
        !settled ||
        settled.data.kind !== 'action-settled' ||
        settled.data.disposition !== receipt.payload.disposition
      )
        throw new Error('HF did not accept the staged action receipt');
    }
    runtime.revision += receipts.filter((r) => r.kind === 'action.resolved' && r.payload.worldChange).length;
    const oldMinute = s.minute;
    Object.assign(s, candidate);
    s.minute = oldMinute;
  }
  throw new Error('Rope request boundary budget exhausted');
}
