/**
 * The browser game: clock and tactical slowdown, the thumb sheet, speech bubbles, margin notes, and the notebook
 * pages (title, journal, debrief, season). All play goes through `queueInput` + `step`, so the save is the start
 * state and the input log, and the export replays exactly.
 */

import { inspect, type RunArchive, replay as replayHF, restoreRun } from '@adam0white/human-framework';
import {
  canonicalPersona,
  FEEDBACK_LABELS,
  personaChannel,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import {
  feedbackPersonaControl,
  feedbackSharePlay,
  telemetryNotice,
  telemetryToggle,
} from '@adam0white/lab-kit';
import { campFacts, campFallback } from '../sim/camp.ts';
import {
  advanceFrame,
  approachEstimate,
  type ClimbState,
  canHear,
  clock,
  dayAccount,
  distance,
  drainAdvance,
  FACTS,
  type Force,
  forkOf,
  type Line,
  MOUNTAINS,
  memberState,
  type NewInput,
  personOf,
  posXY,
  queueInput,
  replay,
  snapshot,
  step,
} from '../sim/climb.ts';
import { ALTERNATIVE_CAPTION, type Branch, outcomeWords } from '../sim/debrief.ts';
import { DISCOVERIES } from '../sim/discoveries.ts';
import { ENGINE_VERSION, FRAMEWORK_VERSION } from '../sim/hf4.ts';
import { coldAt, legsUp, routeName, SEASON } from '../sim/mountain.ts';
import { MEMBERS, memberOf } from '../sim/party.ts';
import { checkChapter, portableOf } from '../sim/passport.ts';
import {
  exportClimb,
  nextClimb,
  nextClimbFrames,
  replayExport,
  type SeasonState,
  validateSeasonStart,
} from '../sim/season.ts';
import { haltReason, hurtCall, namesOf, promiseDue } from './calls.ts';
import { Continuity, fileEntry, type Ownership } from './continuity.ts';
import { type Disclosure, has, markSeen, type Note, newDisclosure, nextNote } from './disclosure.ts';
import { DisplaySession } from './display.ts';
import { fieldNotice } from './field.ts';
import { icon } from './icons.ts';
import { lab } from './lab.ts';
import { climbMilestones, climbScreen } from './labnames.ts';
import { moodWord } from './look.ts';
import { PACE } from './pace.ts';
import { displayText } from './plain-english.ts';
import { attentionNeeded, eventStamp, playbackRate, skipEventStamp } from './playback.ts';
import { Scene } from './scene.ts';
import { RopeStage } from './stage.ts';
import * as nativeStore from './store.ts';

const SAVE_KEY = 'rope.save.cast.v1';
const SLOW_MS = PACE.slowMs;
const BUBBLE_MS = 7500;

interface Save {
  v: 2;
  state: string;
  season: SeasonState;
  start: string;
  inputs: ClimbState['inputs'];
  minute: number;
  disclosure: Disclosure;
  over: boolean;
  engine?: string;
  ownership?: Ownership;
}

type Panel =
  | 'main'
  | 'more'
  | 'calls'
  | 'force'
  | 'partner'
  | 'tell'
  | 'promise'
  | 'route'
  | 'scout'
  | 'leader-more'
  | 'answers';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const esc = (t: string): string =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const bold = (t: string): string => esc(displayText(t)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export class Game {
  private static owners = new WeakMap<HTMLElement, Game>();
  private static finalSaves = new WeakMap<HTMLElement, Promise<void>>();
  private savedText: string | null;

  private current(): boolean {
    return !this.disposed && Game.owners.get(this.root) === this;
  }
  private readonly entry = fileEntry(location.pathname);
  private continuity = new Continuity(lab!, this.entry === 'native' ? personaChannel() : null);
  private originalFile: { text: string; sha256: string; ownership?: Ownership } | null = null;
  private fileGeneration = 0;
  private recordingGeneration = 0;
  private recordingBlocked = false;
  private starting = false;
  private startupError = '';
  private unsupportedSave = false;
  private root: HTMLElement;
  private noticeFooter = h('footer', 'recording-footer');
  private saveNotice = h('p', 'caption');
  private scene = new Scene();
  private stage: RopeStage | null = null;
  private disposed = false;
  private booted = false;
  private lifetime = new AbortController();
  private footerObserver: ResizeObserver | null = null;
  private untrack: (() => void) | undefined;
  private unwatch: (() => void) | undefined;
  private frameId = 0;
  private top = h('div', 'top');
  private whereEl = h('div', 'where');
  private speed: 'auto' | 'slow' | 'normal' | 'fast' = 'auto';
  private dayStrip = h('div', 'day-strip');
  private dayBar = h('div', 'day-bar');
  private leaderBar = h('div', 'leader-bar');
  private skipButton = h('button', 'skip-button', 'Skip ⏩');
  private skipStarted = 0;
  private infoEl: HTMLElement | null = null;
  private pageKind = 'title';
  private answersInput = -1;
  private paceEl = h('div', 'clock-rate');
  private sceneEl = h('div', 'scene');
  private display = new DisplaySession();
  private bubblesEl = h('div', 'bubbles');
  private noteEl = h('div', 'note');
  private movementEl = h('div', 'movement-status');
  private stampEl = h('div', 'stamp');
  private sheet = h('div', 'sheet');
  private season!: SeasonState;
  private climb!: ClimbState;
  private start = '';
  private disc: Disclosure = newDisclosure();
  private slowUntil = 0;
  private stampUntil = 0;
  private noteUntil = 0;
  private storyUntil = 0;
  private endAt = 0;
  /** Walking the rest of the day quickly: on only while nothing is left to decide (`onlyWalkingLeft`). */
  private skipping = false;
  private acc = 0;
  private fileFrame: ClimbState | null = null;
  private last = performance.now();
  private target = 'all';
  private verb: string | null = null;
  private partner: string | null = null;
  private panel: Panel = 'main';
  private shownLines = 0;
  private shownJournal = 0;
  private bubbles = new Map<string, { el: HTMLElement; until: number; minute: number }>();
  private note: Note | null = null;
  private playing = false;
  private uiTick = 0;
  private lastSave = 0;
  private menuEl: HTMLElement | null = null;
  private reckoningFacts: ReturnType<typeof factsOf>[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.savedText = null;
    if (this.entry !== 'native') return;
    try {
      this.savedText = localStorage.getItem(SAVE_KEY);
    } catch {
      this.savedText = null;
    }
  }

  async boot(): Promise<void> {
    if (this.booted || this.disposed) return;
    const predecessor = Game.owners.get(this.root);
    if (predecessor && this.entry !== 'native' && predecessor.entry === 'native')
      throw new Error('Close the active native game before opening file mode.');
    if (predecessor && predecessor.entry === 'native') {
      predecessor.save();
      await predecessor.flushSave();
    }
    predecessor?.destroy();
    await Game.finalSaves.get(this.root);
    Game.owners.set(this.root, this);
    this.booted = true;
    if (this.entry === 'native') this.savedText = await nativeStore.load();
    await document.fonts?.ready;
    if (!this.current()) return;
    const info = h('button', 'top-info', 'i');
    info.setAttribute('aria-label', 'About this part of the climb');
    info.onclick = () => this.openInfo();
    const menu = h('button', 'menu-trigger', '<span>Menu</span> ≡');
    menu.setAttribute('aria-label', 'Game menu');
    menu.onclick = () => this.gameMenu();
    const journal = h('button', 'journal-trigger', 'Journal');
    journal.onclick = () => this.journalPage();
    this.top.append(this.whereEl, journal, info, menu);
    this.dayStrip.append(this.dayBar, this.paceEl);
    this.skipButton.hidden = true;
    this.skipButton.setAttribute('aria-label', 'Skip to the next event');
    this.skipButton.onclick = () => {
      if (
        !this.climb ||
        attentionNeeded(this.climb) ||
        this.panel !== 'main' ||
        performance.now() < this.slowUntil
      )
        return;
      this.skipping = true;
      this.skipStarted = this.climb.minute;
      this.acc = 0;
      this.renderTop();
      this.renderSheet();
    };
    this.sceneEl.append(this.bubblesEl, this.stampEl, this.noteEl, this.movementEl, this.skipButton);
    const stopSkip = () => {
      if (this.skipping) {
        this.skipping = false;
        this.acc = 0;
        this.renderTop();
      }
    };
    this.sceneEl.addEventListener('pointerdown', stopSkip);
    this.sheet.addEventListener('pointerdown', stopSkip);
    this.root.append(this.top, this.dayStrip, this.sceneEl, this.sheet, this.leaderBar, this.noticeFooter);
    const notice = telemetryNotice(undefined, this.entry === 'file' ? { preservation: 'preserve' } : {});
    if (notice) this.noticeFooter.append(notice);
    if (this.entry === 'native') {
      this.saveNotice.setAttribute('role', 'status');
      this.noticeFooter.append(this.saveNotice);
    }
    this.footerObserver = new ResizeObserver(() => {
      this.root.style.setProperty('--footer-height', `${this.noticeFooter.getBoundingClientRect().height}px`);
    });
    this.footerObserver.observe(this.noticeFooter);
    await this.scene.mount(this.sceneEl);
    if (!this.current()) {
      this.scene.destroy();
      return;
    }
    this.scene.onTap = (id) => {
      if (id === 'leader') return;
      this.pickTarget(id);
    };
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.save();
      },
      { signal: this.lifetime.signal },
    );
    window.addEventListener(
      'pagehide',
      () => {
        this.fileGeneration++;
        this.save();
        // The active SDK owns its asynchronous final snapshot. Do not dispose it here.
      },
      { signal: this.lifetime.signal },
    );
    this.frameId = requestAnimationFrame(() => this.frame());
    if (this.entry === 'native') this.trackRun();
    if (this.entry === 'native')
      this.unwatch = watchPersonaCheckpoint(() => {
        if (this.climb?.over) void this.checkpointBoundary();
      });
    window.addEventListener(
      'storage',
      (event) => {
        if (event.key === null) this.continuity.invalidate();
      },
      { signal: this.lifetime.signal },
    );
    this.titlePage();
  }

  private recordingAllowed(): boolean {
    if (this.entry === 'native') return true;
    if (this.entry !== 'file' || this.recordingBlocked) return false;
    if (lab!.preservationStatus === 'existing-local') return true;
    this.recordingBlocked = true;
    lab!.dispose();
    return false;
  }

  private trackRun(): void {
    this.untrack?.();
    const generation = ++this.recordingGeneration;
    if (!this.current() || !this.recordingAllowed()) return;
    const current = () =>
      this.current() && generation === this.recordingGeneration && this.recordingAllowed();
    this.untrack = lab!.trackRun(
      () => {
        if (!current() || !this.climb || !this.season) return null;
        const saved = this.load();
        if (saved?.season.seed === this.season.seed && saved.season.climbNo === this.season.climbNo)
          lab!.captureSave(this.recordingSave(saved));
        return structuredClone(this.recordingExport());
      },
      {
        runKey: () => (this.climb ? `${this.climb.seed}:${this.climb.climbNo}` : 'title'),
        getLogs: () =>
          current() && this.climb
            ? [
                ...this.climb.journal.slice(-20).map((line) => line.text),
                ...this.climb.lines.slice(-20).map((line) => `${line.who}: ${line.says}`),
              ]
            : [],
      },
    );
  }

  private syncStage(): void {
    if (!this.current() || (this.pageOpen() && this.pageKind === 'title')) {
      this.stage?.destroy();
      this.stage = null;
      return;
    }
    this.stage ??= new RopeStage(this.root, (width, height) => this.scene.resize(width, height));
    this.stage.show(this.pageOpen() ? this.pageKind : this.panel, this.pageOpen() ? 'full' : 'fit');
  }

  destroy(): void {
    if (this.disposed) return;
    this.saveFinal();
    this.disposed = true;
    this.recordingGeneration++;
    this.fileGeneration++;
    this.continuity.generation++;
    this.lifetime.abort();
    this.footerObserver?.disconnect();
    this.untrack?.();
    this.unwatch?.();
    cancelAnimationFrame(this.frameId);
    this.stage?.destroy();
    this.stage = null;
    this.debriefWorker?.terminate();
    this.scene.destroy();
    this.display.destroy();
    for (const node of [
      this.top,
      this.dayStrip,
      this.sceneEl,
      this.sheet,
      this.leaderBar,
      this.noticeFooter,
      this.pageEl,
      this.menuEl,
      this.infoEl,
    ])
      node?.remove();
    if (Game.owners.get(this.root) === this) {
      Game.owners.delete(this.root);
      delete this.root.dataset.screen;
      this.root.style.removeProperty('--footer-height');
    }
  }

  // ------------------------------------------------------------ season and saves

  private load(): Save | null {
    if (this.entry !== 'native') return null;
    try {
      const raw = this.savedText;
      const saved = raw ? (JSON.parse(raw) as Save) : null;
      if (!saved) return null;
      if (saved.v !== 2 || saved.engine !== ENGINE_VERSION || typeof saved.state !== 'string') {
        this.unsupportedSave = true;
        this.startupError =
          'This saved season uses an unsupported edition. Its history has not been replaced. Keep any old file and start a fresh season here.';
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  }

  private saving = false;
  private saveTask: Promise<void> | null = null;
  private saveAgain = false;
  private finalSaveTask: Promise<void> | null = null;

  private async flushSave(): Promise<void> {
    while (this.saveTask) await this.saveTask;
    await this.finalSaveTask;
  }

  private save(): void {
    if (!this.current() || !this.climb || !this.season || this.transitioning) return;
    if (this.entry !== 'native') {
      if (this.originalFile && this.recordingAllowed()) lab!.captureSave(this.fileSession());
      return;
    }
    if (this.saveTask) {
      this.saveAgain = true;
      return;
    }
    const climb = this.climb,
      generation = this.continuity.generation;
    const current = () => this.current() && this.climb === climb && generation === this.continuity.generation;
    this.saving = true;
    this.sheet.inert = true;
    this.leaderBar.inert = true;
    this.sheet.setAttribute('aria-busy', 'true');
    if (this.pageEl) this.pageEl.inert = true;
    this.paceEl.textContent = 'Saving. Time is paused.';
    // Yield before materializing the full exact HF archive while time is paused.
    this.saveTask = (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!current()) return;
      const text = this.nativeSaveText();
      if (!(await nativeStore.save(text, this.savedText, current))) {
        if (current())
          this.saveNotice.textContent =
            'This progress was not saved. Storage is unavailable or another tab owns the saved season. Download this run before closing.';
        return;
      }
      this.savedText = text;
      if (current()) this.saveNotice.textContent = '';
      if (current()) lab!.captureSave(this.recordingSave(JSON.parse(text)));
    })()
      .catch((error) => {
        if (current())
          this.saveNotice.textContent = `This progress was not saved. Download before closing. ${String(error)}`;
      })
      .finally(() => {
        this.saving = false;
        this.sheet.inert = false;
        this.leaderBar.inert = false;
        this.sheet.removeAttribute('aria-busy');
        if (this.pageEl) this.pageEl.inert = false;
        this.saveTask = null;
        if (this.current() && this.climb) this.renderTop();
        if (this.saveAgain) {
          this.saveAgain = false;
          this.save();
        }
      });
  }

  private nativeSaveText(): string {
    const climb = this.climb;
    const s: Save = {
      v: 2,
      state: snapshot(climb),
      engine: ENGINE_VERSION,
      ownership: this.continuity.ownership(),
      season: this.season,
      start: this.start === this.season.start ? '' : this.start,
      inputs: climb.inputs,
      minute: climb.minute,
      disclosure: this.disc,
      over: climb.over,
    };
    return JSON.stringify(s);
  }

  private saveFinal(): void {
    if (this.entry !== 'native' || !this.climb || !this.season) {
      this.save();
      return;
    }
    // Capture the last accepted state before synchronous teardown invalidates
    // callbacks. Queue its exact CAS after any preceding save has settled.
    const text = this.nativeSaveText(),
      prior = this.saveTask;
    const task = (async () => {
      await prior;
      const current = () => {
        const owner = Game.owners.get(this.root);
        return owner === undefined || owner === this;
      };
      if (await nativeStore.save(text, this.savedText, current)) this.savedText = text;
    })().finally(() => {
      if (Game.finalSaves.get(this.root) === task) Game.finalSaves.delete(this.root);
    });
    this.finalSaveTask = task;
    Game.finalSaves.set(this.root, task);
  }

  private async newGame(): Promise<void> {
    if (this.entry !== 'native' || !this.current() || this.starting) return;
    this.starting = true;
    try {
      await this.flushSave();
      if (!this.current()) return;
      const seed = (Date.now() % 1_000_000_007) | 0;
      const { season, climb } = await this.continuity.fresh(seed);
      if (!this.current()) return;
      this.startupError = '';
      this.unsupportedSave = false;
      this.season = season;
      this.disc = newDisclosure();
      this.begin(climb, season.start ?? snapshot(climb));
      await this.continuity.recording();
    } catch (error) {
      if (!this.current()) return;
      console.error('Season start failed', error);
      this.startupError = String(error);
      this.openPage(
        `<div class="page-body"><h1>The season has not begun</h1><p>The game could not start this season. Your saved season has not been replaced.</p><p>${esc(String(error))}</p><p>Try again, or send Feedback if this keeps happening.</p></div><div class="page-actions"><button class="btn" data-retry>Try again</button><button class="btn" data-back>Back</button><button class="btn" data-word>Feedback</button></div>`,
        (el) => {
          el.querySelector('[data-retry]')?.addEventListener('click', () => void this.newGame());
          el.querySelector('[data-back]')?.addEventListener('click', () => this.titlePage());
          el.querySelector('[data-word]')?.addEventListener('click', () => this.feedbackPage());
        },
        'title',
      );
    } finally {
      this.starting = false;
    }
  }

  private async resume(sv: Save): Promise<void> {
    if (this.entry !== 'native') return;
    if (!this.current()) return;
    try {
      if (sv.v !== 2 || sv.engine !== ENGINE_VERSION || typeof sv.state !== 'string')
        throw new Error('This save uses an unsupported edition. Keep the file and start a fresh season.');
      if (sv.season.chapter) checkChapter(sv.season.chapter);
      const start = sv.start || sv.season.start || '';
      validateSeasonStart(sv.season.seed, sv.season.chapter, sv.season.past ?? [], start);
      const retained = validatedCurrent(sv.state);
      const c = replay(start, sv.inputs, sv.minute, undefined, retained.hfPhase);
      if (snapshot(c) !== sv.state)
        throw new Error('This saved season does not replay exactly. Keep it and start fresh.');
      await this.continuity.restoreOwnership({ season: sv.season, climb: c }, sv.ownership);
      if (!this.current()) return;
      this.season = sv.season;
      this.disc = sv.disclosure;
      this.begin(c, start, true);
      await this.continuity.recording();
      if (!this.current()) return;
      lab!.screen(climbScreen(c, 'climb'));
      if (c.over || sv.over) this.endClimb();
    } catch (error) {
      if (!this.current()) return;
      console.error('Resume failed', error);
      this.openPage(
        '<div class="page-body"><h1>The game could not resume</h1><p>Your saved season has not been replaced. Return and try again, or send Feedback.</p><button class="btn" data-back>Back</button><button class="btn" data-feedback>Feedback</button></div>',
        (el) => {
          el.querySelector('[data-back]')?.addEventListener('click', () => this.titlePage());
          el.querySelector('[data-feedback]')?.addEventListener('click', () => this.feedbackPage());
        },
        'title',
      );
    }
  }

  private begin(c: ClimbState, start: string, resumed = false): void {
    if (!this.current()) return;
    this.branch = undefined;
    this.climb = c;
    this.fileFrame = null;
    this.start = start;
    this.continuity.attach({ season: this.season, climb: c });
    this.shownLines = resumed ? c.lines.length : 0;
    this.shownJournal = resumed ? c.journal.length : 0;
    this.target = 'all';
    this.sentAt = -Infinity;
    this.verb = null;
    this.panel = 'main';
    this.note = null;
    this.acc = 0;
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
    // A new climb starts with fresh presentation deadlines.
    if (!resumed) this.speed = 'auto';
    this.slowUntil = 0;
    this.stampUntil = 0;
    this.noteUntil = 0;
    this.storyUntil = 0;
    this.endAt = 0;
    this.stampEl.classList.remove('on');
    this.stampEl.textContent = '';
    this.slow();
    this.skipping = false;
    this.ending = false;
    this.closePage();
    this.playing = true;
    if (!resumed) this.climbIntro();
    this.renderAll();
    this.save();
  }

  // ------------------------------------------------------------ the loop

  private frame(): void {
    if (!this.current()) return;
    if (!this.root.isConnected) {
      this.destroy();
      return;
    }
    const now = performance.now();
    const elapsed = Math.max(0, now - this.last);
    const dt = Math.min(0.1, elapsed / 1000);
    const held =
      this.saving ||
      this.transitioning ||
      this.pageOpen() ||
      !!this.menuEl ||
      !!this.infoEl ||
      !!document.querySelector(':popover-open') ||
      document.hidden;
    if (held) {
      for (const key of ['slowUntil', 'stampUntil', 'noteUntil', 'storyUntil', 'endAt'] as const)
        if (this[key] > this.last) this[key] += elapsed;
      for (const bubble of this.bubbles.values()) if (bubble.until > this.last) bubble.until += elapsed;
    }
    this.last = now;
    if (!held) {
      if (this.stampUntil && now >= this.stampUntil) {
        this.stampEl.classList.remove('on');
        this.stampUntil = 0;
      }
      if (this.noteUntil && now >= this.noteUntil) {
        this.noteUntil = 0;
        this.dismissNote();
      }
      if (this.storyUntil && now >= this.storyUntil) {
        this.storyUntil = 0;
        if (!this.note) this.noteEl.innerHTML = '';
        else this.showNote(this.note);
      }
    }
    if (this.playing && this.climb && !this.climb.over && !held) {
      if (this.skipping && (attentionNeeded(this.climb) || this.climb.minute - this.skipStarted >= 120))
        this.skipping = false;
      const rate = playbackRate(
        this.panel !== 'main' || this.verb !== null,
        now < this.slowUntil,
        attentionNeeded(this.climb),
        this.skipping,
        this.speed,
      );
      if (rate === 0) this.acc = 0;
      this.acc += dt * rate;
      // HF advances once per animation frame. Time slows rather than banking an
      // unbounded catch-up loop when simulation work takes longer than the chosen pace.
      if (this.acc >= 1 && !this.climb.over) {
        const wasSkipping = this.skipping;
        const before = wasSkipping ? skipEventStamp(this.climb) : eventStamp(this.climb);
        const readBefore = this.slowUntil;
        let complete: boolean;
        if (this.entry === 'file') {
          this.fileFrame ??= JSON.parse(snapshot(this.climb)) as ClimbState;
          complete = advanceFrame(this.fileFrame);
          if (complete) {
            const candidate = this.fileFrame;
            this.fileFrame = null;
            if (!this.fitsFile(candidate)) complete = false;
            else {
              this.climb = candidate;
              this.continuity.attach({ season: this.season, climb: candidate });
            }
          }
        } else complete = advanceFrame(this.climb);
        if (complete) {
          this.acc = Math.max(0, Math.min(1, this.acc - 1));
          this.afterStep();
          if (
            (wasSkipping ? skipEventStamp(this.climb) : eventStamp(this.climb)) !== before ||
            this.slowUntil > readBefore ||
            (this.skipping && (attentionNeeded(this.climb) || this.climb.minute - this.skipStarted >= 120))
          ) {
            this.skipping = false;
            this.acc = 0;
            this.slow();
          }
        }
      }
    } else this.acc = 0;
    if (this.playing && this.climb?.over) this.endClimb();
    if (!held && this.endAt && now >= this.endAt) this.debriefPage();
    if (this.climb) {
      this.scene.selected = this.target === 'all' ? null : this.target;
      this.scene.draw(this.climb, dt);
      this.placeBubbles(now);
      if (!this.saving && now - this.uiTick > 300) {
        this.uiTick = now;
        this.renderTop();
        this.quietHint();
        this.renderSheet(true);
      }
      if (
        !this.transitioning &&
        !this.releaseBoundary &&
        !this.climb.hfPhase &&
        !this.fileFrame &&
        now - this.lastSave > 30000
      ) {
        this.lastSave = now;
        this.save();
      }
    }
    this.frameId = requestAnimationFrame(() => this.frame());
  }

  private finishFileFrame(): boolean {
    if (!this.fileFrame) return true;
    const candidate = this.fileFrame;
    this.fileFrame = null;
    drainAdvance(candidate);
    if (!this.fitsFile(candidate)) return false;
    this.climb = candidate;
    this.continuity.attach({ season: this.season, climb: candidate });
    this.afterStep();
    return true;
  }

  private afterStep(): void {
    this.continuity.closeDeaths();
    const c = this.climb;
    for (; this.shownLines < c.lines.length; this.shownLines++) {
      const l = c.lines[this.shownLines];
      if (l && (!this.skipping || l.input >= 0)) this.showLine(l);
    }
    for (; this.shownJournal < c.journal.length; this.shownJournal++) {
      const j = c.journal[this.shownJournal];
      if (!j) continue;
      if (/fell|slipped|turned for home|would not|put you off|summit\.|stood on the summit/.test(j.text))
        this.slow();
      if (j.text.includes('stood on the summit') && j.who)
        this.stamp(`Summit · ${memberOf(j.who).name} · ${clock(j.at)}`);
      if (j.story && !this.skipping) this.showStory(j.text);
      // Key events far off still reach you as a margin note: you see it happen, but you cannot speak to them.
      else if (j.who && !canHear(c, j.who) && /fell|slipped|untied|stood on the summit/.test(j.text))
        this.showStory(`Far off: ${j.text}`);
    }
    // The promised hour arriving is a moment to be present for: slow down, and leave fast speed.
    const pr = c.promise;
    if (pr && pr.status === 'open' && c.minute === c.day * 1440 + pr.hour * 60) {
      this.slow();
    }
    const objected =
      !has(this.disc, 'insist') &&
      c.lines.some((l) => ['refused', 'deferred', 'modified'].includes(l.verdict));
    if (!this.note || this.disc.seen.includes(this.note.id) || objected) {
      const n = nextNote(this.disc, c);
      if (n && n.id !== this.note?.id) this.showNote(n);
    }
  }

  private slow(ms: number = SLOW_MS): void {
    this.slowUntil = Math.max(this.slowUntil, performance.now() + ms);
  }

  private stamp(text: string): void {
    this.stampEl.textContent = displayText(text);
    this.stampEl.classList.add('on');
    this.stampUntil = performance.now() + 4200;
  }

  // ------------------------------------------------------------ input

  /** Taps right after a send are dropped: the sheet rebuilds under the finger, and a second tap would land elsewhere. */
  private sentAt = -Infinity;

  private send(inp: NewInput, also?: NewInput): void {
    if (!this.current() || this.saving || this.transitioning) return;
    if (this.entry === 'file' && !this.finishFileFrame()) return;
    const c = this.entry === 'file' ? (JSON.parse(snapshot(this.climb)) as ClimbState) : this.climb;
    if (!c) return;
    if (performance.now() - this.sentAt < 450) return;
    // Nothing stays focused after a send, so no key press can repeat the order.
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.sentAt = performance.now();
    // Words to people replace what they last said: an old yes never hangs on after a new order.
    for (const x of [inp, also])
      if (x?.t === 'say')
        for (const id of x.to === 'all' ? c.members.map((m) => m.id) : [x.to, ...(x.with ? [x.with] : [])])
          this.hideBubble(id);
    queueInput(c, inp);
    if (also) queueInput(c, also);
    // The word is spoken now: step the minute it applies in, so the answer comes at once.
    step(c);
    if (this.entry === 'file') {
      if (!this.fitsFile(c)) return;
      this.climb = c;
      this.continuity.attach({ season: this.season, climb: c });
    }
    this.afterStep();
    this.saySelf(also ?? inp);
    this.skipping = false;
    this.acc = 0;
    this.slow();
    if (this.note?.lit) {
      const lit = this.note.lit;
      const matched =
        (lit === 'lead' && inp.t === 'lead') ||
        (lit === 'climb' && inp.t === 'say') ||
        (lit === 'tell' && inp.t === 'tell') ||
        (lit === 'promise' && inp.t === 'promise') ||
        (lit === 'rope' && inp.t === 'say' && inp.act === 'rope') ||
        (lit === 'fix' && inp.t === 'fix') ||
        (lit === 'with' && inp.t === 'lead' && inp.dir === 'with');
      if (matched) this.dismissNote();
    }
    this.verb = null;
    this.partner = null;
    this.panel = 'main';
    this.renderSheet();
    this.save();
    if (c.over) this.endClimb();
  }

  private saySelf(inp: NewInput): void {
    let words = '';
    if (inp.t === 'say') {
      const who =
        inp.to === 'all'
          ? 'Everyone'
          : inp.act === 'gather' && inp.with
            ? `${memberOf(inp.to).name} and ${memberOf(inp.with).name}`
            : memberOf(inp.to).name;
      const what: Record<string, string> = {
        climb: 'keep climbing',
        descend: 'turn back',
        rest: 'take a rest',
        eat: 'eat something',
        wait: 'wait here',
        rope: `tie a rope between yourself and ${inp.with ? memberOf(inp.with).name : ''}`,
        pack: 'give me your pack',
        ahead: 'go on ahead and call down what you see',
        'scout-route': 'cross the next leg and report what you find when we can hear you',
        drink: 'drink',
        relieve: 'step aside',
        'escort-reach': `meet ${inp.with ? memberOf(inp.with).name : 'them'}, then consider going down together`,
        escort: `go down with ${inp.with ? memberOf(inp.with).name : 'them'}`,
        gather: 'come together and wait for each other',
      };
      const tone = inp.force === 'ask' ? '?' : inp.force === 'urge' ? '.' : '. Do it now.';
      words =
        inp.force === 'ask'
          ? `${who}, will you ${what[inp.act] ?? inp.act}?`
          : `${who}, ${what[inp.act] ?? inp.act}${tone}`;
    } else if (inp.t === 'tell') words = FACTS[inp.fact].words.replace(/^./, (x) => x.toUpperCase());
    else if (inp.t === 'promise') words = `We turn back at ${inp.hour}:00, wherever we are.`;
    else if (inp.t === 'share') words = 'Here, have some of my food.';
    else if (inp.t === 'fix') words = 'Wait. I will secure a rope to the route.';
    else if (inp.t === 'scout') words = 'Wait here. I’ll go and look.';
    if (words) this.bubble('leader', words, 'mine');
    if (this.climb.unheard.includes(this.climb.inputs.length - 1))
      this.bubble('leader', `${words} … Nobody is close enough to hear you.`, 'mine');
  }

  private pickTarget(id: string): void {
    if (this.panel === 'partner') {
      if (id !== this.target && id !== 'all') {
        // Pick A, pick B, then how hard: ask, urge or insist, as for any other word.
        this.partner = id;
        this.verb = 'rope';
        this.panel = 'force';
        this.renderSheet();
      }
      return;
    }
    this.target = this.target === id && this.verb !== 'rope' ? 'all' : id;
    this.renderSheet();
  }

  // ------------------------------------------------------------ bubbles and notes

  private showLine(l: Line): void {
    if (!l.says) return;
    const cls =
      l.verdict === 'assented'
        ? 'yes'
        : l.verdict === 'complied'
          ? 'grudging'
          : l.verdict === 'heard'
            ? ''
            : 'no';
    // Only the actual recorded HF words are spoken. Private voice trust does not
    // establish an observed gesture or a motive for turning away.
    this.bubble(l.who, l.says, cls);
    this.slow();
  }

  /** A quiet stretch says so in the margin, with the way to walk it faster. Never over a real note or story. */
  private hinting = false;
  private hintText = '';
  private quietHint(): void {
    const c = this.climb;
    if (this.note || (!this.hinting && this.noteEl.innerHTML !== '')) return;
    const lastLine = c.lines[c.lines.length - 1]?.at ?? c.startMinute;
    const lastJournal = c.journal[c.journal.length - 1]?.at ?? c.startMinute;
    const halt = haltReason(c);
    const quiet = c.minute - Math.max(lastLine, lastJournal) >= 20 && !c.over;
    const text =
      halt ?? (quiet ? 'Nothing new has happened. Walking continues quickly until something happens.' : null);
    if (text && (!this.hinting || this.hintText !== text)) {
      this.noteEl.innerHTML = `<span class="quiet">${text}</span>`;
      this.hinting = true;
      this.hintText = text;
    } else if (!text && this.hinting) {
      this.noteEl.innerHTML = '';
      this.hinting = false;
    }
  }

  private hideBubble(who: string): void {
    const b = this.bubbles.get(who);
    if (!b) return;
    b.until = 0;
    b.el.classList.remove('on');
  }

  private bubble(who: string, text: string, cls: string): void {
    let b = this.bubbles.get(who);
    if (!b) {
      b = { el: h('div', 'bubble'), until: 0, minute: 0 };
      this.bubblesEl.append(b.el);
      this.bubbles.set(who, b);
    }
    const name = who === 'leader' ? 'you' : memberOf(who).name;
    b.el.className = `bubble ${cls}`;
    b.el.innerHTML = `<span class="who">${esc(name)}</span>${esc(displayText(text))}`;
    b.el.style.color = '';
    b.until = performance.now() + BUBBLE_MS;
    b.minute = this.climb.minute;
    requestAnimationFrame(() => b?.el.classList.add('on'));
  }

  private placeBubbles(now: number): void {
    // Lay bubbles out without overlap: above the speaker if there is room, else below the ground line.
    const W = this.sceneEl.clientWidth;
    const H = this.sceneEl.clientHeight;
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const hits = (l: number, r: number, t: number, bt: number) =>
      placed.find((q) => l < q.r + 4 && r > q.l - 4 && t < q.b + 3 && bt > q.t - 3);
    const live = [...this.bubbles].filter(([who, b]) => {
      // A bubble lasts a few seconds and at most 20 minutes of the day, so fast time never leaves words hanging.
      const on = this.scene.at.has(who) && now <= b.until && this.climb.minute - b.minute <= 20;
      if (!on) b.el.classList.remove('on');
      return on;
    });
    live.sort((x, y) => (this.scene.at.get(x[0])?.x ?? 0) - (this.scene.at.get(y[0])?.x ?? 0));
    for (const [who, b] of live) {
      const at = this.scene.at.get(who);
      if (!at) continue;
      const bw = b.el.offsetWidth;
      const bh = b.el.offsetHeight;
      const cx = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, at.x));
      const l = cx - bw / 2;
      const r = cx + bw / 2;
      let bottom = at.y - 26;
      for (let q = hits(l, r, bottom - bh, bottom); q; q = hits(l, r, bottom - bh, bottom)) bottom = q.t - 3;
      if (bottom - bh < 4) {
        let top = at.y + 34;
        for (let q = hits(l, r, top, top + bh); q; q = hits(l, r, top, top + bh)) top = q.b + 3;
        bottom = top + bh;
      }
      // A crowded mountain cannot hold every speech bubble. Keep the recorded
      // answers below the controls instead of clamping bubbles onto each other.
      if (bottom > H - 4 || bottom - bh < 4 || hits(l, r, bottom - bh, bottom)) {
        b.el.classList.remove('on');
        continue;
      }
      b.el.classList.add('on');
      placed.push({ l, r, t: bottom - bh, b: bottom });
      b.el.style.left = `${cx}px`;
      b.el.style.top = `${bottom}px`;
    }
  }

  private showNote(n: Note): void {
    this.note = n;
    this.hinting = false;
    this.noteEl.innerHTML = `<button aria-label="Dismiss this note">×</button><span class="note-copy">${bold(n.text)}</span>`;
    const btn = this.noteEl.querySelector('button');
    if (btn) btn.onclick = () => this.dismissNote();
    if (n.unlock) markSeen(this.disc, { ...n, id: `${n.id}:unlock` });
    if (n.unlock && !this.disc.unlocked.includes(n.unlock)) this.disc.unlocked.push(n.unlock);
    this.slow(PACE.noteSlowMs);
    this.renderSheet();
    this.noteUntil = n.lit ? 0 : performance.now() + 16000;
  }

  private dismissNote(): void {
    if (this.note) markSeen(this.disc, this.note);
    this.note = null;
    this.noteUntil = 0;
    this.noteEl.innerHTML = '';
    this.renderSheet();
  }

  private showStory(text: string): void {
    this.hinting = false;
    this.noteEl.innerHTML = `<span class="hand">${esc(displayText(text))}</span>`;
    this.slow(PACE.noteSlowMs);
    this.storyUntil = performance.now() + 9000;
  }

  // ------------------------------------------------------------ rendering

  private renderAll(): void {
    this.renderTop();
    this.renderSheet();
    this.noteEl.innerHTML = '';
  }

  private renderTop(): void {
    const c = this.climb;
    if (!c) return;
    const m = MOUNTAINS[c.mountain];
    if (!this.pageOpen()) this.root.dataset.screen = 'climb';
    const phase = this.pageOpen() ? this.pageKind : 'climb';
    this.whereEl.innerHTML =
      phase === 'title'
        ? '<a href="https://human.adamwhite.work/games/">All games</a>'
        : esc(
            `${m?.name ?? ''} · ${phase === 'debrief' ? 'today’s results' : phase === 'season' ? 'the season' : clock(c.minute)}${phase === 'hut' ? ' · at the hut' : c.promise ? ` · turn back at ${c.promise.hour}:00` : ''}`,
          );
    const minute = c.minute % 1440;
    this.dayBar.style.setProperty('--dusk', `${(((m?.duskMinuteOfDay ?? 1170) - 240) / 1140) * 100}%`);
    this.dayBar.innerHTML = `<span class="day-dawn">04</span><span class="day-dusk"></span><span class="day-now" style="left:${Math.max(0, Math.min(100, ((minute - 240) / 1140) * 100))}%"></span>${c.promise ? `<span class="day-promise" aria-label="Turn at ${c.promise.hour}:00" style="left:${((c.promise.hour * 60 - 240) / 1140) * 100}%"></span>` : ''}`;
    this.dayBar.setAttribute(
      'aria-label',
      `Daylight, ${clock(c.minute)}${c.promise ? `, promised time to turn back, ${c.promise.hour}:00` : ''}`,
    );
    this.paceEl.textContent =
      this.infoEl || this.menuEl || this.pageOpen()
        ? 'Time has stopped'
        : this.panel !== 'main' || this.verb !== null
          ? 'Time stops while you choose'
          : this.skipping
            ? 'Skipping…'
            : performance.now() < this.slowUntil
              ? 'Time slows for reading'
              : attentionNeeded(c)
                ? 'A call needs attention'
                : '';
    this.skipButton.hidden =
      this.pageOpen() ||
      this.panel !== 'main' ||
      attentionNeeded(c) ||
      performance.now() < this.slowUntil ||
      this.skipping;
  }

  private sheetKey = '';

  /** Rebuild the sheet; `ifChanged` skips it when nothing it shows has changed, so a tap is never lost mid-rebuild. */
  private renderSheet(ifChanged = false): void {
    const c = this.climb;
    if (!c) return;
    const L = c.leader;
    this.movementEl.textContent = this.movementWords();
    const pairInput = c.inputs.findLast(
      (input) => input.t === 'say' && (input.act === 'rope' || input.act === 'gather'),
    );
    const key = JSON.stringify([
      this.panel,
      this.skipping,
      performance.now() < this.slowUntil,
      this.verb,
      this.target,
      this.partner,
      this.note?.lit,
      this.disc.unlocked,
      c.known,
      c.promise,
      c.fixed,
      L.pos.place,
      L.pos.leg,
      L.path.length,
      L.move !== null,
      L.move?.dir,
      L.follow,
      L.near,
      this.movementWords(),
      c.inputs.length,
      c.lines.length,
      L.fixing,
      L.scouting,
      L.rations,
      c.members.map((x) => [
        x.homeAt !== null,
        x.move?.dir,
        canHear(c, x.id),
        x.ropedTo,
        x.pack,
        x.rations > 0 || x.pos.place === MOUNTAINS[c.mountain]?.hut,
        distance(c, x.pos, L.pos) < 40,
      ]),
      Math.floor((c.minute % 1440) / 60),
      c.members.map((x) => (x.asks ? x.id : '')),
      c.members.map(
        (x) => x.gather && [x.gather.with, distance(c, x.pos, memberState(c, x.gather.with).pos) < 40],
      ),
      c.people.map((p) => (p.activity?.affordanceId.startsWith('gather:') ? p.activity.affordanceId : null)),
      pairInput?.t === 'say' &&
        pairInput.with &&
        distance(c, memberState(c, pairInput.to).pos, memberState(c, pairInput.with).pos) < 40,
    ]);
    if (ifChanged && key === this.sheetKey) return;
    this.sheetKey = key;
    const sh = this.sheet;
    sh.className = `sheet lk-sheet sheet-${this.panel}`;
    this.syncStage();
    const targetScroll = sh.querySelector('.targets')?.scrollLeft ?? 0;
    const previousResult = sh.querySelector<HTMLElement>('.request-result');
    const answersOpen = previousResult?.querySelector('details')?.open;
    const answerInput = previousResult?.dataset.input;
    sh.innerHTML = '';
    // Who you speak to.
    const chips = h('div', 'row targets');
    const mk = (id: string, label: string, ic: string, far: boolean, sub = '') => {
      if (this.panel === 'partner' && (id === this.target || id === 'all')) return;
      if (this.panel === 'force' && this.verb === 'rope' && (id === this.partner || id === 'all')) return;
      const b = h('button', `chip${far ? ' far' : ''}`, `${icon(ic)}${esc(label)}<small>${esc(sub)}</small>`);
      const pressed = this.panel === 'partner' ? this.partner === id : this.target === id;
      b.setAttribute('aria-pressed', String(pressed));
      b.setAttribute('aria-label', sub ? `${label}: ${sub}` : label);
      b.onclick = () => this.pickTarget(id);
      chips.append(b);
    };
    const anyNear = c.members.some((x) => x.homeAt === null && canHear(c, x.id));
    mk('all', 'all', 'all', !anyNear);
    chips.querySelector('button')?.setAttribute('aria-label', 'everyone');
    for (const x of MEMBERS) {
      const mem = memberState(c, x.id);
      const far = mem.homeAt === null && !canHear(c, x.id);
      const mood = moodWord(personOf(c, x.id), coldAt(c.seed, c.weather, c.minute, posXY(c, mem.pos).alt));
      mk(
        x.id,
        x.name,
        'person',
        far,
        mem.homeAt !== null
          ? `${x.they === 'she' ? 'She' : 'He'} is at the hut.`
          : far
            ? `${x.they === 'she' ? 'She' : 'He'} cannot hear you.`
            : mood
              ? `${x.they === 'she' ? 'She' : 'He'} looks ${mood}.`
              : '',
      );
    }
    const label = h('div', 'label');
    const tgt = this.target === 'all' ? 'everyone' : memberOf(this.target).name;
    label.innerHTML =
      this.panel === 'partner'
        ? `<span>Who should tie a rope to ${esc(tgt)}?</span>`
        : this.panel === 'force' && this.verb === 'rope' && this.partner
          ? `<span>How firmly will you ask ${esc(tgt)} to tie a rope to ${esc(memberOf(this.partner).name)}?</span>`
          : `<span>Speak to ${esc(tgt)}</span><span>${c.members.some((x) => x.ropedTo) ? 'Some people are tied to a partner.' : ''}</span>`;
    if (this.panel === 'force')
      label.innerHTML = `<span>${esc(tgt)}: ${esc(this.requestName(this.verb ?? 'climb'))}</span>`;
    const cancel = h('button', 'sheet-back', '←');
    cancel.setAttribute('aria-label', 'Back to requests');
    cancel.onclick = () => {
      this.verb = null;
      this.partner = null;
      this.panel = 'main';
      this.renderSheet();
    };
    if (this.panel !== 'main') label.prepend(cancel);
    const targetControls = h('div', 'target-controls');
    if (this.panel === 'main' || this.panel === 'more' || this.panel === 'partner')
      targetControls.append(chips);
    sh.append(label, targetControls);
    const notice = fieldNotice(c);
    if (notice)
      sh.append(
        h('details', 'field-notice', `<summary>Route and weather warning</summary><p>${esc(notice)}</p>`),
      );
    chips.scrollLeft = targetScroll;
    const calls = h('div', 'pending-calls');
    // Someone asks who will go down with them: the player's answer, as words to people.
    // Requests queue: one prompt at a time, the oldest first, labelled by its asker; the next replaces it.
    // A fresh hurt calls the leader: go to them, or (in earshot) turn them back.
    const hurt = this.panel === 'main' || this.panel === 'calls' ? hurtCall(c) : null;
    if (hurt) {
      const nm = memberOf(hurt.who).name;
      const obj = memberOf(hurt.who).they === 'she' ? 'her' : 'him';
      const bar = h(
        'div',
        `ask-bar hurt${hurt.near ? '' : ' faint'}`,
        `<span><b>${esc(nm)}</b> fell on ${esc(hurt.where)} and is hurt.${hurt.near ? '' : ` ${memberOf(hurt.who).they === 'she' ? 'She' : 'He'} is too far away to hear you.`}</span>`,
      );
      const go = h('button', 'force', `go to ${obj}`);
      go.onclick = () => this.send({ t: 'lead', dir: 'with', who: hurt.who });
      bar.append(go);
      if (hurt.near) {
        const back = h('button', 'force', `turn ${obj} back`);
        back.onclick = () => this.send({ t: 'say', to: hurt.who, act: 'descend', force: 'urge' });
        bar.append(back);
      }
      calls.append(bar);
    }
    // The promised hour: who can hear the call to turn, and who is too far.
    const due = this.panel === 'main' || this.panel === 'calls' ? promiseDue(c) : null;
    if (due) {
      const bar = h(
        'div',
        'ask-bar hurt',
        `<span>It is <b>${due.hour}:00</b>, the time you promised to turn back.</span><div class="call-names"><span>In earshot</span>${due.near.map((id) => `<span class="chip">${esc(memberOf(id).name)}</span>`).join('') || '<span>Nobody</span>'}</div><div class="call-names"><span>Too far to hear</span>${due.far.map((id) => `<span class="chip far">${esc(memberOf(id).name)}</span>`).join('') || '<span>Nobody</span>'}</div>`,
      );
      const all = h('button', 'force', 'we all turn');
      all.onclick = () =>
        this.send({ t: 'lead', dir: 'down' }, { t: 'say', to: 'all', act: 'descend', force: 'urge' });
      bar.append(all);
      calls.append(bar);
    }
    const queue = c.members
      .filter((x) => x.asks && x.homeAt === null)
      .sort((a, b) => (a.asks?.at ?? 0) - (b.asks?.at ?? 0));
    const asking = queue[0];
    if (asking && !hurt && !due && (this.panel === 'main' || this.panel === 'calls')) {
      const nm = memberOf(asking.id).name;
      const near = canHear(c, asking.id);
      const below = posXY(c, asking.pos).alt < posXY(c, c.leader.pos).alt;
      const obj = memberOf(asking.id).they === 'she' ? 'her' : 'him';
      // Out of earshot the call still carries, faintly: walking back to answer it is the player's choice.
      const bar = h(
        'div',
        `ask-bar${near ? '' : ' faint'}`,
        near
          ? `<span><b>${esc(nm)}</b> wants to go down. Who goes with ${obj}?${queue.length > 1 ? ` <small>(${queue.length - 1} more waiting)</small>` : ''}</span>`
          : `<span><b>${esc(nm)}</b> is calling from ${below ? 'below' : 'above'}, too far away for you to hear the words.</span>`,
      );
      for (const o of c.members) {
        if (o.id === asking.id || o.homeAt !== null || !canHear(c, o.id)) continue;
        const b = h('button', 'force', `send ${esc(memberOf(o.id).name)}`);
        b.onclick = () =>
          this.send({
            t: 'say',
            to: o.id,
            act: c.fieldRules ? 'escort-reach' : 'escort',
            force: 'ask',
            with: asking.id,
          });
        bar.append(b);
      }
      if (near) {
        const w = h('button', 'force', 'ask to wait');
        w.onclick = () => this.send({ t: 'say', to: asking.id, act: 'wait', force: 'ask' });
        const all = h('button', 'force', 'we all turn');
        all.onclick = () =>
          this.send({ t: 'lead', dir: 'down' }, { t: 'say', to: 'all', act: 'descend', force: 'urge' });
        bar.append(w, all);
      } else if (below) {
        const back = h('button', 'force', `go back to ${obj}`);
        back.onclick = () => this.send({ t: 'lead', dir: 'down' });
        bar.append(back);
      }
      calls.append(bar);
    }

    if (asking && !hurt && !due && this.panel === 'main') {
      const banner = h('button', 'company-banner', `${esc(memberOf(asking.id).name)} wants to go down ▸`);
      banner.onclick = () => {
        this.panel = 'calls';
        this.renderSheet();
      };
      label.replaceWith(banner);
    }
    if ((hurt || due) && this.panel === 'main') {
      sh.innerHTML = '';
      calls.classList.add('call-takeover');
      sh.append(calls);
    } else if (this.panel === 'main') {
      sh.append(this.peopleVerbs(), this.requestResult());
    } else if (this.panel === 'calls') {
      sh.append(calls);
    } else if (this.panel === 'more') {
      sh.append(this.peopleVerbs());
      if (this.target !== 'all') {
        const talk = h(
          'button',
          'btn',
          `Ask ${esc(tgt)} about ${esc(DISCOVERIES[this.target]?.displayTopic ?? DISCOVERIES[this.target]?.topic ?? 'their life')}`,
        );
        talk.disabled = !this.heardTarget();
        talk.onclick = () => this.send({ t: 'ask-life', to: this.target });
        sh.append(talk);
      }
    } else if (this.panel === 'leader-more') {
      const extra = this.leaderRow();
      for (const child of extra.querySelectorAll('.verb-option:not(.secondary-action)')) child.remove();
      sh.append(extra);
    } else if (this.panel === 'answers') {
      sh.append(this.answersSheet());
    } else if (this.panel === 'partner') {
      sh.append(h('p', 'request-summary', `Choose a different partner for ${esc(tgt)}.`));
    } else if (this.panel === 'force') {
      sh.append(
        h(
          'p',
          'request-summary',
          `${esc(tgt)}: <b>${esc(this.requestName(this.verb ?? 'climb'))}</b>${this.partner ? ` with ${esc(memberOf(this.partner).name)}` : ''}`,
        ),
      );
      sh.append(this.forceRow());
      const replies = this.requestReplies(this.verb ?? 'climb');
      if (replies) sh.append(replies);
    } else if (this.panel === 'tell') sh.append(this.tellRow());
    else if (this.panel === 'promise') sh.append(this.promiseRow());
    else if (this.panel === 'route') sh.append(this.routeRow());
    else if (this.panel === 'scout') sh.append(this.routeRow(true));
    this.leaderBar.replaceChildren(this.leaderRow());
    this.renderTop();
    const currentResult = sh.querySelector<HTMLElement>('.request-result');
    const details = currentResult?.querySelector('details');
    if (details && currentResult?.dataset.input === answerInput) details.open = !!answersOpen;
  }

  private verbBtn(
    id: string,
    label: string,
    ic: string,
    enabled: boolean,
    onclick: () => void,
    reason = '',
  ): HTMLElement {
    const b = h('button', 'verb', `${icon(ic)}<span>${esc(label)}</span>`) as HTMLButtonElement;
    b.disabled = !enabled;
    if (this.note?.lit === id || this.verb === id) b.classList.add('lit');
    b.onclick = onclick;
    const wrap = h('div', 'verb-option');
    wrap.append(b);
    if (!enabled) {
      const why = h('small', 'verb-reason', esc(reason));
      why.id = `reason-${id}`;
      b.setAttribute('aria-describedby', why.id);
      b.append(why);
    }
    return wrap;
  }

  private heardTarget(): boolean {
    const c = this.climb;
    if (this.target === 'all') return c.members.some((x) => x.homeAt === null && canHear(c, x.id));
    const mem = memberState(c, this.target);
    return mem.homeAt === null && canHear(c, this.target);
  }

  private peopleVerbs(): HTMLElement {
    const c = this.climb;
    const g = h('div', 'verbs');
    const ok = this.heardTarget();
    const one = this.target !== 'all';
    const subject = one ? (memberOf(this.target).they === 'she' ? 'She' : 'He') : 'They';
    const be = one ? 'is' : 'are';
    const have = one ? 'has' : 'have';
    const object = one ? (memberOf(this.target).they === 'she' ? 'her' : 'him') : 'them';
    const unheard =
      one && memberState(c, this.target).homeAt !== null
        ? `${subject} ${be} back at the hut for today.`
        : `${subject} cannot hear you. Walk closer.`;
    const chooseOne = !one ? 'Pick one person.' : '';
    const near = one && distance(c, memberState(c, this.target).pos, c.leader.pos) < 40;
    // Match the offer builder: the hut provides food without consuming carried rations.
    const foodAvailable = (x: ClimbState['members'][number]) =>
      x.rations > 0 || x.pos.place === MOUNTAINS[c.mountain]?.hut;
    const noFood = one
      ? !foodAvailable(memberState(c, this.target))
      : c.members.every((x) => x.homeAt !== null || !canHear(c, x.id) || !foodAvailable(x));
    const choose = (v: string) => () => {
      if (v === 'rest' || v === 'eat' || v === 'wait') {
        this.send({ t: 'say', to: this.target, act: v, force: 'ask' });
        return;
      }
      this.verb = v;
      this.panel = v === 'rope' ? 'partner' : 'force';
      this.renderSheet();
    };
    g.append(
      this.verbBtn('climb', 'climb on', 'up', ok, choose('climb'), unheard),
      this.verbBtn('descend', 'turn back', 'down', ok, choose('descend'), unheard),
      this.verbBtn('rest', 'rest', 'rest', ok, choose('rest'), unheard),
      this.verbBtn(
        'eat',
        'eat',
        'eat',
        ok && !noFood,
        choose('eat'),
        !ok
          ? unheard
          : c.leader.rations > 0
            ? `${subject} ${have} no food left. You can share yours.`
            : `${subject} ${have} no food left. ${subject} can eat at the hut.`,
      ),
      this.verbBtn('wait', 'wait', 'wait', ok, choose('wait'), unheard),
    );
    if (has(this.disc, 'tell'))
      g.append(
        this.verbBtn(
          c.fieldRules ? 'scout-route' : 'ahead',
          c.fieldRules ? 'scout crossing' : 'go ahead',
          'up',
          ok && one,
          choose(c.fieldRules ? 'scout-route' : 'ahead'),
          chooseOne || unheard,
        ),
      );
    if (has(this.disc, 'rope'))
      g.append(
        this.verbBtn(
          'rope',
          'rope up',
          'rope',
          ok && one && !memberState(c, this.target).ropedTo,
          choose('rope'),
          chooseOne || (!ok ? unheard : `${subject} ${be} already tied to a partner.`),
        ),
      );
    if (has(this.disc, 'pack')) {
      const canPack = ok && one && near && memberState(c, this.target).pack;
      g.append(
        this.verbBtn(
          'pack',
          'take pack',
          'pack',
          canPack,
          choose('pack'),
          chooseOne || (!ok ? unheard : !near ? `Walk to ${object} first.` : 'You already carry this pack.'),
        ),
      );
    }
    if (has(this.disc, 'share')) {
      const canShare = one && near && c.leader.rations > 0;
      g.append(
        this.verbBtn(
          'share',
          'share food',
          'share',
          canShare,
          () => this.send({ t: 'share', to: this.target }),
          chooseOne || (!near ? `Walk to ${object} first.` : 'Your food is gone.'),
        ),
      );
    }
    for (const el of [...g.children].slice(5)) el.classList.add('secondary-action');
    const more = h('button', 'verb more-actions', 'more ▾');
    more.onclick = () => {
      this.panel = this.panel === 'more' ? 'main' : 'more';
      this.renderSheet();
    };
    g.insertBefore(more, g.children[5] ?? null);
    g.classList.add('people-verbs');
    return g;
  }

  private leaderRow(): HTMLElement {
    const c = this.climb;
    const m = MOUNTAINS[c.mountain];
    const g = h('div', 'verbs');
    const L = c.leader;
    const atFork = m && L.pos.place && forkOf(m) === L.pos.place && !L.move;
    g.append(
      this.verbBtn('lead', 'lead on', 'up', true, () => {
        if (atFork) {
          this.panel = 'route';
          this.renderSheet();
        } else this.send({ t: 'lead', dir: 'up' });
      }),
      this.verbBtn(
        'down',
        'go down',
        'down',
        L.path.length > 0 || L.pos.leg !== null,
        () => this.send({ t: 'lead', dir: 'down' }),
        'You are at the hut. Climb first.',
      ),
      this.verbBtn(
        'stop',
        L.fixing ? 'fixing…' : 'stop',
        'stop',
        L.move !== null || !!L.follow || !!L.near,
        () => this.send({ t: 'lead', dir: 'stop' }),
        L.fixing ? 'Finish fixing the rope first.' : 'You are standing still. Start walking.',
      ),
    );
    // Walking with them: the whole party, or the one picked in the chips.
    const one = this.target !== 'all' ? MEMBERS.find((x) => x.id === this.target) : undefined;
    g.append(
      this.verbBtn(
        'with',
        one
          ? memberState(c, one.id).homeAt !== null
            ? `${one.name} is at the hut`
            : `walk to ${one.name}`
          : 'stay with them',
        'all',
        !one || memberState(c, one.id).homeAt === null,
        () =>
          this.send({
            t: 'lead',
            dir: one ? 'near' : 'with',
            who: one ? one.id : 'party',
          }),
        `${this.target === 'all' ? 'Everyone is' : `${memberOf(this.target).name} is`} back at the hut for today.`,
      ),
    );
    if (has(this.disc, 'tell')) {
      const ups = m && L.pos.place && !L.move ? legsUp(m, L.pos.place) : [];
      g.append(
        this.verbBtn(
          'scout',
          L.scouting ? 'looking…' : 'scout',
          'tell',
          ups.length > 0 && !L.scouting,
          () => {
            if (ups.length > 1) {
              this.panel = 'scout';
              this.renderSheet();
            } else this.send({ t: 'scout' });
          },
          L.scouting
            ? 'You are already inspecting a path. Wait until you return.'
            : L.move
              ? 'Stop at a junction first.'
              : 'There is no path above you to inspect.',
        ),
      );
    }
    if (has(this.disc, 'tell'))
      g.append(
        this.verbBtn(
          'tell',
          'tell',
          'tell',
          c.known.length > 0,
          () => {
            this.panel = 'tell';
            this.renderSheet();
          },
          'You have no new information. Inspect a path first.',
        ),
      );
    if (has(this.disc, 'promise'))
      g.append(
        this.verbBtn(
          'promise',
          c.promise ? 'promised' : 'promise',
          'promise',
          c.promise === null,
          () => {
            this.panel = 'promise';
            this.renderSheet();
          },
          `You promised to turn back at ${c.promise?.hour}:00.`,
        ),
      );
    if (has(this.disc, 'fix')) {
      const fixable =
        m && L.pos.place && !L.move && !L.fixing
          ? legsUp(m, L.pos.place).some((l) => l.fixable && !c.fixed.includes(l.id))
          : false;
      g.append(
        this.verbBtn(
          'fix',
          'fix rope',
          'fix',
          Boolean(fixable),
          () => this.send({ t: 'fix' }),
          L.fixing
            ? 'You are already securing a rope. Wait until you finish.'
            : L.move
              ? 'Stop below a route where you can secure a rope.'
              : 'There is nowhere above you to secure another rope.',
        ),
      );
    }
    const wrap = h('div');
    wrap.className = 'leader-controls';
    g.classList.add('movement-verbs');
    for (const el of [...g.children].slice(4)) el.classList.add('secondary-action');
    const lab = h('div', 'label', '<span>you</span>');
    lab.classList.add('you-label');
    const more = h('button', 'verb more-actions', 'more ▾');
    more.onclick = () => {
      this.panel = 'leader-more';
      this.renderSheet();
    };
    g.insertBefore(more, g.children[4] ?? null);
    wrap.append(lab, g);
    return wrap;
  }

  /** Approximate physical distance and travel time, never a readout of inner state. */
  private movementWords(): string {
    const c = this.climb;
    const id = c.leader.near ?? (c.leader.follow !== 'party' ? c.leader.follow : null);
    if (!id) return '';
    const mem = memberState(c, id);
    const name = memberOf(id).name;
    if (mem.homeAt !== null) return `${name} is back at the hut.`;
    const { metres, minutes } = approachEstimate(c, id);
    if (metres < 40) return `You are close enough to help ${name}.`;
    if (!c.leader.near && !c.leader.move)
      return `You can hear ${name}, but you are too far away to help. Tap walk to ${name} to get closer.`;
    const gap =
      metres < 70
        ? 'a few dozen metres'
        : metres < 150
          ? 'about a hundred metres'
          : metres < 300
            ? 'a few hundred metres'
            : metres < 750
              ? 'about half a kilometre'
              : 'over half a kilometre';
    const eta =
      minutes < 3
        ? 'a couple of minutes'
        : minutes < 10
          ? 'under ten minutes'
          : minutes < 20
            ? 'about fifteen minutes'
            : minutes < 40
              ? 'about half an hour'
              : 'over half an hour';
    const pronoun = memberOf(id).they;
    return `You are walking to ${name}. The distance is ${gap}. You should arrive in ${eta} of game time if ${pronoun} stays here.${mem.move ? ` ${name} is still moving.` : ''}`;
  }

  private forceRow(): HTMLElement {
    const g = h('div', 'forces');
    const v = this.verb ?? 'climb';
    const f = (force: Force, label: string, sub: string, enabled = true) => {
      const b = h('button', 'force task', `${label}<small>${sub}</small>`) as HTMLButtonElement;
      b.disabled = !enabled || !this.heardTarget();
      b.onclick = () => {
        const act = v as 'climb' | 'descend' | 'rest' | 'eat' | 'wait' | 'rope' | 'pack' | 'ahead';
        // A rope needs two different people (owner playtest: Nell was once asked to rope up with Nell).
        if (act === 'rope' && (!this.partner || this.partner === this.target)) return;
        this.send({
          t: 'say',
          to: this.target,
          act,
          force,
          ...(act === 'rope' && this.partner ? { with: this.partner } : {}),
        });
      };
      return b;
    };
    if (!this.heardTarget())
      g.append(
        h(
          'p',
          'force-reason',
          this.target !== 'all' && memberState(this.climb, this.target).homeAt !== null
            ? `${memberOf(this.target).name} is back at the hut for today. Cancel this request.`
            : `${this.target === 'all' ? 'Everyone is' : `${memberOf(this.target).name} is`} too far away to hear you. Cancel this request and walk closer.`,
        ),
      );
    g.append(
      f('ask', 'ask', 'gently'),
      f('urge', 'urge', 'apply pressure'),
      f(
        'insist',
        'insist',
        has(this.disc, 'insist') ? 'can harm trust' : 'after a refusal',
        has(this.disc, 'insist'),
      ),
    );
    return g;
  }

  private requestName(act: string): string {
    return (
      (
        {
          climb: 'climb on',
          descend: 'turn back',
          rest: 'rest',
          eat: 'eat',
          wait: 'wait',
          rope: 'rope up',
          pack: 'give you a pack',
          ahead: 'go ahead',
          'scout-route': 'scout the crossing',
          drink: 'drink',
          relieve: 'step aside',
          escort: 'go down together',
          'escort-reach': 'meet, then consider going down together',
          gather: 'close up',
        } as Record<string, string>
      )[act] ?? act
    );
  }

  /** Acknowledges the latest request, using only its own HF answers and observed movement. */
  private answersButton(count: number, input: number): HTMLButtonElement {
    const button = h('button', 'all-answers', count === 1 ? '1 answer ▸' : `All ${count} answers ▸`);
    button.onclick = () => {
      this.answersInput = input;
      this.panel = 'answers';
      this.renderSheet();
    };
    return button;
  }

  private requestResult(): HTMLElement {
    const slot = h('div', 'request-feedback');
    const c = this.climb;
    const index = c.inputs.findLastIndex((input) => input.t === 'say' || input.t === 'promise');
    const input = c.inputs[index];
    if (input?.t !== 'say' && input?.t !== 'promise') return slot;
    const latest = new Map<string, Line>();
    for (const line of c.lines) if (line.input === index) latest.set(line.who, line);
    const answers = [...latest.values()];
    const box = h('div', 'request-replies request-result');
    box.dataset.input = String(index);
    if (input.t === 'promise') {
      box.append(h('p', 'request-acknowledgement', `You promised to turn back at ${input.hour}:00.`));
      const more = this.answersButton(answers.length, index);
      if (answers.length) box.append(more);
      else
        box.append(
          h(
            'p',
            '',
            c.unheard.includes(index) ? 'Nobody heard the promise.' : 'You are waiting for their answers.',
          ),
        );
      slot.append(box);
      return slot;
    }
    const previous = c.inputs[index - 1];
    const collectiveTurn =
      input.act === 'descend' &&
      input.to === 'all' &&
      input.force === 'urge' &&
      previous?.t === 'lead' &&
      previous.dir === 'down' &&
      previous.at === input.at;
    const label = this.requestName(input.act);
    const action = (
      {
        climb: 'climbing farther',
        descend: 'turning back',
        rest: 'resting',
        eat: 'eating',
        wait: 'waiting',
        rope: 'roping up',
        pack: 'giving you a pack',
        ahead: 'going ahead',
        escort: 'going down together',
        'escort-reach': 'meeting before going down together',
        'scout-route': 'scouting the crossing',
        drink: 'drinking',
        relieve: 'stepping aside',
        gather: 'closing up',
      } as Record<string, string>
    )[input.act];
    const response = (line: Line): string => {
      if (line.verdict === 'assented') return `agreed to ${label}`;
      if (line.verdict === 'complied') return `agreed under pressure to ${label}`;
      if (line.verdict === 'deferred') return `wants to wait before ${action}`;
      if (line.verdict === 'refused') return `refused ${action}`;
      if (line.verdict === 'modified') return `offered another action instead of ${action}`;
      return `heard ${label}`;
    };
    if (collectiveTurn) {
      // The command requests a descent; it cannot guarantee that every person follows.
      const turned = c.leader.move?.dir === 'down';
      box.append(
        h(
          'p',
          'request-acknowledgement',
          turned
            ? 'You turned downhill and urged everyone to turn back.'
            : 'You called everyone downhill and urged them to turn back.',
        ),
      );
      const descending = c.members.filter((member) => member.move?.dir === 'down').map((member) => member.id);
      const names = [...(turned ? ['you'] : []), ...descending.map((id) => memberOf(id).name)];
      box.append(
        h(
          'p',
          '',
          names.length
            ? `${esc(names[0] === 'you' ? ['You', ...names.slice(1)].join(', ') : names.join(', '))} ${names.length === 1 && names[0] !== 'you' ? 'is' : 'are'} walking down.`
            : 'Nobody is descending yet.',
        ),
      );
    } else {
      const accepted = answers.filter((line) => ['assented', 'complied'].includes(line.verdict));
      box.append(
        h(
          'p',
          'request-acknowledgement',
          accepted.length
            ? `${esc(namesOf(accepted.map((line) => line.who)))} agreed to ${esc(label)}.`
            : `You asked ${input.to === 'all' ? 'everyone' : esc(memberOf(input.to).name)} to ${esc(label)}.`,
        ),
      );
    }
    const no = answers.find((line) => ['refused', 'deferred', 'modified'].includes(line.verdict));
    if (no) {
      const objection = h(
        'p',
        'request-objection',
        `<b>${esc(memberOf(no.who).name)} ${esc(response(no))}.</b> “${esc(displayText(no.says))}”`,
      );
      if (collectiveTurn) box.append(objection);
      else box.prepend(objection);
      if (input.act === 'rope') box.querySelector('.request-acknowledgement')?.remove();
    } else if (!answers.length)
      box.append(
        h(
          'p',
          '',
          c.unheard.includes(index)
            ? 'Nobody heard the request.'
            : input.to === 'all'
              ? 'You are waiting for everyone to answer.'
              : `You are waiting for ${esc(memberOf(input.to).name)} to answer.`,
        ),
      );
    if (answers.length) {
      const more = this.answersButton(answers.length, index);
      box.append(more);
    }
    if (['rest', 'eat', 'wait'].includes(input.act)) {
      const tone = h('button', 'request-tone', 'Ask more firmly…');
      tone.onclick = () => {
        this.target = input.to;
        this.verb = input.act;
        this.panel = 'force';
        this.renderSheet();
      };
      box.append(tone);
    }
    if ((input.act === 'rope' || input.act === 'gather') && input.with) {
      const a = memberState(c, input.to);
      const b = memberState(c, input.with);
      const close = distance(c, a.pos, b.pos) < 40;
      if (input.act === 'gather') {
        const walking = [a, b].filter(
          (m) => personOf(c, m.id).activity?.affordanceId === `gather:${m.gather?.with}`,
        );
        const unheard = [a, b].find((m) => !canHear(c, m.id) && !answers.some((line) => line.who === m.id));
        box.append(
          h(
            'p',
            'gather-status',
            close
              ? `${esc(memberOf(a.id).name)} and ${esc(memberOf(b.id).name)} are close enough to rope up.`
              : walking.length
                ? `${esc(namesOf(walking.map((m) => m.id)))} ${walking.length === 1 ? 'is' : 'are'} meeting at ${esc(memberOf(a.id).name)}’s position until ${clock(walking[0]?.gather?.until ?? c.minute)}. They are not together yet.`
                : 'They are still apart. Their answers are recorded above.',
          ),
        );
        if (unheard) {
          const go = h('button', 'force gather-pair', `Walk to ${esc(memberOf(unheard.id).name)} to speak`);
          go.onclick = () => this.send({ t: 'lead', dir: 'near', who: unheard.id });
          box.append(go);
        }
      }
      if (!close && a.homeAt === null && b.homeAt === null && input.act === 'rope') {
        const gather = h(
          'button',
          'force gather-pair',
          `Close up: ${esc(memberOf(a.id).name)} + ${esc(memberOf(b.id).name)}`,
        );
        gather.onclick = () =>
          this.send({
            t: 'say',
            to: a.id,
            act: 'gather',
            with: b.id,
            force: 'ask',
          });
        box.append(gather);
      }
    }
    slot.append(box);
    return slot;
  }

  /** Last recorded HF answer for each addressed person and this request. Never predicts a new verdict. */
  private requestReplies(act: string, refusalsOnly = false): HTMLElement | null {
    const latest = new Map<string, Line>();
    // A rope request addresses a pair. On the main sheet recover the last pair involving
    // the selection; in the composer match the chosen pair in either orientation.
    const priorRope = [...this.climb.inputs]
      .reverse()
      .find(
        (i) =>
          i.t === 'say' &&
          i.act === 'rope' &&
          i.with &&
          (this.target === 'all' || i.to === this.target || i.with === this.target),
      );
    const pair =
      act !== 'rope'
        ? null
        : this.panel === 'force' && this.partner
          ? [this.target, this.partner]
          : priorRope?.t === 'say' && priorRope.with
            ? [priorRope.to, priorRope.with]
            : [];
    for (const line of this.climb.lines) {
      const input = this.climb.inputs[line.input];
      if (
        input?.t === 'say' &&
        input.act === act &&
        (pair
          ? pair.includes(input.to) && !!input.with && pair.includes(input.with) && pair.includes(line.who)
          : this.target === 'all' || line.who === this.target)
      )
        latest.set(line.who, line);
    }
    const answers = [...latest.values()];
    const noes = answers.filter((l) => ['refused', 'deferred', 'modified'].includes(l.verdict));
    const first = noes[0] ?? (!refusalsOnly ? answers[0] : undefined);
    if (!first) return null;
    const box = h('div', 'request-replies');
    box.append(
      h(
        'p',
        '',
        `<b>${esc(this.requestName(act))} · ${esc(memberOf(first.who).name)}</b> (${clock(first.at)}): “${esc(displayText(first.says))}”`,
      ),
    );
    if (answers.length > 1 && (!refusalsOnly || act === 'rope')) {
      const more = h('details', '', `<summary>All ${answers.length} recorded answers</summary>`);
      for (const l of answers)
        more.append(h('p', '', `${esc(memberOf(l.who).name)}: “${esc(displayText(l.says))}”`));
      box.append(more);
    }
    return box;
  }

  private tellRow(): HTMLElement {
    const c = this.climb;
    const g = h('div', 'verbs');
    for (const f of c.known)
      g.append(
        this.verbBtn(`tell:${f}`, FACTS[f].short, 'tell', true, () => this.send({ t: 'tell', fact: f })),
      );
    return g;
  }

  private promiseRow(): HTMLElement {
    const c = this.climb;
    const g = h('div', 'verbs');
    const now = Math.floor((c.minute - c.day * 1440) / 60);
    for (const hour of [12, 13, 14, 15, 16])
      if (hour > now)
        g.append(
          this.verbBtn(`p${hour}`, `turn at ${hour}:00`, 'promise', true, () =>
            this.send({ t: 'promise', hour }),
          ),
        );
    return g;
  }

  private routeRow(scout = false): HTMLElement {
    const c = this.climb;
    const m = MOUNTAINS[c.mountain];
    const g = h('div', 'verbs');
    if (!m || !c.leader.pos.place) return g;
    for (const lg of legsUp(m, c.leader.pos.place))
      g.append(
        this.verbBtn(
          `route:${lg.id}`,
          `${scout ? 'Inspect' : 'Take'} ${routeName(lg)}`,
          scout ? 'tell' : 'up',
          true,
          () => this.send(scout ? { t: 'scout', via: lg.id } : { t: 'lead', dir: 'up', via: lg.id }),
        ),
      );
    return g;
  }

  // ------------------------------------------------------------ pages

  private pageEl: HTMLElement | null = null;
  private pageGeneration = 0;
  private debriefWorker: Worker | null = null;

  private pageOpen(): boolean {
    return this.pageEl !== null;
  }

  private openPage(html: string, bind: (el: HTMLElement) => void = () => {}, kind = 'journal'): void {
    if (!this.current()) return;
    this.infoEl?.remove();
    this.infoEl = null;
    this.closePage();
    this.pageKind = kind;
    this.root.dataset.screen = kind;
    const el = h('div', `page page-${kind}`, `<div class="inner">${html}</div>`);
    this.root.append(el);
    this.pageEl = el;
    if (this.saving) el.inert = true;
    this.syncStage();
    bind(el);
    if (this.climb) this.renderTop();
    else this.whereEl.innerHTML = '<a href="https://human.adamwhite.work/games/">All games</a>';
  }

  private closePage(): void {
    if (!this.current()) return;
    this.pageGeneration++;
    if (this.entry === 'file') this.fileGeneration++;
    this.debriefWorker?.terminate?.();
    this.debriefWorker = null;
    this.pageEl?.remove();
    this.pageEl = null;
    this.root.dataset.screen = 'climb';
    this.syncStage();
    if (this.climb) this.renderTop();
    this.last = performance.now();
  }

  private openInfo(): void {
    if (!this.current()) return;
    if (this.infoEl) {
      this.infoEl.remove();
      this.infoEl = null;
      return;
    }
    const copy =
      this.pageKind === 'title' && this.pageOpen()
        ? '<h2>The season</h2><p>Ezra led them for eleven summers. This year they asked you to lead.</p><p>You will climb three mountains this season. Each person can say no.</p><p>You can play offline after the game loads. Install it from your browser’s menu.</p>'
        : this.pageKind === 'hut' && this.pageOpen()
          ? '<h2>At the hut</h2><p>A promised return time matters to you and the party.</p><p>They remember whether you keep that promise.</p><p>“We’ll see” promises nothing.</p>'
          : this.pageOpen()
            ? '<h2>The notebook</h2><p>The total counts each person who returned by dark twice. It adds one for each summit visit.</p><p>This is how the game counts the day. It does not measure a person’s worth.</p><p>The conversation at the hut uses facts from the journal. It does not change what happened.</p>'
            : this.panel === 'calls' || (this.climb && (hurtCall(this.climb) || promiseDue(this.climb)))
              ? '<h2>Calls</h2><p>If someone falls far away, you need to walk to them.</p><p>If you send someone down with a friend, they can only tie a rope between them when they are close.</p><p>People who are far away cannot hear you.</p>'
              : '<h2>Asking</h2><p>Only people nearby can hear you. A dimmed name means the person is too far away.</p><p>Ask lets them choose freely. Urge puts more pressure on them. Insist becomes available after a refusal and can harm trust.</p><p>The bottom row controls your own actions. People may follow where you walk.</p><p>Their position and actions are visible. Current private condition and trust are unavailable.</p>';
    const backdrop = h(
      'div',
      'info-backdrop',
      `<section class="info-popover" role="dialog" aria-label="About this part of the climb"><button class="close" aria-label="Close information">×</button>${copy}</section>`,
    );
    const close = () => {
      backdrop.remove();
      this.infoEl = null;
      this.last = performance.now();
    };
    backdrop.onclick = (e) => {
      if (e.target === backdrop || (e.target as HTMLElement).closest('.close')) close();
    };
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    this.infoEl = backdrop;
    this.root.append(backdrop);
    backdrop.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private gameMenu(): void {
    if (this.entry !== 'native') {
      this.filePage();
      return;
    }
    if (!this.current()) return;
    if (this.menuEl) return;
    this.infoEl?.remove();
    this.infoEl = null;
    const menu = h(
      'div',
      'menu-backdrop',
      `<section class="game-menu" role="dialog" aria-modal="true" aria-label="Game menu"><div class="menu-header"><h2>Game menu</h2><button class="close" data-menu-close aria-label="Close menu">×</button></div><p class="caption">Time stops while the menu is open.</p><div class="menu-body"><button class="btn" data-menu-send>Feedback</button><button class="btn" data-menu-fullscreen>Full screen</button><a class="menu-link" href="https://human.adamwhite.work/games/">All games</a><div data-recording></div><button class="btn" data-menu-new>New game</button><div data-menu-confirm hidden><p>Starting a new season replaces your saved season.</p><button class="btn" data-new-yes>Start new game</button><button class="btn" data-new-no>Keep this game</button></div><a class="menu-link" data-cast-shelf href="https://human.adamwhite.work/lab/people/">People across games</a><fieldset class="menu-pacing"><legend>Pace: Automatic</legend>${(['auto', 'slow', 'normal', 'fast'] as const).map((speed) => `<button class="btn" data-pace="${speed}" aria-pressed="${this.speed === speed}">${speed}</button>`).join('')}</fieldset><button class="btn" data-menu-export ${this.climb ? '' : 'disabled'}>Download this run</button><a class="menu-link" href="/file/">Open a run file</a><button class="btn" data-menu-title>Title page</button><div class="privacy-debug"><a href="https://human.adamwhite.work/lab/privacy/">Lab privacy</a><details data-debug><summary>Debug</summary><p>Human Framework ${FRAMEWORK_VERSION}</p>${this.startupError ? `<pre>${esc(this.startupError)}</pre>` : ''}</details></div></div><button class="btn go menu-resume" data-menu-close>Resume</button></section>`,
    );
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = () => {
      menu.remove();
      this.menuEl = null;
      this.last = performance.now();
      previousFocus?.focus();
    };
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    menu.onclick = (e) => {
      if (e.target === menu) close();
    };
    this.menuEl = menu;
    menu.querySelector('[data-recording]')?.append(telemetryToggle(lab!));
    menu.querySelector('[data-menu-new]')?.addEventListener('click', () => {
      menu.querySelector<HTMLElement>('[data-menu-confirm]')?.removeAttribute('hidden');
    });
    menu.querySelector('[data-new-no]')?.addEventListener('click', () => {
      menu.querySelector<HTMLElement>('[data-menu-confirm]')?.setAttribute('hidden', '');
    });
    menu.querySelector('[data-new-yes]')?.addEventListener('click', () => {
      close();
      void this.newGame();
    });
    this.root.append(menu);
    menu.querySelectorAll('[data-menu-close]').forEach((button) => {
      button.addEventListener('click', close);
    });
    menu.querySelector('[data-menu-journal]')?.addEventListener('click', () => {
      close();
      this.journalPage();
    });
    menu.querySelector('[data-menu-export]')?.addEventListener('click', () => this.exportRun());
    menu.querySelector('[data-menu-send]')?.addEventListener('click', () => {
      close();
      this.feedbackPage();
    });
    menu.querySelector('[data-menu-title]')?.addEventListener('click', () => {
      close();
      this.save();
      this.titlePage();
    });
    menu.querySelector('[data-menu-fullscreen]')?.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void this.root.requestFullscreen?.();
    });
    menu.querySelectorAll<HTMLElement>('[data-pace]').forEach((button) => {
      button.addEventListener('click', () => {
        this.speed = button.dataset.pace as typeof this.speed;
        this.skipping = false;
        this.acc = 0;
        menu.querySelectorAll<HTMLElement>('[data-pace]').forEach((item) => {
          item.setAttribute('aria-pressed', String(item === button));
        });
      });
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private answersSheet(): HTMLElement {
    const box = h('div', 'answers-sheet request-answer-list');
    box.append(h('h2', '', 'Recorded answers'));
    const input = this.climb.inputs[this.answersInput];
    const action =
      input?.t === 'say'
        ? this.requestName(input.act)
        : input?.t === 'promise'
          ? `turn at ${input.hour}:00`
          : 'the request';
    const verdicts: Record<string, string> = {
      assented: `agreed to ${action}`,
      complied: `agreed under pressure to ${action}`,
      refused: `refused to ${action}`,
      deferred: `wants to wait before agreeing to ${action}`,
      modified: `offered another action when asked to ${action}`,
      heard: `${input?.t === 'promise' ? 'heard your promise to' : 'heard your request to'} ${action}`,
    };
    for (const line of this.climb.lines.filter((line) => line.input === this.answersInput))
      box.append(
        h(
          'p',
          '',
          `<b>${esc(memberOf(line.who).name)} ${esc(verdicts[line.verdict] ?? line.verdict)}</b> · ${clock(line.at)}: “${esc(displayText(line.says))}”`,
        ),
      );
    return box;
  }

  private feedbackPage(): void {
    const returnKind = this.pageOpen() ? this.pageKind : 'climb';
    const back = () => {
      if (returnKind === 'title') this.titlePage();
      else if (returnKind === 'hut') this.climbIntro();
      else if (returnKind === 'season') this.seasonPage();
      else if (returnKind === 'debrief') this.debriefPage();
      else if (returnKind === 'journal') this.journalPage(this.journalOrigin);
      else this.closePage();
    };
    let remembered = '';
    try {
      remembered = localStorage.getItem('hf-lab-feedback-name') ?? '';
    } catch {
      /* storage unavailable */
    }
    this.openPage(
      `<div class="page-body feedback-body"><button class="btn" data-feedback-back>← Back</button><h1>Feedback</h1><p>Send a note about this game.</p><div class="feedback-verdicts">${Object.values(
        FEEDBACK_LABELS,
      )
        .map(
          (label) =>
            `<button class="chip" data-feedback-label="${esc(label)}" aria-pressed="false">${esc(label)}</button>`,
        )
        .join('')}${[
        ['keep', "I'd keep playing"],
        ['mixed', 'I am not sure'],
        ['quit', "I'd stop here"],
      ]
        .map(
          ([value, label]) =>
            `<button class="chip" data-verdict="${value}" aria-pressed="false">${label}</button>`,
        )
        .join(
          '',
        )}</div><label class="feedback-note">What happened? What did you want to do? What got in the way?<textarea rows="4" data-feedback-note></textarea></label><div class="feedback-name"><label>Name (optional)<input type="text" data-feedback-name maxlength="60" value="${esc(remembered)}"></label><p class="caption">A name labels your linked play history on this device, including past and future runs. Leave it empty to use an unnamed identifier for this device.</p></div><div><p>We send your note and any verdict or name you add. When Recording is on, we also include this run. Recorded play is linked across games on this device.</p><a href="https://human.adamwhite.work/lab/privacy/">Lab privacy</a></div><div data-feedback-consent></div><p data-feedback-status role="status"></p></div><div class="page-actions"><button class="btn go" data-feedback-send>Submit</button></div>`,
      (el) => {
        let verdict = '';
        let selectedLabel = '';
        let sent = false;
        const send = el.querySelector<HTMLButtonElement>('[data-feedback-send]');
        const consent = el.querySelector<HTMLElement>('[data-feedback-consent]');
        const status = el.querySelector<HTMLElement>('[data-feedback-status]');
        if (!send || !consent || !status) return;
        const choice = feedbackPersonaControl(lab!);
        if (choice) consent.append(choice);
        const update = () => {
          send.disabled = false;
        };
        update();
        el.querySelector('[data-feedback-back]')?.addEventListener('click', back);
        el.querySelectorAll<HTMLButtonElement>('[data-feedback-label]').forEach((button) => {
          button.addEventListener('click', () => {
            const note = el.querySelector<HTMLTextAreaElement>('[data-feedback-note]');
            if (!note) return;
            let text = note.value;
            if (selectedLabel && text === selectedLabel) text = '';
            else if (selectedLabel && text.startsWith(`${selectedLabel}\n\n`))
              text = text.slice(selectedLabel.length + 2);
            selectedLabel =
              selectedLabel === button.dataset.feedbackLabel ? '' : (button.dataset.feedbackLabel ?? '');
            note.value = [selectedLabel, text].filter(Boolean).join('\n\n');
            el.querySelectorAll<HTMLButtonElement>('[data-feedback-label]').forEach((item) => {
              item.setAttribute('aria-pressed', String(item.dataset.feedbackLabel === selectedLabel));
            });
          });
        });
        el.querySelectorAll<HTMLElement>('[data-verdict]').forEach((button) => {
          button.addEventListener('click', () => {
            verdict = verdict === button.dataset.verdict ? '' : (button.dataset.verdict ?? '');
            el.querySelectorAll<HTMLElement>('[data-verdict]').forEach((item) => {
              item.setAttribute('aria-pressed', String(item.dataset.verdict === verdict));
            });
          });
        });
        send.addEventListener('click', async () => {
          if (sent) {
            back();
            return;
          }
          const name =
            el.querySelector<HTMLInputElement>('[data-feedback-name]')?.value.trim().slice(0, 60) ?? '';
          const text = el.querySelector<HTMLTextAreaElement>('[data-feedback-note]')?.value.trim() ?? '';
          const note = [verdict ? `Verdict: ${verdict}` : '', text].filter(Boolean).join('\n\n');
          send.disabled = true;
          try {
            let run: unknown;
            try {
              run = this.climb ? this.recordingExport() : undefined;
            } catch {
              /* A broken export must not block feedback. */
            }
            const sharePlay = feedbackSharePlay(choice);
            await lab!.sendFeedback(note, { name, run, sharePlay });
            try {
              if (name) localStorage.setItem('hf-lab-feedback-name', name);
              else localStorage.removeItem('hf-lab-feedback-name');
            } catch {
              /* storage unavailable */
            }
            status.textContent = 'Sent. Your note is stored.';
            sent = true;
            send.textContent = 'Back to the game';
            send.disabled = false;
          } catch (error) {
            console.error('Feedback failed', error);
            status.textContent =
              'Your feedback could not be sent. Your note is still here. Try Submit again.';
            send.disabled = false;
          }
        });
      },
      'feedback',
    );
  }

  /** A game convention over recorded outcomes, never an estimate of a person's inner life. */
  private renderReckoning(): void {
    const box = this.pageEl?.querySelector<HTMLElement>('[data-reckoning-result]');
    if (!box) return;
    const facts = this.reckoningFacts.flatMap((day) => Object.values(day));
    const home = facts.filter((f) => f.home).length;
    const tops = facts.filter((f) => f.summit).length;
    box.innerHTML =
      this.reckoningFacts.length > 0
        ? `<button class="btn" data-see-tally aria-expanded="false" aria-controls="reckoning-tally">See the tally</button><div id="reckoning-tally" hidden><p><b>Notebook total: ${2 * home + tops}</b> = 2 × ${home} home by dark + summit visits: ${tops}.</p><p class="caption">This total counts recorded outcomes for ${this.season.over ? 'the completed climbs this season' : 'this completed climb'}. It does not measure a person’s worth.</p></div>`
        : '';
    box.querySelector('[data-see-tally]')?.addEventListener('click', (event) => {
      const tally = box.querySelector<HTMLElement>('#reckoning-tally');
      if (!tally) return;
      tally.hidden = !tally.hidden;
      (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!tally.hidden));
    });
  }

  private footer(): string {
    return '';
  }

  private peaksSvg(done: number): string {
    const peaks = [
      { x: 60, h: 70 },
      { x: 175, h: 95 },
      { x: 290, h: 120 },
    ];
    let d = '';
    peaks.forEach((p, i) => {
      d += `<path d="M${p.x - 55} 140 L${p.x - 10} ${140 - p.h * 0.6} L${p.x} ${140 - p.h} L${p.x + 45} 140" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`;
      if (i < done)
        d += `<path d="M${p.x} ${140 - p.h} L${p.x} ${120 - p.h} L${p.x + 11} ${124 - p.h} L${p.x} ${128 - p.h}" fill="var(--rope)" stroke="var(--rope)" stroke-width="1.2"/>`;
      d += `<text x="${p.x}" y="158" text-anchor="middle" font-family="Caveat" font-size="17" fill="currentColor">${esc(SEASON[i]?.name ?? '')}</text>`;
    });
    return `<svg class="peaks" viewBox="0 0 350 165" role="img" aria-label="The season's three mountains">${d}</svg>`;
  }

  private recordingSave(save: Save) {
    const { ownership: _localOwnership, ...copy } = save;
    return copy;
  }
  private recordingExport() {
    if (this.entry === 'file') return this.fileSession();
    return exportClimb(this.start, this.climb, FRAMEWORK_VERSION, this.season.chapter, this.season.past);
  }

  private runExport() {
    if (this.entry === 'file') return this.fileSession();
    return this.climbExport();
  }

  private climbExport() {
    return {
      ...exportClimb(this.start, this.climb, FRAMEWORK_VERSION, this.season.chapter, this.season.past),
      castSources: structuredClone(this.continuity.sources),
      castArchives: structuredClone(this.continuity.archives),
    };
  }

  /** Complete host-native download. SDK queues and an already active SW remain separate gates. */
  private fileSession(climb = this.climb, season = this.season, start = this.start) {
    if (!this.originalFile || !climb) throw new Error('Choose a file first.');
    return {
      format: 'rope-file-session/2',
      original: structuredClone(this.originalFile),
      native: {
        v: 2,
        state: snapshot(climb),
        engine: ENGINE_VERSION,
        ownership: this.continuity.ownership(),
        season: structuredClone(season),
        start: start === season.start ? '' : start,
        inputs: structuredClone(climb.inputs),
        minute: climb.minute,
        disclosure: structuredClone(this.disc),
        over: climb.over,
      } satisfies Save,
      current: {
        ...exportClimb(start, climb, FRAMEWORK_VERSION, season.chapter, season.past),
        castSources: structuredClone(this.continuity.sources),
        castArchives: structuredClone(this.continuity.archives),
      },
    };
  }

  private fitsFile(climb: ClimbState, season = this.season, start = this.start): boolean {
    if (this.entry !== 'file') return true;
    try {
      const initial = finiteJSON(start);
      if (climb.minute > initial.minute + 10080 || climb.inputs.length > 10000)
        throw new Error('Replay capacity reached.');
      finiteJSON(snapshot(climb));
      finiteJSON(JSON.stringify(this.fileSession(climb, season, start)), SESSION_BYTES);
      return true;
    } catch {
      this.filePage();
      const status = this.pageEl?.querySelector('[data-file-status]');
      if (status)
        status.textContent =
          'This session cannot grow further within complete export limits. Download it before closing.';
      return false;
    }
  }

  private filePage(): void {
    const recording = this.recordingAllowed();
    this.openPage(
      `<div class="page-body file-controls"><h1>Choose a Rope file</h1><p>Your saved climb is not changed. This file plays in this tab only. Download it before you close the tab.</p><div data-recording></div><p data-file-recording-status>${recording ? 'Recording follows your current privacy and Recording choices.' : 'Recording is unavailable because the existing local Lab session could not be preserved. You can play in memory.'}</p><label data-file-label>${this.climb ? 'Choose another file' : 'Choose a file'}<input type="file" accept="application/json" data-file-input></label><p data-file-status role="status"></p></div><div class="page-actions">${this.climb ? '<button class="btn" data-file-export>Download this file session</button><button class="btn go" data-file-resume>Resume current file</button>' : ''}</div>`,
      (el) => {
        el.querySelector('[data-recording]')?.append(telemetryToggle(lab!));
        el.querySelector('[data-file-resume]')?.addEventListener('click', () => this.closePage());
        el.querySelector('[data-file-export]')?.addEventListener('click', () => this.exportRun());
        el.querySelector<HTMLInputElement>('[data-file-input]')?.addEventListener('change', async (event) => {
          const status = el.querySelector<HTMLElement>('[data-file-status]')!;
          const generation = ++this.fileGeneration;
          const current = () => this.current() && generation === this.fileGeneration;
          try {
            if (!current()) return;
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
              status.textContent = '';
              return;
            }
            if (file.size > SESSION_BYTES) throw new Error('This file is too large to preserve completely.');
            status.textContent = 'Loading…';
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!current()) return;
            if (bytes.byteLength > SESSION_BYTES)
              throw new Error('This file is too large to preserve completely.');
            // Bind the selected bytes before decoding. Retain a UTF8 BOM as source text.
            const selectedDigest = await fileByteDigest(bytes);
            if (!current()) return;
            const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            const prepared = await decodeFile(text, selectedDigest);
            if (!current()) return;
            // Validate everything on detached data before changing the active file or caller arguments.
            const continuity = new Continuity(lab!, null);
            await continuity.restoreOwnership(
              { season: prepared.save.season, climb: prepared.climb },
              prepared.save.ownership,
              true,
            );
            if (!current()) return;
            this.continuity.generation++;
            this.continuity = continuity;
            this.originalFile = prepared.original;
            this.season = prepared.save.season;
            this.disc = prepared.save.disclosure;
            this.begin(prepared.climb, prepared.start, true);
            this.trackRun();
            if (this.season.over) this.seasonPage();
            else if (prepared.climb.over) this.endClimb();
          } catch (error) {
            if (this.current() && generation === this.fileGeneration) status.textContent = String(error);
          }
        });
      },
      'title',
    );
  }

  private titlePage(): void {
    if (this.entry !== 'native') {
      this.filePage();
      return;
    }
    lab!.screen('title');
    const sv = this.load();
    const cont = sv && !sv.season.over;
    this.openPage(
      `<div class="title-scene"><h1>The Rope</h1><p class="sub">Five people will climb three mountains.</p>${this.peaksSvg(cont ? sv.season.history.length : 0)}</div><div class="page-body"><p class="title-goal">Lead them up and bring them home. They can say no.</p>${this.unsupportedSave ? '<p role="status">This saved season uses an unsupported edition. Keep any old file and start a fresh season. The saved history has not been replaced.</p>' : ''}${cont ? `<p class="caption continue-summary">Climb ${sv.season.climbNo} of ${SEASON.length} · ${esc(SEASON[sv.season.climbNo - 1]?.name ?? '')} · ${clock(sv.minute)}</p>` : ''}<div data-new-confirm hidden><p>Starting a new game replaces your saved season.</p><button class="btn" data-yes>Start new game</button><button class="btn" data-no>No</button></div></div><div class="page-actions">${cont ? '<button class="btn go" data-a="continue">Resume</button>' : ''}<button class="btn ${cont ? '' : 'go'}" data-a="new">${cont ? 'New game' : 'New game'}</button>${this.footer()}</div>`,
      (el) => {
        el.querySelector('[data-a="continue"]')?.addEventListener('click', () => {
          if (sv) this.resume(sv);
        });
        el.querySelector('[data-a="new"]')?.addEventListener('click', () => {
          if (!cont) this.newGame();
          else el.querySelector<HTMLElement>('[data-new-confirm]')?.removeAttribute('hidden');
        });
        el.querySelector('[data-yes]')?.addEventListener('click', () => this.newGame());
        el.querySelector('[data-no]')?.addEventListener('click', () => {
          el.querySelector<HTMLElement>('[data-new-confirm]')?.setAttribute('hidden', '');
        });
      },
      'title',
    );
  }

  private climbIntro(): void {
    const c = this.climb;
    lab!.screen(climbScreen(c, 'hut'));
    const m = MOUNTAINS[c.mountain];
    const lines = c.journal
      .map((j) => `<p class="${j.story ? 'hand' : ''}">${esc(displayText(j.text))}</p>`)
      .join('');
    this.openPage(
      `<div class="page-body hut-sheet"><h1>${esc(m?.name ?? '')}</h1>
      <p class="sub">Climb ${c.climbNo} of ${SEASON.length} · ${clock(c.minute)}, at the hut</p>

      <p class="hand">When do you turn back?</p>
      <p>They remember whether you keep your word.</p>
      <p class="plan">${[12, 13, 14]
        .map((hr) => `<button class="btn" data-hour="${hr}">We turn at ${hr}:00</button>`)
        .join('')}<button class="btn" data-a="go">We'll see</button></p>

      ${c.climbNo > 1 ? `<details><summary>So far ▸</summary>${lines}</details>` : ''}</div>`,
      (el) => {
        const plans = (): NewInput | undefined => {
          return !c.fieldRules && c.minute === c.startMinute
            ? { t: 'field-rules', bladder: true }
            : undefined;
        };
        el.querySelector<HTMLElement>('[data-a="go"]')?.addEventListener('click', async () => {
          await this.flushSave();
          if (!this.current() || this.climb !== c) return;
          this.display.start();
          const plan = plans();
          if (plan) this.send(plan);
          this.closePage();
          lab!.screen(climbScreen(c, 'climb'));
        });
        for (const b of el.querySelectorAll<HTMLElement>('[data-hour]'))
          b.addEventListener('click', async () => {
            await this.flushSave();
            if (!this.current() || this.climb !== c) return;
            this.display.start();
            const plan = plans();
            this.closePage();
            lab!.screen(climbScreen(c, 'climb'));
            // The first choice of the day, made at the hut where everyone hears it (owner playtest 2026-10-18).
            if (!this.disc.unlocked.includes('promise')) this.disc.unlocked.push('promise');
            const promise: NewInput = { t: 'promise', hour: Number(b.dataset.hour) };
            if (plan) this.send(plan, promise);
            else this.send(promise);
          });
      },
      'hut',
    );
  }

  private journalOrigin = 'climb';

  private journalPage(origin = this.pageOpen() ? this.pageKind : 'climb'): void {
    if (origin !== 'journal') this.journalOrigin = origin;
    const returnKind = this.journalOrigin;
    const c = this.climb;
    if (!c) return;
    const rows = c.journal
      .map(
        (j) =>
          `<div class="entry${j.story ? ' story' : ''}"><time>${clock(j.at)}</time><span>${esc(displayText(j.text))}</span></div>`,
      )
      .join('');
    this.openPage(
      `<div class="page-body"><button class="btn" data-a="close">← Back</button><h2>The journal</h2>${rows}</div>`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="close"]')?.addEventListener('click', () => {
          // A finished climb has no running clock to reopen its read-back for us.
          if (returnKind === 'hut') this.climbIntro();
          else if (returnKind === 'title') this.titlePage();
          else if (this.season.over) this.seasonPage();
          else if (c.over) this.debriefPage();
          else this.closePage();
        });
        el.querySelector<HTMLElement>('[data-a="send"]')?.addEventListener('click', () => this.sendRun());
      },
    );
  }

  private sendRun(): void {
    this.feedbackPage();
  }

  private exportedAt = -Infinity;

  private exportRun(): void {
    // One download per tap burst.
    if (performance.now() - this.exportedAt < 3000) return;
    this.exportedAt = performance.now();
    const data = this.runExport();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rope-${this.climb.mountain}-${this.climb.seed}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private ending = false;
  private releaseBoundary: { climb: ClimbState; promise: Promise<void> } | null = null;
  private boundaryCheckpoint: {
    climb: ClimbState;
    signature: string;
    promise: Promise<void>;
    settled: boolean;
  } | null = null;

  /** One attempt per completed state. A later release changes the state and gets a new attempt. */
  private checkpointBoundary(): Promise<void> {
    const climb = this.climb;
    if (this.entry === 'file' || !climb?.over) return Promise.resolve();
    const signature = snapshot(climb);
    const existing = this.boundaryCheckpoint;
    if (existing?.climb === climb && existing.signature === signature) return existing.promise;
    if (!this.continuity.shelf?.enabled) return Promise.resolve();
    const promise = this.continuity
      .checkpointAll()
      .then(() => {
        if (this.current() && this.climb === climb) this.save();
      })
      .catch((error: unknown) => {
        if (this.current() && this.climb === climb) this.continuity.status = String(error);
      });
    const checkpoint = { climb, signature, promise, settled: false };
    this.boundaryCheckpoint = checkpoint;
    void promise.then(() => {
      checkpoint.settled = true;
    });
    return promise;
  }

  private endClimb(): void {
    if (this.ending) return;
    this.ending = true;
    this.playing = false;
    this.save();
    void this.checkpointBoundary();
    const c = this.climb;
    // The stamp reads the same day account as the journal's last line and the read-back.
    this.stamp(dayAccount(c).stamp);
    this.endAt = performance.now() + 2600;
  }

  private debriefPage(): void {
    // Back from the journal may reach the read-back before the ending stamp expires.
    // Cancel that transition before the player can start another climb.
    this.endAt = 0;
    const c = this.climb;
    this.reckoningFacts = c.over ? [factsOf(c)] : [];
    lab!.screen(climbScreen(c, 'debrief'));
    for (const name of climbMilestones(c)) lab!.milestone(name);
    const m = MOUNTAINS[c.mountain];
    const outcomes = c.members
      .map((mem) => {
        const p = { ...factsFor(c, mem.id) };
        return `<div class="outcome"><b>${esc(memberOf(mem.id).name)}</b><span>${esc(memberOf(mem.id).name)} ${esc(displayText(outcomeWords(c, p)))}.</span></div>`;
      })
      .join('');
    const story = c.journal
      .filter((j) => j.story)
      .map((j) => `<p class="hand">${esc(displayText(j.text))}</p>`)
      .join('');
    this.openPage(
      `<div class="page-body"><h1>${esc(m?.name ?? '')}</h1>
      <p class="sub">What happened today</p>
      ${outcomes}
      <div data-reckoning-result></div>
      <details class="departure"><summary>End a person’s mountain trip</summary><p>You can ask after everyone returns to the hut and finishes their work. Each person can refuse.</p>${MEMBERS.map((member) => `<button class="btn" data-depart="${member.id}">Ask ${esc(member.name)} to end this trip</button>`).join('')}<p data-depart-status role="status"></p></details>
      ${story}
      <h2>That night at the hut</h2>
      <div class="camp" data-camp><p class="caption">They talk a little beside the stove…</p></div>
      <h2>One thing you said</h2>
      <div class="branch" data-branch><p class="caption">Checking how the outcome changes when one input is removed…</p></div>
      <button class="btn" data-a="journal">The journal ▸</button></div>
      <div class="page-actions"><div class="end-secondaries"><button class="btn" data-a="send">Feedback</button><a class="menu-link" href="https://human.adamwhite.work/lab/people/">People across games</a></div><p data-checkpoint-status role="status"></p><button class="btn go" data-a="next">${c.climbNo < SEASON.length ? `On to ${esc(SEASON[c.climbNo]?.name ?? '')}` : 'Close the season'}</button></div>`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="journal"]')?.addEventListener('click', () => {
          this.journalPage();
        });
        el.querySelector<HTMLElement>('[data-a="send"]')?.addEventListener('click', () => this.sendRun());
        el.querySelector<HTMLElement>('[data-a="next"]')?.addEventListener('click', () => this.advance());
      },
      'debrief',
    );
    this.pageEl?.querySelectorAll<HTMLButtonElement>('[data-depart]').forEach((button) => {
      button.onclick = () => {
        const who = button.dataset.depart;
        if (!who || this.releaseBoundary?.climb === this.climb) return;
        const climb = this.climb;
        const status = this.pageEl?.querySelector<HTMLElement>('[data-depart-status]');
        if (status)
          status.textContent = 'Waiting for the request and its actual work to finish. Time is paused.';
        const task = (async () => {
          await this.checkpointBoundary();
          if (!this.current() || this.climb !== climb) return;
          await this.flushSave();
          if (!this.current() || this.climb !== climb) return;
          this.send({ t: 'release-person', to: who });
          const published = this.climb;
          if (this.releaseBoundary?.climb === climb) this.releaseBoundary.climb = published;
          await this.flushSave();
          if (!this.current() || this.climb !== published) return;
          const requested =
            this.entry === 'file' ? (JSON.parse(snapshot(published)) as ClimbState) : published;
          const input = requested.inputs.length - 1;
          // A departure has a real five-minute activity. It may be refused or
          // delayed by body work; never replace either outcome with a projection.
          const until = requested.minute + 30;
          while (
            this.current() &&
            this.climb === published &&
            requested.minute < until &&
            (requested.hfRequests[who] || requested.hfQueue.length || requested.hfPhase)
          ) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (!this.current() || this.climb !== published) return;
            advanceFrame(requested);
          }
          if (!this.current() || this.climb !== published) return;
          if (this.entry === 'file') {
            if (!this.fitsFile(requested)) return;
            this.climb = requested;
            this.continuity.attach({ season: this.season, climb: requested });
          }
          this.afterStep();
          const answer = requested.lines.findLast((line) => line.input === input && line.who === who);
          if (status)
            status.textContent = requested.hfReleased[who]
              ? `${memberOf(who).name} ended this mountain trip at the hut.`
              : answer
                ? `${memberOf(who).name}: “${displayText(answer.says)}”${requested.hfRequests[who] ? ' The work is still unfinished. You can continue this season.' : ''}`
                : 'The request has no recorded answer yet. You can continue this season.';
          this.save();
          await this.checkpointBoundary();
        })();
        const release = { climb, promise: task };
        this.releaseBoundary = release;
        void task.finally(() => {
          if (this.releaseBoundary === release) this.releaseBoundary = null;
        });
      };
    });
    this.renderReckoning();
    this.runCamp(m?.name ?? '');
    this.runDebrief();
  }

  private branch: Branch | null | undefined = undefined;

  /** Camp talk: a model may voice it from the climb's HF records and journal; its text is never read into state. */
  private runCamp(mountain: string): void {
    // Owner input gate: core-fun acceptance must precede any camp inference.
    // The Worker cap, kill switch and labelled fallback remain available downstream.
    const facts = campFacts(this.climb, mountain);
    const box = this.pageEl?.querySelector<HTMLElement>('[data-camp]');
    if (box)
      box.innerHTML = `${campFallback(facts)
        .map((line) => `<p class="hand">${esc(displayText(line))}</p>`)
        .join('')}<p class="caption">These lines come from the journal. No language model was used.</p>`;
  }

  private runDebrief(): void {
    const climb = this.climb;
    const generation = this.pageGeneration;
    const show = (b: Branch | null) => {
      if (this.climb !== climb || this.pageGeneration !== generation) return;
      this.branch = b;
      const el = this.pageEl?.querySelector<HTMLElement>('[data-branch]');
      if (!el) return;
      el.innerHTML = b
        ? `<p>${esc(displayText(b.sentence))}</p><p class="caption">${esc(displayText(ALTERNATIVE_CAPTION))}</p>`
        : '<p>We checked selected inputs one at a time. We found no change in the recorded outcomes when we removed each of those inputs.</p>';
    };
    if (this.branch !== undefined) {
      show(this.branch);
      return;
    }
    const w = new Worker(new URL('./debrief.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.debriefWorker = w;
    w.onmessage = (e: MessageEvent<{ branch: Branch | null }>) => {
      show(e.data.branch);
      w.terminate();
    };
    w.postMessage({ start: this.start, played: snapshot(this.climb) });
  }

  private advance(): void {
    if (
      !this.releaseBoundary &&
      (this.entry === 'file' ||
        (!this.continuity.shelf?.enabled && (!this.boundaryCheckpoint || this.boundaryCheckpoint.settled)))
    ) {
      void this.advanceNow();
      return;
    }
    void this.advanceAfterCheckpoint();
  }

  private async advanceAfterCheckpoint(): Promise<void> {
    const climb = this.climb;
    {
      const status = this.pageEl?.querySelector<HTMLElement>('[data-checkpoint-status]');
      if (status) status.textContent = 'Waiting to save available histories before continuing.';
      if (this.releaseBoundary?.climb === climb) await this.releaseBoundary.promise;
      if (!this.current() || this.climb !== climb) return;
      let signature: string;
      do {
        signature = snapshot(climb);
        await this.checkpointBoundary();
        if (!this.current() || this.climb !== climb) return;
      } while (snapshot(climb) !== signature);
      if (status) status.textContent = this.continuity.status;
    }
    await this.advanceNow();
  }

  private transitioning = false;

  private async advanceNow(): Promise<void> {
    if (this.transitioning || !this.current()) return;
    this.transitioning = true;
    const original = this.climb;
    const generation = this.fileGeneration,
      page = this.pageGeneration;
    let installed = false;
    const current = () =>
      this.current() &&
      this.climb === original &&
      generation === this.fileGeneration &&
      page === this.pageGeneration;
    const status = this.pageEl?.querySelector<HTMLElement>('[data-checkpoint-status]');
    const buttons = [...(this.pageEl?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    for (const button of buttons) button.disabled = true;
    if (status) status.textContent = 'Time is paused while the days in the valley are prepared.';
    try {
      const season = structuredClone(this.season);
      const played = JSON.parse(snapshot(this.climb)) as ClimbState;
      const frames = nextClimbFrames(season, played, this.branch ?? null);
      let result = frames.next();
      while (!result.done) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (!current()) return;
        result = frames.next();
      }
      if (!current()) return;
      const next = result.value;
      if (!this.fitsFile(next ?? played, season, next ? (season.start ?? snapshot(next)) : this.start))
        return;
      this.season = season;
      installed = true;
      this.branch = undefined;
      this.ending = false;
      if (!next) {
        this.save();
        this.seasonPage();
        return;
      }
      this.begin(next, this.season.start ?? snapshot(next));
    } catch (error) {
      if (current() && status) status.textContent = `The next climb was not installed. ${String(error)}`;
    } finally {
      this.transitioning = false;
      for (const button of buttons) button.disabled = false;
      if (installed && this.current() && generation === this.fileGeneration) this.save();
    }
  }

  private seasonPage(): void {
    this.reckoningFacts = this.season.over ? this.season.history.map((day) => day.facts) : [];
    lab!.screen('season');
    lab!.milestone('season done');
    const hist = this.season.history
      .map((x) => {
        const m = MOUNTAINS[x.mountain];
        const tops = Object.entries(x.facts)
          .filter(([, f]) => f.summit)
          .map(([id]) => memberOf(id).name);
        const down = Object.values(x.facts).filter((f) => f.home).length;
        return `<h2>${esc(m?.name ?? '')}</h2>
          <p>${tops.length ? `${esc(tops.join(', '))} reached the summit.` : 'Nobody reached the summit.'} ${down === 5 ? 'Everyone returned to the hut by dark.' : `${down} of five people returned to the hut by dark.`}</p>
          ${x.branch ? `<p class="branch">${esc(displayText(x.branch.sentence))}</p>` : ''}
          ${x.notes.map((n) => `<p class="hand">${esc(displayText(n))}</p>`).join('')}`;
      })
      .join('');
    this.openPage(
      `<div class="page-body"><h1>The season</h1>
      ${this.peaksSvg(this.season.history.length)}
      ${hist}
      <div data-reckoning-result></div>
      ${this.entry === 'file' ? '<p>Progress stays in memory. Download before closing.</p>' : '<div data-season-confirm hidden><p>A new game replaces this season’s saved notebook.</p><button class="btn" data-season-yes>Start new game</button><button class="btn" data-season-no>Keep this game</button></div>'}
      </div><div class="page-actions"><div class="end-secondaries"><button class="btn" data-a="send">Feedback</button><a class="menu-link" href="https://human.adamwhite.work/lab/people/">People across games</a></div>${this.entry === 'file' ? '<button class="btn" data-file-export>Download this file session</button><button class="btn go" data-file-choose>Choose another file</button>' : '<button class="btn go" data-a="new">New game</button>'}</div>`,
      (el) => {
        el.querySelector('[data-file-export]')?.addEventListener('click', () => this.exportRun());
        el.querySelector('[data-file-choose]')?.addEventListener('click', () => this.filePage());
        el.querySelector<HTMLElement>('[data-a="new"]')?.addEventListener('click', () =>
          el.querySelector<HTMLElement>('[data-season-confirm]')?.removeAttribute('hidden'),
        );
        el.querySelector('[data-season-yes]')?.addEventListener('click', () => void this.newGame());
        el.querySelector('[data-season-no]')?.addEventListener('click', () =>
          el.querySelector<HTMLElement>('[data-season-confirm]')?.setAttribute('hidden', ''),
        );
        el.querySelector('[data-a="send"]')?.addEventListener('click', () => this.sendRun());
        el.querySelector('[data-a="export"]')?.addEventListener('click', () => this.exportRun());
      },
      'season',
    );
    this.renderReckoning();
  }
}

import { factsOf } from '../sim/debrief.ts';

function factsFor(c: ClimbState, id: string) {
  const f = factsOf(c)[id];
  if (!f) throw new Error('no facts');
  return f;
}

// Refuse oversized or unsafe input before replay or installation. No archive is shortened to fit.
const FILE_BYTES = 128 * 1024 * 1024;
const SESSION_BYTES = 512 * 1024 * 1024;
function finiteJSON(text: string, limit = FILE_BYTES): any {
  if (new TextEncoder().encode(text).byteLength > limit)
    throw new Error('This file is too large to preserve completely.');
  const value = JSON.parse(text);
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 8_000_000 || depth > 128) throw new Error('This file exceeds the complete-state limits.');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Nonfinite state is unsupported.');
    if (!v || typeof v !== 'object') return;
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe file property.');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return value;
}
const sameFileValue = (a: unknown, b: unknown) => canonicalPersona(a) === canonicalPersona(b);
function exactFileUTF8(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(text);
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== text)
    throw new Error('The original text cannot round-trip as exact UTF8.');
  return bytes;
}
function fileInterpretation(text: string): string {
  exactFileUTF8(text);
  // JSON interpretation alone may omit the BOM; retained text and its digest never do.
  return text.startsWith('\ufeff') ? text.slice(1) : text;
}
async function fileDigest(text: string): Promise<string> {
  return fileByteDigest(exactFileUTF8(text));
}
async function fileByteDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
async function validateFileSources(save: Save, original?: Ownership): Promise<void> {
  const ownership = save.ownership;
  if (
    !ownership ||
    typeof ownership.runId !== 'string' ||
    typeof ownership.fileOrigin !== 'boolean' ||
    !Array.isArray(ownership.heads) ||
    !Array.isArray(ownership.sources)
  )
    throw new Error('Invalid file provenance.');
  const records = [
    ...ownership.heads,
    ...(original?.heads ?? []),
    ...(save.season.chapter?.claims ?? []),
    ...(save.season.chapter?.inputs ?? []),
  ];
  await Promise.all(records.map((p) => validatePersona(p)));
  const pool = ownership.archives ?? [];
  if (!Array.isArray(pool) || new Set(pool.map((a) => a.sha256)).size !== pool.length)
    throw new Error('Invalid complete source archive pool.');
  const verified = new Map<string, ReturnType<typeof validatedHF>>();
  for (const archive of pool) {
    if (
      !archive ||
      typeof archive.raw !== 'string' ||
      typeof archive.sha256 !== 'string' ||
      (await fileDigest(archive.raw)) !== archive.sha256
    )
      throw new Error('The complete source archive does not match its receipt.');
    const data = validatedHF(finiteJSON(archive.raw, SESSION_BYTES));
    const replayed = replayHF(data);
    if (!replayed.ok || !replayed.value.verified || replayed.value.fullHash !== data.hashes.full)
      throw new Error('The complete source archive does not replay exactly.');
    verified.set(archive.sha256, data);
  }
  for (const source of ownership.sources) {
    if (
      !source ||
      typeof source.revision !== 'string' ||
      !source.envelope ||
      !source.source ||
      typeof source.archiveSha256 !== 'string'
    )
      throw new Error('Invalid complete source archive.');
    const envelope = await validatePersona(source.envelope);
    if (envelope.revision !== source.revision || !sameFileValue(envelope.source, source.source))
      throw new Error('The source archive has no matching provenance.');
    const archive = verified.get(source.archiveSha256);
    const receipt = (
      envelope.terminal ? envelope.transfer.terminalCheckpoint : envelope.transfer.checkpoint
    ) as { sha256?: string; atMs?: number } | undefined;
    if (!archive || receipt?.sha256 !== source.archiveSha256 || receipt.atMs !== archive.current.at)
      throw new Error('The complete source archive does not match its receipt.');
    const restored = restoreRun(archive);
    if (!restored.ok) throw new Error('The complete source archive cannot be restored.');
    if (!envelope.terminal) {
      portableOf(envelope);
      const portable = envelope.transfer.portable as { source?: { personId?: string } } | undefined;
      const who = portable?.source?.personId;
      if (!who) throw new Error('The source person is unavailable.');
      const reading = inspect(restored.value, {
        perspective: { kind: 'host' },
        people: [who],
        select: ['persona'],
        portable: { person: who, castId: envelope.castId, castRevision: envelope.castRevision },
      });
      if (!reading.ok) throw new Error('The source person cannot be projected.');
      const projection = reading.value.people[0]?.parts.find((p) => p.select === 'persona')?.value;
      if (!sameFileValue(projection, envelope.transfer.portable))
        throw new Error('The saved person differs from the complete source archive.');
    }
  }
}
function validatedHF(value: unknown) {
  const result = restoreRun(value as Parameters<typeof restoreRun>[0]);
  if (!result.ok)
    throw new Error(
      'This HF archive uses an unsupported version or invalid state. Keep the file and start fresh.',
    );
  return value as RunArchive;
}
function validatedCurrent(text: string): ClimbState {
  const state = finiteJSON(text) as ClimbState;
  validatedHF(state.hf);
  return state;
}
function checkReplayBudget(start: string, inputs: ClimbState['inputs'], minute: number): void {
  const initial = finiteJSON(start);
  if (
    !Number.isSafeInteger(initial.minute) ||
    !Number.isSafeInteger(minute) ||
    minute < initial.minute ||
    minute > initial.minute + 10080 ||
    !Array.isArray(inputs) ||
    inputs.length > 10000
  )
    throw new Error('Unsupported replay boundary.');
  let previous = initial.minute;
  for (const input of inputs) {
    if (
      !input ||
      typeof input.t !== 'string' ||
      !Number.isSafeInteger(input.at) ||
      input.at < previous ||
      input.at > minute + 1
    )
      throw new Error('Unsupported input boundary.');
    previous = input.at;
  }
}
function checkPublicReplay(
  raw: ReturnType<typeof exportClimb> & { castSources?: unknown; castArchives?: unknown },
): ClimbState {
  if (!raw || raw.game !== 'rope' || raw.v !== 2 || raw.engine !== FRAMEWORK_VERSION)
    throw new Error('Unsupported public Rope export.');
  const state = validatedCurrent(raw.state);
  checkReplayBudget(raw.start, raw.inputs, state.minute);
  for (const prior of raw.past ?? [])
    checkReplayBudget(prior.start, prior.inputs, finiteJSON(prior.state).minute);
  const climb = replayExport(raw);
  const { castSources: _sources, castArchives: _archives, ...packet } = raw;
  if (!sameFileValue(packet, exportClimb(raw.start, climb, FRAMEWORK_VERSION, raw.chapter, raw.past)))
    throw new Error('The public export metadata does not match its complete replay.');
  return climb;
}
function nativeFileSave(raw: Save): { save: Save; climb: ClimbState; start: string } {
  if (
    !raw ||
    raw.v !== 2 ||
    raw.engine !== ENGINE_VERSION ||
    typeof raw.state !== 'string' ||
    !raw.season ||
    !Array.isArray(raw.inputs) ||
    !Number.isSafeInteger(raw.minute) ||
    typeof raw.over !== 'boolean' ||
    !raw.disclosure ||
    typeof raw.disclosure !== 'object'
  )
    throw new Error('Unsupported native Rope file.');
  const save = structuredClone(raw);
  const start = save.start || save.season.start || '';
  const initial = finiteJSON(start);
  checkReplayBudget(start, save.inputs, save.minute);
  if (
    save.minute < initial.minute ||
    save.minute > initial.minute + 10080 ||
    save.inputs.length > 10000 ||
    !Array.isArray(save.disclosure.unlocked) ||
    !Array.isArray(save.disclosure.seen) ||
    !save.disclosure.unlocked.every((x) =>
      ['insist', 'tell', 'promise', 'rope', 'fix', 'pack', 'share'].includes(x),
    ) ||
    !save.disclosure.seen.every((x) => typeof x === 'string')
  )
    throw new Error('Unsupported replay or disclosure boundary.');
  if (save.season.chapter) checkChapter(save.season.chapter);
  for (const entry of save.season.past ?? []) {
    finiteJSON(entry.start);
    checkReplayBudget(entry.start, entry.inputs, finiteJSON(entry.state).minute);
  }
  const past = save.season.past ?? [];
  const season = validateSeasonStart(
    save.season.seed,
    save.season.chapter,
    save.season.over ? past.slice(0, -1) : past,
    start,
  );
  const retained = validatedCurrent(save.state);
  const climb = replay(start, save.inputs, save.minute, undefined, retained.hfPhase);
  if (snapshot(climb) !== save.state) throw new Error('The complete native state does not replay exactly.');
  if (climb.minute !== save.minute || climb.over !== save.over || climb.seed !== save.season.seed)
    throw new Error('Native replay does not match its saved boundary.');
  if (save.season.over) {
    const last = past.at(-1);
    if (
      !last ||
      last.start !== start ||
      last.state !== snapshot(climb) ||
      !sameFileValue(last.inputs, climb.inputs) ||
      nextClimb(season, structuredClone(climb), last.branch) !== null
    )
      throw new Error('Invalid completed season.');
  }
  if (!sameFileValue(season, save.season)) throw new Error('The complete season does not match its replay.');
  return { save, climb, start };
}
async function decodeFile(text: string, selectedDigest?: string) {
  const interpretation = fileInterpretation(text);
  if (selectedDigest !== undefined && (await fileDigest(text)) !== selectedDigest)
    throw new Error('The selected UTF8 bytes do not match the retained source.');
  const raw = finiteJSON(interpretation, SESSION_BYTES);
  let prepared: ReturnType<typeof nativeFileSave>;
  let original: { text: string; sha256: string; ownership?: Ownership };
  if (raw.format === 'rope-file-session/2') {
    if (
      !raw.original ||
      typeof raw.original.text !== 'string' ||
      typeof raw.original.sha256 !== 'string' ||
      finiteJSON(fileInterpretation(raw.original.text)).format
    )
      throw new Error('Invalid original file provenance.');
    const origin = await decodeFile(raw.original.text);
    if (origin.original.sha256 !== raw.original.sha256 || !sameFileValue(origin.original, raw.original))
      throw new Error('The original file digest or ownership differs.');
    prepared = nativeFileSave(raw.native);
    const current = raw.current;
    if (!current || current.game !== 'rope' || current.engine !== FRAMEWORK_VERSION)
      throw new Error('Unsupported public Rope export.');
    const currentClimb = checkPublicReplay(current);
    if (
      snapshot(currentClimb) !== snapshot(prepared.climb) ||
      !sameFileValue(current, {
        ...exportClimb(
          prepared.start,
          prepared.climb,
          FRAMEWORK_VERSION,
          prepared.save.season.chapter,
          prepared.save.season.past,
        ),
        castSources: prepared.save.ownership?.sources ?? [],
        castArchives: prepared.save.ownership?.archives ?? [],
      })
    )
      throw new Error('The complete current state does not match its native replay.');
    const base = origin.save;
    const played =
      prepared.climb.climbNo === origin.climb.climbNo
        ? { start: prepared.start, inputs: prepared.climb.inputs }
        : prepared.save.season.past?.[origin.climb.climbNo - 1];
    if (
      prepared.climb.seed !== origin.climb.seed ||
      !played ||
      played.start !== origin.start ||
      !sameFileValue(played.inputs.slice(0, base.inputs.length), base.inputs) ||
      !sameFileValue(prepared.save.ownership?.sources, base.ownership?.sources) ||
      !sameFileValue(prepared.save.ownership?.archives ?? [], base.ownership?.archives ?? []) ||
      !sameFileValue(prepared.save.season.chapter, base.season.chapter) ||
      prepared.save.ownership?.heads.length ||
      prepared.save.ownership?.fileOrigin !== true
    )
      throw new Error('This file session does not continue its original provenance.');
    original = origin.original;
  } else {
    finiteJSON(interpretation);
    if (raw.format) throw new Error('Unsupported Rope file format.');
    if (raw.game === 'rope') {
      if (raw.engine !== FRAMEWORK_VERSION) throw new Error('Unsupported public Rope export edition.');
      const climb = checkPublicReplay(raw);
      const season = validateSeasonStart(climb.seed, raw.chapter, raw.past ?? [], raw.start);
      prepared = {
        climb,
        start: raw.start,
        save: {
          v: 2,
          state: snapshot(climb),
          engine: ENGINE_VERSION,
          season,
          start: raw.start,
          inputs: structuredClone(climb.inputs),
          minute: climb.minute,
          disclosure: newDisclosure(),
          over: climb.over,
          ownership: {
            runId: crypto.randomUUID(),
            heads: [],
            fileOrigin: true,
            sources: structuredClone(raw.castSources ?? []),
            archives: structuredClone(raw.castArchives ?? []),
          },
        },
      };
    } else prepared = nativeFileSave(raw);
    original = {
      text,
      sha256: await fileDigest(text),
      ...(raw.ownership ? { ownership: structuredClone(raw.ownership) } : {}),
    };
  }
  await validateFileSources(prepared.save, original.ownership);
  prepared.save.ownership = { ...prepared.save.ownership!, heads: [], fileOrigin: true };
  // Measure the actual complete envelope before play. The original bytes are retained once.
  const measured = JSON.stringify({
    format: 'rope-file-session/2',
    original,
    native: prepared.save,
    current: {
      ...exportClimb(
        prepared.start,
        prepared.climb,
        FRAMEWORK_VERSION,
        prepared.save.season.chapter,
        prepared.save.season.past,
      ),
      castSources: prepared.save.ownership.sources,
      castArchives: prepared.save.ownership.archives ?? [],
    },
  });
  finiteJSON(measured, SESSION_BYTES);
  if (!raw.format && new TextEncoder().encode(measured).byteLength > FILE_BYTES)
    throw new Error('This file leaves insufficient space for a complete session export.');
  return { ...prepared, original };
}
