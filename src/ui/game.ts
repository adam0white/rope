/**
 * The browser game: clock and tactical slowdown, the thumb sheet, speech bubbles, margin notes, and the notebook
 * pages (title, journal, debrief, season). All play goes through `queueInput` + `step`, so the save is the start
 * state and the input log, and the export replays exactly.
 */
import { FRAMEWORK_VERSION, voiceOf } from '@adam0white/human-framework';
import {
  type ClimbState,
  canHear,
  clock,
  distance,
  FACTS,
  type Force,
  forkOf,
  type Line,
  MOUNTAINS,
  memberState,
  type NewInput,
  queueInput,
  replay,
  snapshot,
  step,
} from '../sim/climb.ts';
import { ALTERNATIVE_CAPTION, type Branch, outcomeWords } from '../sim/debrief.ts';
import { legsUp, SEASON } from '../sim/mountain.ts';
import { MEMBERS, memberOf } from '../sim/party.ts';
import { exportClimb, newSeason, nextClimb, type SeasonState } from '../sim/season.ts';
import { type Disclosure, has, markSeen, type Note, newDisclosure, nextNote } from './disclosure.ts';
import { icon } from './icons.ts';
import { Scene } from './scene.ts';

const SAVE_KEY = 'rope.save.v1';
/** Sim minutes per real second. Normal makes a twelve-hour day about twenty minutes. */
const RATE = { slow: 0.15, normal: 0.6, fast: 2.4 } as const;
type Speed = keyof typeof RATE;
/** Tactical slowdown: how much and for how long (real ms) after a moment that needs you. */
const SLOW = 0.25;
const SLOW_MS = 7000;
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

type Panel = 'main' | 'force' | 'partner' | 'tell' | 'promise' | 'route' | 'scout';

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
  private speedEl = h('div', 'speed');
  private sceneEl = h('div', 'scene');
  private bubblesEl = h('div', 'bubbles');
  private noteEl = h('div', 'note');
  private stampEl = h('div', 'stamp');
  private sheet = h('div', 'sheet');
  private season!: SeasonState;
  private climb!: ClimbState;
  private start = '';
  private disc: Disclosure = newDisclosure();
  private speed: Speed = 'normal';
  private slowUntil = 0;
  private acc = 0;
  private last = performance.now();
  private target = 'all';
  private verb: string | null = null;
  private partner: string | null = null;
  private panel: Panel = 'main';
  private shownLines = 0;
  private shownJournal = 0;
  private bubbles = new Map<string, { el: HTMLElement; until: number }>();
  private note: Note | null = null;
  private playing = false;
  private uiTick = 0;
  private lastSave = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async boot(): Promise<void> {
    await document.fonts?.ready;
    const mark = h('a', 'mark', '◇ human framework');
    (mark as HTMLAnchorElement).href = 'https://human.adamwhite.work';
    this.top.append(mark, this.whereEl, this.speedEl);
    for (const sp of ['slow', 'normal', 'fast'] as Speed[]) {
      const b = h('button', '', sp === 'slow' ? '◁' : sp === 'normal' ? '▷' : '▷▷');
      b.title = `${sp} speed`;
      b.setAttribute('aria-label', `${sp} speed`);
      b.onclick = () => {
        this.speed = sp;
        this.slowUntil = 0;
        this.renderTop();
      };
      b.dataset.speed = sp;
      this.speedEl.append(b);
    }
    this.sceneEl.append(this.bubblesEl, this.noteEl, this.stampEl);
    const jb = h('button', 'drawer-btn', 'journal');
    jb.onclick = () => this.journalPage();
    this.sceneEl.append(jb);
    this.root.append(this.top, this.sceneEl, this.sheet);
    await this.scene.mount(this.sceneEl);
    this.scene.onTap = (id) => {
      if (id === 'leader') return;
      this.pickTarget(id);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
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
      start: this.start,
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
    const c = replay(sv.start, sv.inputs, sv.minute);
    this.begin(c, sv.start, true);
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
    this.stampEl.classList.remove('on');
    this.closePage();
    this.playing = true;
    if (!resumed) this.climbIntro();
    this.renderAll();
    this.save();
  }

  // ------------------------------------------------------------ the loop

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing && this.climb && !this.climb.over && !this.pageOpen()) {
      const slowed = now < this.slowUntil || this.panel !== 'main' || this.verb !== null;
      const rate = RATE[this.speed] * (slowed && this.speed !== 'slow' ? SLOW : 1);
      this.acc += dt * rate;
      let n = 0;
      while (this.acc >= 1 && n < 30 && !this.climb.over) {
        step(this.climb);
        this.acc -= 1;
        n++;
        this.afterStep();
      }
    }
    if (this.playing && this.climb?.over) this.endClimb();
    if (this.climb) {
      this.scene.selected = this.target === 'all' ? null : this.target;
      this.scene.draw(this.climb, dt);
      this.placeBubbles(now);
      if (now - this.uiTick > 300) {
        this.uiTick = now;
        this.renderTop();
        if (this.panel === 'main' && this.verb === null) this.renderSheet(true);
      }
      if (now - this.lastSave > 20000) {
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
    }
    if (!this.note || this.disc.seen.includes(this.note.id)) {
      const n = nextNote(this.disc, c);
      if (n && n.id !== this.note?.id) this.showNote(n);
    }
  }

  private slow(): void {
    this.slowUntil = performance.now() + SLOW_MS;
  }

  private stamp(text: string): void {
    this.stampEl.textContent = text;
    this.stampEl.classList.add('on');
    setTimeout(() => this.stampEl.classList.remove('on'), 4200);
  }

  // ------------------------------------------------------------ input

  private send(inp: NewInput): void {
    const c = this.climb;
    queueInput(c, inp);
    // The word is spoken now: step the minute it applies in, so the answer comes at once.
    step(c);
    this.afterStep();
    this.saySelf(inp);
    if (this.note?.lit) {
      const lit = this.note.lit;
      const matched =
        (lit === 'lead' && inp.t === 'lead') ||
        (lit === 'climb' && inp.t === 'say') ||
        (lit === 'tell' && inp.t === 'tell') ||
        (lit === 'promise' && inp.t === 'promise') ||
        (lit === 'rope' && inp.t === 'say' && inp.act === 'rope') ||
        (lit === 'fix' && inp.t === 'fix');
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
      const who = inp.to === 'all' ? 'Everyone' : memberOf(inp.to).name;
      const what: Record<string, string> = {
        climb: 'on we go',
        descend: 'we turn back',
        rest: 'take a rest',
        eat: 'eat something',
        wait: 'wait here',
        rope: `rope up with ${inp.with ? memberOf(inp.with).name : ''}`,
        pack: 'give me your pack',
        ahead: 'go on ahead and call down what you see',
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
        this.partner = id;
        this.panel = 'force';
        this.renderSheet();
      }
      return;
    }
    this.target = this.target === id ? 'all' : id;
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
    if (l.verdict !== 'assented' && l.verdict !== 'heard') this.slow();
  }

  private bubble(who: string, text: string, cls: string): void {
    let b = this.bubbles.get(who);
    if (!b) {
      b = { el: h('div', 'bubble'), until: 0 };
      this.bubblesEl.append(b.el);
      this.bubbles.set(who, b);
    }
    const name = who === 'leader' ? 'you' : memberOf(who).name;
    b.el.className = `bubble ${cls}`;
    b.el.innerHTML = `<span class="who">${esc(name)}</span>${esc(text)}`;
    if (who === 'leader') b.el.style.color = 'var(--rope)';
    else b.el.style.color = '';
    b.until = performance.now() + BUBBLE_MS;
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
      const on = this.scene.at.has(who) && now <= b.until;
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
        bottom = Math.min(H - 4, top + bh);
      }
      placed.push({ l, r, t: bottom - bh, b: bottom });
      b.el.style.left = `${cx}px`;
      b.el.style.top = `${bottom}px`;
    }
  }

  private showNote(n: Note): void {
    this.note = n;
    this.noteEl.innerHTML = `<button aria-label="dismiss">got it</button>${bold(n.text)}`;
    this.noteEl.style.display = '';
    const btn = this.noteEl.querySelector('button');
    if (btn) btn.onclick = () => this.dismissNote();
    if (n.unlock) markSeen(this.disc, { ...n, id: `${n.id}:unlock` });
    if (n.unlock && !this.disc.unlocked.includes(n.unlock)) this.disc.unlocked.push(n.unlock);
    this.slow();
    this.renderSheet();
    if (!n.lit) setTimeout(() => this.note?.id === n.id && this.dismissNote(), 16000);
  }

  private dismissNote(): void {
    if (this.note) markSeen(this.disc, this.note);
    this.note = null;
    this.noteEl.style.display = 'none';
    this.renderSheet();
  }

  private showStory(text: string): void {
    this.noteEl.innerHTML = `<span class="hand">${esc(text)}</span>`;
    this.noteEl.style.display = '';
    this.slow();
    setTimeout(() => {
      if (!this.note) this.noteEl.style.display = 'none';
      else this.showNote(this.note);
    }, 9000);
  }

  // ------------------------------------------------------------ rendering

  private renderAll(): void {
    this.renderTop();
    this.renderSheet();
    this.noteEl.style.display = 'none';
  }

  private renderTop(): void {
    const c = this.climb;
    if (!c) return;
    const m = MOUNTAINS[c.mountain];
    this.whereEl.textContent = `${m?.name ?? ''} · ${clock(c.minute)}`;
    const slowed = performance.now() < this.slowUntil || this.panel !== 'main' || this.verb !== null;
    for (const b of this.speedEl.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.speed === this.speed));
      b.classList.toggle('slowed', slowed && b.dataset.speed === this.speed && this.speed !== 'slow');
    }
  }

  private sheetKey = '';

  /** Rebuild the sheet; `ifChanged` skips it when nothing it shows has changed, so a tap is never lost mid-rebuild. */
  private renderSheet(ifChanged = false): void {
    const c = this.climb;
    if (!c) return;
    const L = c.leader;
    const key = JSON.stringify([
      this.panel,
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
      L.fixing,
      L.scouting,
      L.rations,
      c.members.map((x) => [
        x.homeAt !== null,
        canHear(c, x.id),
        x.ropedTo,
        x.pack,
        Math.round(distance(c, x.pos, L.pos) / 40),
      ]),
      Math.floor((c.minute % 1440) / 60),
    ]);
    if (ifChanged && key === this.sheetKey) return;
    this.sheetKey = key;
    const sh = this.sheet;
    sh.innerHTML = '';
    // Who you speak to.
    const chips = h('div', 'row');
    const mk = (id: string, label: string, ic: string, far: boolean, sub = '') => {
      const b = h(
        'button',
        `chip${far ? ' far' : ''}`,
        `${icon(ic)}${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`,
      );
      const pressed = this.panel === 'partner' ? this.partner === id : this.target === id;
      b.setAttribute('aria-pressed', String(pressed));
      if (this.panel === 'partner' && (id === this.target || id === 'all'))
        (b as HTMLButtonElement).disabled = true;
      b.onclick = () => this.pickTarget(id);
      chips.append(b);
    };
    const anyNear = c.members.some((x) => x.homeAt === null && canHear(c, x.id));
    mk('all', 'everyone', 'all', !anyNear);
    for (const x of MEMBERS) {
      const mem = memberState(c, x.id);
      const far = mem.homeAt === null && !canHear(c, x.id);
      mk(x.id, x.name, 'person', far, mem.homeAt !== null ? 'down' : far ? 'far' : '');
    }
    const label = h('div', 'label');
    const tgt = this.target === 'all' ? 'everyone' : memberOf(this.target).name;
    label.innerHTML =
      this.panel === 'partner'
        ? `<span>rope ${esc(tgt)} to whom?</span>`
        : `<span>to ${esc(tgt)}</span><span>${c.members.some((x) => x.ropedTo) ? 'roped' : ''}</span>`;
    const cancel = h('button', '', 'cancel');
    cancel.onclick = () => {
      this.verb = null;
      this.partner = null;
      this.panel = 'main';
      this.renderSheet();
    };
    if (this.panel !== 'main') label.append(cancel);
    sh.append(label, chips);
    if (this.panel === 'main' || this.panel === 'partner') sh.append(this.peopleVerbs(), this.leaderRow());
    else if (this.panel === 'force') sh.append(this.peopleVerbs(), this.forceRow());
    else if (this.panel === 'tell') sh.append(this.peopleVerbs(), this.tellRow());
    else if (this.panel === 'promise') sh.append(this.peopleVerbs(), this.promiseRow());
    else if (this.panel === 'route') sh.append(this.peopleVerbs(), this.routeRow());
    else if (this.panel === 'scout') sh.append(this.peopleVerbs(), this.routeRow(true));
  }

  private verbBtn(
    id: string,
    label: string,
    ic: string,
    enabled: boolean,
    onclick: () => void,
    title = '',
  ): HTMLElement {
    const b = h('button', 'verb', `${icon(ic)}<span>${esc(label)}</span>`) as HTMLButtonElement;
    b.disabled = !enabled;
    if (this.note?.lit === id || this.verb === id) b.classList.add('lit');
    if (title) b.title = title;
    b.onclick = onclick;
    return b;
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
    const near = one && distance(c, memberState(c, this.target).pos, c.leader.pos) < 40;
    const choose = (v: string) => () => {
      this.verb = v;
      this.panel = v === 'rope' ? 'partner' : 'force';
      this.renderSheet();
    };
    g.append(
      this.verbBtn('climb', 'climb on', 'up', ok, choose('climb')),
      this.verbBtn('descend', 'turn back', 'down', ok, choose('descend')),
      this.verbBtn('rest', 'rest', 'rest', ok, choose('rest')),
      this.verbBtn('eat', 'eat', 'eat', ok, choose('eat')),
      this.verbBtn('wait', 'wait', 'wait', ok, choose('wait')),
    );
    if (has(this.disc, 'tell')) g.append(this.verbBtn('ahead', 'go ahead', 'up', ok && one, choose('ahead')));
    if (has(this.disc, 'rope'))
      g.append(
        this.verbBtn(
          'rope',
          'rope up',
          'rope',
          ok && one && !memberState(c, this.target).ropedTo,
          choose('rope'),
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
          one && !near ? 'go to them first' : '',
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
          one && !near ? 'go to them first' : '',
        ),
      );
    }
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
      this.verbBtn('down', 'go down', 'down', L.path.length > 0 || L.pos.leg !== null, () =>
        this.send({ t: 'lead', dir: 'down' }),
      ),
      this.verbBtn('stop', L.fixing ? 'fixing…' : 'stop', 'stop', L.move !== null, () =>
        this.send({ t: 'lead', dir: 'stop' }),
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
        ),
      );
    }
    if (has(this.disc, 'tell'))
      g.append(
        this.verbBtn('tell', 'tell', 'tell', c.known.length > 0, () => {
          this.panel = 'tell';
          this.renderSheet();
        }),
      );
    if (has(this.disc, 'promise'))
      g.append(
        this.verbBtn('promise', c.promise ? 'promised' : 'promise', 'promise', c.promise === null, () => {
          this.panel = 'promise';
          this.renderSheet();
        }),
      );
    if (has(this.disc, 'fix')) {
      const fixable =
        m && L.pos.place && !L.move && !L.fixing
          ? legsUp(m, L.pos.place).some((l) => l.fixable && !c.fixed.includes(l.id))
          : false;
      g.append(this.verbBtn('fix', 'fix rope', 'fix', Boolean(fixable), () => this.send({ t: 'fix' })));
    }
    const wrap = h('div');
    const lab = h('div', 'label', '<span>you</span>');
    wrap.append(lab, g);
    return wrap;
  }

  private forceRow(): HTMLElement {
    const g = h('div', 'forces');
    const v = this.verb ?? 'climb';
    const f = (force: Force, label: string, sub: string, enabled = true) => {
      const b = h('button', 'force', `${label}<small>${sub}</small>`) as HTMLButtonElement;
      b.disabled = !enabled;
      b.onclick = () => {
        const act = v as 'climb' | 'descend' | 'rest' | 'eat' | 'wait' | 'rope' | 'pack' | 'ahead';
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
    g.append(
      f('ask', 'ask', 'gently'),
      f('urge', 'urge', 'press them'),
      f('insist', 'insist', has(this.disc, 'insist') ? 'costs trust' : 'not yet', has(this.disc, 'insist')),
    );
    return g;
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
    bind(el);
  }

  private closePage(): void {
    this.pageEl?.remove();
    this.pageEl = null;
    this.last = performance.now();
  }

  private footer(): string {
    return `<div class="footer">other notebooks: <a href="https://neighbours.adamwhite.work">neighbours</a><a href="https://repair.adamwhite.work">repair</a><a href="https://human.adamwhite.work">human framework</a><br/>People by the Human Framework ${FRAMEWORK_VERSION}. Everything they say comes from it.</div>`;
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
    const sv = this.load();
    const cont = sv && !sv.season.over;
    const done = sv?.season.history.length ?? 0;
    this.openPage(
      `<h1>The Rope</h1>
      <p class="sub">Five people, three mountains. Every one of them can say no.</p>
      ${this.peaksSvg(cont ? done : 0)}
      <p>For eleven summers Ezra led them. This year they asked you.</p>
      <p>You walk with them, carry what you can, and say what you think. They decide for themselves: tired legs, fear, trust and old promises all have a say. Coming down safe is a good day.</p>
      <p>
        ${cont ? '<button class="btn go" data-a="continue">Continue the season</button>' : ''}
        <button class="btn ${cont ? '' : 'go'}" data-a="new">${cont ? 'Begin a new season' : 'Begin the season'}</button>
      </p>
      <p class="caption">Plays offline once loaded. Install it from your browser’s menu.</p>
      ${this.footer()}`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="new"]')?.addEventListener('click', () => this.newGame());
        el.querySelector<HTMLElement>('[data-a="continue"]')?.addEventListener('click', () => {
          if (sv) this.resume(sv);
        });
      },
    );
  }

  private climbIntro(): void {
    const c = this.climb;
    const m = MOUNTAINS[c.mountain];
    const lines = c.journal.map((j) => `<p class="${j.story ? 'hand' : ''}">${esc(j.text)}</p>`).join('');
    this.openPage(
      `<h1>${esc(m?.name ?? '')}</h1>
      <p class="sub">Climb ${c.climbNo} of ${SEASON.length} · ${clock(c.minute)}, at the hut</p>
      ${lines}
      <p><button class="btn go" data-a="go">Step outside</button></p>`,
      (el) =>
        el.querySelector<HTMLElement>('[data-a="go"]')?.addEventListener('click', () => this.closePage()),
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
      <p><button class="btn" data-a="export">Export this climb (playtest)</button></p>`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="close"]')?.addEventListener('click', () => this.closePage());
        el.querySelector<HTMLElement>('[data-a="export"]')?.addEventListener('click', () => this.exportRun());
      },
    );
  }

  private exportRun(): void {
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
    const allDown = c.members.every((x) => x.homeAt !== null);
    this.stamp(allDown ? 'Everyone down' : 'Night on the hill');
    setTimeout(() => this.debriefPage(), 2600);
  }

  private debriefPage(): void {
    const c = this.climb;
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
      ${story}
      <h2>One thing you said</h2>
      <div class="branch" data-branch><p class="caption">Climbing it again in the notebook, without each of your words in turn…</p></div>
      <p>
        <button class="btn go" data-a="next">${c.climbNo < SEASON.length ? `On to ${esc(SEASON[c.climbNo]?.name ?? '')}` : 'Close the season'}</button>
        <button class="btn" data-a="journal">Journal</button>
        <button class="btn" data-a="export">Export playtest</button>
      </p>
      ${this.footer()}`,
      (el) => {
        el.querySelector<HTMLElement>('[data-a="journal"]')?.addEventListener('click', () => {
          const back = () => this.debriefPage();
          this.journalPage();
          this.pageEl?.querySelector<HTMLElement>('[data-a="close"]')?.addEventListener('click', back);
        });
        el.querySelector<HTMLElement>('[data-a="export"]')?.addEventListener('click', () => this.exportRun());
        el.querySelector<HTMLElement>('[data-a="next"]')?.addEventListener('click', () => this.advance());
      },
    );
    this.runDebrief();
  }

  private branch: Branch | null | undefined = undefined;

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
      <p><button class="btn go" data-a="new">Begin a new season</button></p>
      ${this.footer()}`,
      (el) =>
        el.querySelector<HTMLElement>('[data-a="new"]')?.addEventListener('click', () => this.newGame()),
    );
  }
}

import { factsOf } from '../sim/debrief.ts';

function factsFor(c: ClimbState, id: string) {
  const f = factsOf(c)[id];
  if (!f) throw new Error('no facts');
  return f;
}
