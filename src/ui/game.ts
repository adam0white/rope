/**
 * The browser game: clock and tactical slowdown, the thumb sheet, speech bubbles, margin notes, and the notebook
 * pages (title, journal, debrief, season). All play goes through `queueInput` + `step`, so the save is the start
 * state and the input log, and the export replays exactly.
 */

import { FRAMEWORK_VERSION, voiceOf } from '@adam0white/human-framework';
import { campFacts, campFallback } from '../sim/camp.ts';
import {
  approachEstimate,
  type ClimbState,
  canHear,
  clock,
  dayAccount,
  distance,
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
import { coldAt, legsUp, SEASON } from '../sim/mountain.ts';
import { MEMBERS, memberOf } from '../sim/party.ts';
import { exportClimb, newSeason, nextClimb, type SeasonState } from '../sim/season.ts';
import { haltReason, hurtCall, namesOf, onlyWalkingLeft, promiseDue } from './calls.ts';
import { type Disclosure, has, markSeen, type Note, newDisclosure, nextNote } from './disclosure.ts';
import { icon } from './icons.ts';
import { lab } from './lab.ts';
import { climbMilestones, climbScreen } from './labnames.ts';
import { moodWord } from './look.ts';
import { PACE } from './pace.ts';
import { attentionNeeded, eventStamp, playbackRate } from './playback.ts';
import { Scene } from './scene.ts';

const SAVE_KEY = 'rope.save.v1';
const SLOW_MS = PACE.slowMs;
const BUBBLE_MS = 7500;

interface Save {
  v: 1;
  season: SeasonState;
  start: string;
  inputs: ClimbState['inputs'];
  minute: number;
  disclosure: Disclosure;
  over: boolean;
}

type Panel = 'main' | 'more' | 'calls' | 'force' | 'partner' | 'tell' | 'promise' | 'route' | 'scout';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const esc = (t: string): string =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const bold = (t: string): string => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export class Game {
  private root: HTMLElement;
  private scene = new Scene();
  private top = h('div', 'top');
  private whereEl = h('div', 'where');
  private paceEl = h('div', 'clock-rate');
  private sceneEl = h('div', 'scene');
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
  }

  async boot(): Promise<void> {
    await document.fonts?.ready;
    const mark = h('a', 'mark', '◇ human framework');
    (mark as HTMLAnchorElement).href = 'https://human.adamwhite.work';
    this.top.append(mark, this.whereEl, this.paceEl);
    const menu = h('button', '', 'Game menu');
    menu.onclick = () => this.gameMenu();
    this.top.append(menu);
    this.sceneEl.append(this.bubblesEl, this.stampEl);
    const jb = h('button', 'drawer-btn', 'journal');
    jb.onclick = () => this.journalPage();
    this.sceneEl.append(jb);
    // The margin note is docked between the top bar and the map: it takes room from the map, never covers it.
    this.root.append(this.top, this.noteEl, this.sceneEl, this.movementEl, this.sheet);
    await this.scene.mount(this.sceneEl);
    this.scene.onTap = (id) => {
      if (id === 'leader') return;
      this.pickTarget(id);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    requestAnimationFrame(() => this.frame());
    this.titlePage();
  }

  // ------------------------------------------------------------ season and saves

  private load(): Save | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as Save) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    if (!this.climb || !this.season) return;
    const s: Save = {
      v: 1,
      season: this.season,
      // The season already holds this climb's start: write it once, not twice (halves the save).
      start: this.start === this.season.start ? '' : this.start,
      inputs: this.climb.inputs,
      minute: this.climb.minute,
      disclosure: this.disc,
      over: this.climb.over,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      // Storage full or blocked: the game plays on without a save.
    }
  }

  private newGame(): void {
    const seed = (Date.now() % 1_000_000_007) | 0;
    const { season, climb } = newSeason(seed);
    this.season = season;
    this.disc = newDisclosure();
    this.begin(climb, season.start ?? snapshot(climb));
  }

  private resume(sv: Save): void {
    this.season = sv.season;
    this.disc = sv.disclosure;
    const start = sv.start || sv.season.start || '';
    const c = replay(start, sv.inputs, sv.minute);
    this.begin(c, start, true);
    lab.screen(climbScreen(c, 'climb'));
    if (c.over || sv.over) this.endClimb();
  }

  private begin(c: ClimbState, start: string, resumed = false): void {
    this.climb = c;
    this.start = start;
    this.shownLines = resumed ? c.lines.length : 0;
    this.shownJournal = resumed ? c.journal.length : 0;
    this.target = 'all';
    this.verb = null;
    this.panel = 'main';
    this.note = null;
    this.acc = 0;
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
    // A new climb starts with fresh presentation deadlines.
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
    const now = performance.now();
    const elapsed = Math.max(0, now - this.last);
    const dt = Math.min(0.1, elapsed / 1000);
    const held =
      this.pageOpen() || !!this.menuEl || !!document.querySelector(':popover-open') || document.hidden;
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
      if (this.skipping && (!onlyWalkingLeft(this.climb) || attentionNeeded(this.climb)))
        this.skipping = false;
      const rate = playbackRate(
        this.panel !== 'main' || this.verb !== null,
        now < this.slowUntil,
        attentionNeeded(this.climb),
        this.skipping,
      );
      if (rate === 0) this.acc = 0;
      this.acc += dt * rate;
      let n = 0;
      while (this.acc >= 1 && n < 40 && !this.climb.over) {
        const before = eventStamp(this.climb);
        const readBefore = this.slowUntil;
        step(this.climb);
        this.acc -= 1;
        n++;
        this.afterStep();
        if (
          eventStamp(this.climb) !== before ||
          this.slowUntil > readBefore ||
          (this.skipping && !onlyWalkingLeft(this.climb))
        ) {
          this.skipping = false;
          this.acc = 0;
          this.slow();
          break;
        }
      }
    } else this.acc = 0;
    if (this.playing && this.climb?.over) this.endClimb();
    if (!held && this.endAt && now >= this.endAt) this.debriefPage();
    if (this.climb) {
      this.scene.selected = this.target === 'all' ? null : this.target;
      this.scene.draw(this.climb, dt);
      this.placeBubbles(now);
      if (now - this.uiTick > 300) {
        this.uiTick = now;
        this.renderTop();
        this.quietHint();
        this.renderSheet(true);
      }
      if (now - this.lastSave > 4000) {
        this.lastSave = now;
        this.save();
      }
    }
    requestAnimationFrame(() => this.frame());
  }

  private afterStep(): void {
    const c = this.climb;
    for (; this.shownLines < c.lines.length; this.shownLines++) {
      const l = c.lines[this.shownLines];
      if (l) this.showLine(l);
    }
    for (; this.shownJournal < c.journal.length; this.shownJournal++) {
      const j = c.journal[this.shownJournal];
      if (!j) continue;
      if (/fell|slipped|turned for home|would not|put you off|summit\.|stood on the summit/.test(j.text))
        this.slow();
      if (j.text.includes('stood on the summit') && j.who)
        this.stamp(`Summit · ${memberOf(j.who).name} · ${clock(j.at)}`);
      if (j.story) this.showStory(j.text);
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
    this.stampEl.textContent = text;
    this.stampEl.classList.add('on');
    this.stampUntil = performance.now() + 4200;
  }

  // ------------------------------------------------------------ input

  /** Taps right after a send are dropped: the sheet rebuilds under the finger, and a second tap would land elsewhere. */
  private sentAt = 0;

  private send(inp: NewInput, also?: NewInput): void {
    const c = this.climb;
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
        climb: 'on we go',
        descend: 'we turn back',
        rest: 'take a rest',
        eat: 'eat something',
        wait: 'wait here',
        rope: `rope up with ${inp.with ? memberOf(inp.with).name : ''}`,
        pack: 'give me your pack',
        ahead: 'go on ahead and call down what you see',
        escort: `go down with ${inp.with ? memberOf(inp.with).name : 'them'}`,
        gather: 'close up and wait for each other',
      };
      const tone = inp.force === 'ask' ? '?' : inp.force === 'urge' ? '.' : '. Now.';
      words = `${who}, ${what[inp.act] ?? inp.act}${tone}`;
    } else if (inp.t === 'tell') words = FACTS[inp.fact].words.replace(/^./, (x) => x.toUpperCase());
    else if (inp.t === 'promise') words = `We turn back at ${inp.hour}:00. Wherever we are.`;
    else if (inp.t === 'share') words = 'Here, have some of mine.';
    else if (inp.t === 'fix') words = 'Wait, I’ll fix a rope.';
    else if (inp.t === 'scout') words = 'Wait here. I’ll go and look.';
    if (words) this.bubble('leader', words, 'mine');
    if (this.climb.unheard.includes(this.climb.inputs.length - 1))
      this.bubble('leader', `${words} …nobody near enough to hear.`, 'mine');
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

  private trustSeen = new Map<string, number>();

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
    // Pressure shows, never as a number: when HF lowers their trust in you, they look away as they answer.
    const p = this.climb.people.find((x) => x.id === l.who);
    const trust = p ? (voiceOf(p, 'leader')?.trust ?? 0.5) : 0.5;
    const was = this.trustSeen.get(l.who) ?? trust;
    this.trustSeen.set(l.who, trust);
    const turned = trust < was - 0.01 ? ` (${memberOf(l.who).they} looks away)` : '';
    this.bubble(l.who, l.says + turned, cls);
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
    const text = halt ?? (quiet ? 'A quiet stretch. The walk moves briskly until something happens.' : null);
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
    b.el.innerHTML = `<span class="who">${esc(name)}</span>${esc(text)}`;
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
    this.noteEl.innerHTML = `<button aria-label="dismiss">got it</button>${bold(n.text)}`;
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
    this.noteEl.innerHTML = `<span class="hand">${esc(text)}</span>`;
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
    this.whereEl.textContent = `${m?.name ?? ''} · ${clock(c.minute)}`;
    this.paceEl.textContent =
      this.menuEl || this.pageOpen()
        ? 'Time waits'
        : this.panel !== 'main' || this.verb !== null
          ? 'Choosing · time waits'
          : performance.now() < this.slowUntil
            ? 'Reading the latest word'
            : attentionNeeded(c)
              ? 'A call needs attention'
              : 'Walking until something happens';
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
    sh.className = `sheet sheet-${this.panel}`;
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
      b.setAttribute('aria-label', label);
      b.onclick = () => this.pickTarget(id);
      chips.append(b);
    };
    const anyNear = c.members.some((x) => x.homeAt === null && canHear(c, x.id));
    mk('all', 'everyone', 'all', !anyNear);
    for (const x of MEMBERS) {
      const mem = memberState(c, x.id);
      const far = mem.homeAt === null && !canHear(c, x.id);
      const mood = moodWord(personOf(c, x.id), coldAt(c.seed, c.weather, c.minute, posXY(c, mem.pos).alt));
      mk(x.id, x.name, 'person', far, mem.homeAt !== null ? 'down' : far ? 'far' : mood);
    }
    const label = h('div', 'label');
    const tgt = this.target === 'all' ? 'everyone' : memberOf(this.target).name;
    label.innerHTML =
      this.panel === 'partner'
        ? `<span>rope ${esc(tgt)} to whom?</span>`
        : this.panel === 'force' && this.verb === 'rope' && this.partner
          ? `<span>rope ${esc(tgt)} to ${esc(memberOf(this.partner).name)}: how hard?</span>`
          : `<span>to ${esc(tgt)}</span><span>${c.members.some((x) => x.ropedTo) ? 'roped' : ''}</span>`;
    const cancel = h('button', '', 'cancel');
    cancel.onclick = () => {
      this.verb = null;
      this.partner = null;
      this.panel = 'main';
      this.renderSheet();
    };
    if (this.panel !== 'main') label.append(cancel);
    const targetControls = h('div', 'target-controls');
    targetControls.append(chips);
    if (this.panel === 'main') {
      const more = h('button', 'more-actions', 'more actions');
      if (this.note?.lit && !['lead', 'climb', 'with'].includes(this.note.lit)) more.classList.add('lit');
      more.onclick = () => {
        this.panel = 'more';
        this.renderSheet();
      };
      targetControls.append(more);
    }
    label.append(h('span', 'target-hint', 'swipe for people →'));
    sh.append(label, targetControls);
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
        `<span><b>${esc(nm)}</b> fell on ${esc(hurt.where)} and is hurt.${hurt.near ? '' : ' Too far to call to.'}</span>`,
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
        `<span><b>${due.hour}:00</b>, the hour you promised.${due.near.length ? ` In earshot: ${esc(namesOf(due.near))}.` : ''}${due.far.length ? ` Too far to hear: ${esc(namesOf(due.far))}.` : ''}</span>`,
      );
      const all = h('button', 'force', 'we all turn');
      all.onclick = () =>
        this.send({ t: 'lead', dir: 'down' }, { t: 'say', to: 'all', act: 'descend', force: 'urge' });
      bar.append(all);
      calls.append(bar);
    }
    if (
      this.panel === 'main' &&
      !hurt &&
      onlyWalkingLeft(c) &&
      !this.skipping &&
      !attentionNeeded(c) &&
      performance.now() >= this.slowUntil
    ) {
      const bar = h(
        'div',
        'ask-bar faint',
        '<span>The party is walking down. Stop at the next event.</span>',
      );
      const b = h('button', 'force', 'Until something happens');
      b.onclick = () => {
        if (attentionNeeded(c) || performance.now() < this.slowUntil || !onlyWalkingLeft(c)) return;
        this.skipping = true;
        this.acc = 0;
        this.renderSheet();
      };
      bar.append(b);
      sh.append(bar);
    }
    const queue = c.members
      .filter((x) => x.asks && x.homeAt === null)
      .sort((a, b) => (a.asks?.at ?? 0) - (b.asks?.at ?? 0));
    const asking = queue[0];
    if (asking && (this.panel === 'main' || this.panel === 'calls')) {
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
          : `<span><b>${esc(nm)}</b> is calling from ${below ? 'below' : 'above'}, too far to make out.</span>`,
      );
      for (const o of c.members) {
        if (o.id === asking.id || o.homeAt !== null || !canHear(c, o.id)) continue;
        const b = h('button', 'force', `send ${esc(memberOf(o.id).name)}`);
        b.onclick = () => this.send({ t: 'say', to: o.id, act: 'escort', force: 'ask', with: asking.id });
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

    if (calls.children.length && this.panel === 'main') {
      const call = h(
        'button',
        'calls-button',
        hurt ? 'hurt call' : due ? 'turnback due' : `${queue.length} company calls`,
      );
      call.onclick = () => {
        this.panel = 'calls';
        this.renderSheet();
      };
      targetControls.append(call);
    }

    if (this.panel === 'main') {
      sh.append(this.peopleVerbs(), this.leaderRow(), this.requestResult());
    } else if (this.panel === 'calls') {
      sh.append(calls);
    } else if (this.panel === 'more') {
      sh.append(this.peopleVerbs(), this.leaderRow());
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
      wrap.append(why);
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
    const unheard =
      one && memberState(c, this.target).homeAt !== null
        ? 'Back at the hut for today.'
        : 'Out of earshot; walk to them.';
    const chooseOne = !one ? 'Pick one person.' : '';
    const near = one && distance(c, memberState(c, this.target).pos, c.leader.pos) < 40;
    // Match the offer builder: the hut provides food without consuming carried rations.
    const foodAvailable = (x: ClimbState['members'][number]) =>
      x.rations > 0 || x.pos.place === MOUNTAINS[c.mountain]?.hut;
    const noFood = one
      ? !foodAvailable(memberState(c, this.target))
      : c.members.every((x) => x.homeAt !== null || !canHear(c, x.id) || !foodAvailable(x));
    const choose = (v: string) => () => {
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
            ? 'No food left; you can share yours.'
            : 'No food left; eat at the hut.',
      ),
      this.verbBtn('wait', 'wait', 'wait', ok, choose('wait'), unheard),
    );
    if (has(this.disc, 'tell'))
      g.append(this.verbBtn('ahead', 'go ahead', 'up', ok && one, choose('ahead'), chooseOne || unheard));
    if (has(this.disc, 'rope'))
      g.append(
        this.verbBtn(
          'rope',
          'rope up',
          'rope',
          ok && one && !memberState(c, this.target).ropedTo,
          choose('rope'),
          chooseOne || (!ok ? unheard : 'Already tied to a partner.'),
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
          chooseOne || (!ok ? unheard : !near ? 'Walk to them first.' : 'You already carry this pack.'),
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
          chooseOne || (!near ? 'Walk to them first.' : 'Your food is gone.'),
        ),
      );
    }
    for (const el of [...g.children].slice(5)) el.classList.add('secondary-action');
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
        'At the hut; climb first.',
      ),
      this.verbBtn(
        'stop',
        L.fixing ? 'fixing…' : 'stop',
        'stop',
        L.move !== null || !!L.follow || !!L.near,
        () => this.send({ t: 'lead', dir: 'stop' }),
        L.fixing ? 'Finish fixing the rope first.' : 'Standing still; start walking.',
      ),
    );
    // Walking with them: the whole party, or the one picked in the chips.
    const one = this.target !== 'all' ? MEMBERS.find((x) => x.id === this.target) : undefined;
    g.append(
      this.verbBtn(
        'with',
        one
          ? memberState(c, one.id).homeAt !== null
            ? `${one.name} is down`
            : `walk to ${one.name}`
          : L.follow === 'party'
            ? 'with them'
            : 'stay with them',
        'all',
        !one || memberState(c, one.id).homeAt === null,
        () => this.send({ t: 'lead', dir: one ? 'near' : 'with', who: one ? one.id : 'party' }),
        'Back at the hut for today.',
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
            ? 'Already looking; wait for your return.'
            : L.move
              ? 'Stop at a junction first.'
              : 'No path above to scout here.',
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
          'Nothing learned yet; scout a path.',
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
          `Turnback promised at ${c.promise?.hour}:00.`,
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
            ? 'Already fixing; wait until done.'
            : L.move
              ? 'Stop below a fixable leg first.'
              : 'No unfixed rope site above here.',
        ),
      );
    }
    const wrap = h('div');
    wrap.className = 'leader-controls';
    g.classList.add('movement-verbs');
    for (const el of [...g.children].slice(4)) el.classList.add('secondary-action');
    const lab = h('div', 'label', '<span>you</span>');
    if (c.promise) lab.append(h('span', '', `Turnback promised at ${c.promise.hour}:00.`));
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
    if (metres < 40) return `Close enough to help ${name}.`;
    if (!c.leader.near && !c.leader.move)
      return `Keeping ${name} in earshot, too far to help. Tap walk to ${name} to get closer.`;
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
            ? 'about a quarter-hour'
            : minutes < 40
              ? 'about half an hour'
              : 'over half an hour';
    const pronoun = memberOf(id).they;
    return `Walking to ${name}: ${gap}; ${eta} if ${pronoun} stays here.${mem.move ? ` ${name} is still moving.` : ''}`;
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
            ? 'Back at the hut for today; cancel this request.'
            : 'Out of earshot; cancel and walk to them.',
        ),
      );
    g.append(
      f('ask', 'ask', 'gently'),
      f('urge', 'urge', 'press them'),
      f(
        'insist',
        'insist',
        has(this.disc, 'insist') ? 'costs trust' : 'after a refusal',
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
          pack: 'take pack',
          ahead: 'go ahead',
          escort: 'go down together',
          gather: 'close up',
        } as Record<string, string>
      )[act] ?? act
    );
  }

  /** Acknowledges the latest request, using only its own HF answers and observed movement. */
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
      box.append(h('p', 'request-acknowledgement', `Turnback promised at ${input.hour}:00.`));
      const more = h('details', '', `<summary>All ${answers.length} recorded answers</summary>`);
      const list = h('div', 'request-answer-list');
      for (const line of answers)
        list.append(h('p', '', `<b>${esc(memberOf(line.who).name)}</b>: “${esc(line.says)}”`));
      more.append(list);
      if (answers.length) box.append(more);
      else
        box.append(
          h('p', '', c.unheard.includes(index) ? 'Nobody heard the promise.' : 'Awaiting their answers.'),
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
        climb: 'climbing on',
        descend: 'turning back',
        rest: 'resting',
        eat: 'eating',
        wait: 'waiting',
        rope: 'roping up',
        pack: 'taking the pack',
        ahead: 'going ahead',
        escort: 'going down together',
        gather: 'closing up',
      } as Record<string, string>
    )[input.act];
    const response = (line: Line): string => {
      if (line.verdict === 'assented') return `agreed to ${label}`;
      if (line.verdict === 'complied') return `complied with ${label}`;
      if (line.verdict === 'deferred') return `put off ${action}`;
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
        h('p', '', names.length ? `Descending: ${esc(names.join(', '))}.` : 'Nobody is descending yet.'),
      );
    } else {
      const accepted = answers.filter((line) => ['assented', 'complied'].includes(line.verdict));
      box.append(
        h(
          'p',
          'request-acknowledgement',
          accepted.length
            ? `${esc(label[0]?.toUpperCase() + label.slice(1))} accepted: ${esc(namesOf(accepted.map((line) => line.who)))}.`
            : `${esc(label[0]?.toUpperCase() + label.slice(1))} requested.`,
        ),
      );
    }
    const no = answers.find((line) => ['refused', 'deferred', 'modified'].includes(line.verdict));
    if (no) {
      const objection = h(
        'p',
        'request-objection',
        `<b>${esc(memberOf(no.who).name)} ${esc(response(no))}</b>: “${esc(no.says)}”`,
      );
      if (collectiveTurn) box.append(objection);
      else box.prepend(objection);
      if (input.act === 'rope') box.querySelector('.request-acknowledgement')?.remove();
    } else if (!answers.length)
      box.append(
        h('p', '', c.unheard.includes(index) ? 'Nobody heard the request.' : 'Awaiting their answers.'),
      );
    if (answers.length) {
      const more = h('details', '', `<summary>All ${answers.length} recorded answers</summary>`);
      const list = h('div', 'request-answer-list');
      for (const line of answers)
        list.append(
          h('p', '', `<b>${esc(memberOf(line.who).name)} ${esc(response(line))}</b>: “${esc(line.says)}”`),
        );
      more.append(list);
      box.append(more);
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
                ? `${esc(namesOf(walking.map((m) => m.id)))} ${walking.length === 1 ? 'is' : 'are'} meeting at ${esc(memberOf(a.id).name)}’s position until ${clock(walking[0]?.gather?.until ?? c.minute)}; not together yet.`
                : 'They are still apart. Their answers are recorded above.',
          ),
        );
        if (unheard) {
          const go = h(
            'button',
            'force gather-pair',
            `Walk to ${esc(memberOf(unheard.id).name)}; out of earshot`,
          );
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
        gather.onclick = () => this.send({ t: 'say', to: a.id, act: 'gather', with: b.id, force: 'ask' });
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
        `<b>${esc(this.requestName(act))} · ${esc(memberOf(first.who).name)}</b> (${clock(first.at)}): “${esc(first.says)}”`,
      ),
    );
    if (answers.length > 1 && (!refusalsOnly || act === 'rope')) {
      const more = h('details', '', `<summary>All ${answers.length} recorded answers</summary>`);
      for (const l of answers) more.append(h('p', '', `${esc(memberOf(l.who).name)}: “${esc(l.says)}”`));
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
          `${scout ? 'look at' : 'by'} ${lg.name.replace(/^the /, '')}`,
          scout ? 'tell' : 'up',
          true,
          () => this.send(scout ? { t: 'scout', via: lg.id } : { t: 'lead', dir: 'up', via: lg.id }),
        ),
      );
    return g;
  }

  // ------------------------------------------------------------ pages

  private pageEl: HTMLElement | null = null;

  private pageOpen(): boolean {
    return this.pageEl !== null;
  }

  private openPage(html: string, bind: (el: HTMLElement) => void = () => {}): void {
    this.closePage();
    const el = h('div', 'page', `<div class="inner">${html}</div>`);
    this.root.append(el);
    this.pageEl = el;
    const menu = h('button', 'btn', 'Game menu');
    menu.onclick = () => this.gameMenu();
    el.querySelector('.inner')?.append(menu);
    bind(el);
  }

  private closePage(): void {
    this.pageEl?.remove();
    this.pageEl = null;
    this.last = performance.now();
  }

  private gameMenu(): void {
    if (this.menuEl) return;
    const menu = h(
      'div',
      'page',
      `<div class="inner"><h2>Game</h2>
      <button class="btn" data-menu-close>Back</button></div>`,
    );
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Game menu');
    menu.style.zIndex = '6';
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = () => {
      menu.remove();
      this.menuEl = null;
      this.last = performance.now();
      previousFocus?.focus();
    };
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.querySelector(':popover-open')) close();
      if (event.key === 'Tab') {
        const controls = [...menu.querySelectorAll<HTMLElement>('input, button')];
        const next = event.shiftKey ? controls.at(-1) : controls[0];
        if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
          event.preventDefault();
          next?.focus();
        }
      }
    });
    this.menuEl = menu;
    this.root.append(menu);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    menu.querySelector('[data-menu-close]')?.addEventListener('click', close);
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
        ? `<button class="btn" data-see-tally aria-expanded="false" aria-controls="reckoning-tally">See tally</button><div id="reckoning-tally" hidden><p><b>Notebook total: ${2 * home + tops}</b> = 2 × ${home} home by dark + summit visits: ${tops}.</p><p class="caption">This game’s reckoning for ${this.season.over ? 'the completed climbs this season' : 'this completed climb'}; not a measure of people.</p></div>`
        : '';
    box.querySelector('[data-see-tally]')?.addEventListener('click', (event) => {
      const tally = box.querySelector<HTMLElement>('#reckoning-tally');
      if (!tally) return;
      tally.hidden = !tally.hidden;
      (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!tally.hidden));
    });
  }

  private footer(): string {
    return `<div class="footer"><a href="https://human.adamwhite.work/games/">◇ all notebooks</a><br/>People by the Human Framework ${FRAMEWORK_VERSION}. Everything they say comes from it.</div>`;
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

  private titlePage(): void {
    lab.screen('title');
    const sv = this.load();
    const cont = sv && !sv.season.over;
    const done = sv?.season.history.length ?? 0;
    this.openPage(
      `<h1>The Rope</h1>
      <p class="sub">Five people, three mountains.</p>
      ${this.peaksSvg(cont ? done : 0)}
      <p>Lead them up and bring them home. They can say no.</p>
      <button class="btn info" aria-label="More about the season" popovertarget="season-info">i</button><div id="season-info" class="info-popover" popover="auto"><h2>More about the season</h2>
      <p>For eleven summers Ezra led them. This year they asked you.</p>
      <p>You walk with them, carry what you can, and say what you think. They decide for themselves: tired legs, fear, trust and old promises all have a say. Coming down safe is a good day.</p></div>
      ${cont && sv ? `<p class="caption continue-summary">Climb ${sv.season.climbNo} of ${SEASON.length} · ${esc(SEASON[sv.season.climbNo - 1]?.name ?? '')} · ${clock(sv.minute)}</p>` : ''}
      <p>
        ${cont ? '<button class="btn go" data-a="continue">Continue the season</button>' : ''}
        <button class="btn ${cont ? '' : 'go'}" data-a="new">${cont ? 'Begin a new season' : 'Begin the season'}</button>
      </p>
      <p class="caption">Plays offline once loaded. Install it from your browser’s menu.</p>
      ${this.footer()}`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="new"]')?.addEventListener('click', () => {
          if (!cont || confirm('Begin a new season? The season in your notebook will be lost.'))
            this.newGame();
        });
        el.querySelector<HTMLElement>('[data-a="continue"]')?.addEventListener('click', () => {
          if (sv) this.resume(sv);
        });
      },
    );
  }

  private climbIntro(): void {
    const c = this.climb;
    lab.screen(climbScreen(c, 'hut'));
    const m = MOUNTAINS[c.mountain];
    const lines = c.journal.map((j) => `<p class="${j.story ? 'hand' : ''}">${esc(j.text)}</p>`).join('');
    this.openPage(
      `<h1>${esc(m?.name ?? '')}</h1>
      <p class="sub">Climb ${c.climbNo} of ${SEASON.length} · ${clock(c.minute)}, at the hut</p>
      <p class="hand">When do you turn back?</p>
      <p>They remember whether you keep your word.</p>
      <p class="plan">${[12, 13, 14]
        .map((hr) => `<button class="btn go" data-hour="${hr}">We turn at ${hr}:00</button>`)
        .join('')}<button class="btn go" data-a="go">We'll see</button></p>
      <button class="btn info" aria-label="At the hut" popovertarget="hut-info">i</button><div id="hut-info" class="info-popover" popover="auto"><h2>At the hut</h2>${lines}
      <p>A promised hour holds them, and you: they will remember whether you kept it.</p></div>`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="go"]')?.addEventListener('click', () => {
          this.closePage();
          lab.screen(climbScreen(c, 'climb'));
        });
        for (const b of el.querySelectorAll<HTMLElement>('[data-hour]'))
          b.addEventListener('click', () => {
            this.closePage();
            lab.screen(climbScreen(c, 'climb'));
            // The first choice of the day, made at the hut where everyone hears it (owner playtest 2026-10-18).
            if (!this.disc.unlocked.includes('promise')) this.disc.unlocked.push('promise');
            this.send({ t: 'promise', hour: Number(b.dataset.hour) });
          });
      },
    );
  }

  private journalPage(): void {
    const c = this.climb;
    if (!c) return;
    const rows = c.journal
      .map(
        (j) =>
          `<div class="entry${j.story ? ' story' : ''}"><time>${clock(j.at)}</time><span>${esc(j.text)}</span></div>`,
      )
      .join('');
    this.openPage(
      `<button class="close" data-a="close">back</button><h2>Journal</h2>${rows}
      <p><button class="btn" data-a="export">Export this climb (playtest)</button>
      <button class="btn" data-a="send">Send this run to the notebook</button></p>`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="close"]')?.addEventListener('click', () => {
          // A finished climb has no running clock to reopen its read-back for us.
          if (this.season.over) this.seasonPage();
          else if (c.over) this.debriefPage();
          else this.closePage();
        });
        el.querySelector<HTMLElement>('[data-a="export"]')?.addEventListener('click', () => this.exportRun());
        el.querySelector<HTMLElement>('[data-a="send"]')?.addEventListener('click', () => this.sendRun());
      },
    );
  }

  private sendRun(): void {
    const { start, climb } = this;
    lab.openSendDialog({ getRun: () => exportClimb(start, climb, FRAMEWORK_VERSION) });
  }

  private exportedAt = 0;

  private exportRun(): void {
    // One download per tap burst.
    if (performance.now() - this.exportedAt < 3000) return;
    this.exportedAt = performance.now();
    const data = exportClimb(this.start, this.climb, FRAMEWORK_VERSION);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rope-${this.climb.mountain}-${this.climb.seed}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private ending = false;

  private endClimb(): void {
    if (this.ending) return;
    this.ending = true;
    this.playing = false;
    this.save();
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
    lab.screen(climbScreen(c, 'debrief'));
    for (const name of climbMilestones(c)) lab.milestone(name);
    const m = MOUNTAINS[c.mountain];
    const outcomes = c.members
      .map((mem) => {
        const p = { ...factsFor(c, mem.id) };
        return `<div class="outcome"><b>${esc(memberOf(mem.id).name)}</b><span>${esc(outcomeWords(c, p))}.</span></div>`;
      })
      .join('');
    const story = c.journal
      .filter((j) => j.story)
      .map((j) => `<p class="hand">${esc(j.text)}</p>`)
      .join('');
    this.openPage(
      `<h1>${esc(m?.name ?? '')}</h1>
      <p class="sub">The day, read back</p>
      ${outcomes}
      <div data-reckoning-result></div>
      ${story}
      <h2>That night at the hut</h2>
      <div class="camp" data-camp><p class="caption">They talk a little over the stove…</p></div>
      <h2>One thing you said</h2>
      <div class="branch" data-branch><p class="caption">Climbing it again in the notebook, without each of your words in turn…</p></div>
      <p>
        <button class="btn go" data-a="next">${c.climbNo < SEASON.length ? `On to ${esc(SEASON[c.climbNo]?.name ?? '')}` : 'Close the season'}</button>
        <button class="btn" data-a="journal">Journal</button>
        <button class="btn" data-a="export">Export playtest</button>
        <button class="btn" data-a="send">Send this run to the notebook</button>
      </p>
      ${this.footer()}`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="journal"]')?.addEventListener('click', () => {
          this.journalPage();
        });
        el.querySelector<HTMLElement>('[data-a="export"]')?.addEventListener('click', () => this.exportRun());
        el.querySelector<HTMLElement>('[data-a="send"]')?.addEventListener('click', () => this.sendRun());
        el.querySelector<HTMLElement>('[data-a="next"]')?.addEventListener('click', () => this.advance());
      },
    );
    this.renderReckoning();
    this.runCamp(m?.name ?? '');
    this.runDebrief();
  }

  private branch: Branch | null | undefined = undefined;

  /** Camp talk: a model may voice it from the climb's HF records and journal; its text is never read into state. */
  private runCamp(mountain: string): void {
    const box = () => this.pageEl?.querySelector<HTMLElement>('[data-camp]');
    const facts = campFacts(this.climb, mountain);
    const show = (lines: string[], label: string) => {
      const b = box();
      if (b)
        b.innerHTML = `${lines.map((l) => `<p class="hand">${esc(l)}</p>`).join('')}<p class="caption">${esc(label)}</p>`;
    };
    const fallback = () => show(campFallback(facts), 'Read from the journal (no model).');
    fetch('/api/camp', {
      method: 'POST',
      body: JSON.stringify(facts),
      headers: { 'content-type': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((o: { lines?: string[] } | null) => {
        if (o?.lines?.length)
          show(o.lines, 'Voiced by a small language model from the journal; it changes nothing.');
        else fallback();
      })
      .catch(fallback);
  }

  private runDebrief(): void {
    const show = (b: Branch | null) => {
      this.branch = b;
      const el = this.pageEl?.querySelector<HTMLElement>('[data-branch]');
      if (!el) return;
      el.innerHTML = b
        ? `<p>${esc(b.sentence)}</p><p class="caption">${esc(ALTERNATIVE_CAPTION)}</p>`
        : '<p>Nothing you said, taken back on its own, changed how the day ended for anyone. They climbed their own mountain.</p>';
    };
    if (this.branch !== undefined) {
      show(this.branch);
      return;
    }
    const w = new Worker(new URL('./debrief.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ branch: Branch | null }>) => {
      show(e.data.branch);
      w.terminate();
    };
    w.postMessage({ start: this.start, played: snapshot(this.climb) });
  }

  private advance(): void {
    const next = nextClimb(this.season, this.climb, this.branch ?? null);
    this.branch = undefined;
    this.ending = false;
    if (!next) {
      this.save();
      this.seasonPage();
      return;
    }
    this.begin(next, this.season.start ?? snapshot(next));
  }

  private seasonPage(): void {
    this.reckoningFacts = this.season.over ? this.season.history.map((day) => day.facts) : [];
    lab.screen('season');
    lab.milestone('season done');
    const hist = this.season.history
      .map((x) => {
        const m = MOUNTAINS[x.mountain];
        const tops = Object.entries(x.facts)
          .filter(([, f]) => f.summit)
          .map(([id]) => memberOf(id).name);
        const down = Object.values(x.facts).filter((f) => f.home).length;
        return `<h2>${esc(m?.name ?? '')}</h2>
          <p>${tops.length ? `${esc(tops.join(', '))} stood on the top.` : 'Nobody reached the top.'} ${down === 5 ? 'Everyone came down.' : `${down} of five were down by dark.`}</p>
          ${x.branch ? `<p class="branch">${esc(x.branch.sentence)}</p>` : ''}
          ${x.notes.map((n) => `<p class="hand">${esc(n)}</p>`).join('')}`;
      })
      .join('');
    this.openPage(
      `<h1>The season</h1>
      ${this.peaksSvg(this.season.history.length)}
      ${hist}
      <div data-reckoning-result></div>
      <p><button class="btn go" data-a="new">Begin a new season</button></p>
      ${this.footer()}`,
      (el) =>
        el.querySelector<HTMLElement>('[data-a="new"]')?.addEventListener('click', () => this.newGame()),
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
