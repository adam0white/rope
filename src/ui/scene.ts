/**
 * The scene: a side profile of the mountain in ink, the party drawn from their HF state (look.ts), the weather as
 * hatching and streaks. PixiJS draws; nothing here changes the simulation.
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { type ClimbState, MOUNTAINS, memberState, personOf, posXY } from '../sim/climb.ts';
import { coldAt, type Mountain, place, windAt } from '../sim/mountain.ts';
import { MEMBERS } from '../sim/party.ts';
import { hashUnit } from '../sim/rng.ts';
import { lookOf } from './look.ts';

interface Palette {
  paper: number;
  paper2: number;
  ink: number;
  soft: number;
  rope: number;
  moss: number;
  sky: number;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) =>
    Number.parseInt((cs.getPropertyValue(n).trim() || d).replace('#', ''), 16);
  return {
    paper: v('--paper', '#f3ecdd'),
    paper2: v('--paper-2', '#e9dfcb'),
    ink: v('--ink', '#23201b'),
    soft: v('--ink-soft', '#6e665a'),
    rope: v('--rope', '#c2412d'),
    moss: v('--moss', '#4f6b3a'),
    sky: v('--sky', '#3d5a73'),
  };
}

/** Vertical exaggeration: real slopes look flat at phone scale. */
const VE = 2.1;
/** Metres of trail across the screen width. */
const SPAN = 1500;

export interface ScreenPoint {
  x: number;
  y: number;
}

export class Scene {
  app = new Application();
  private ground = new Graphics();
  private weather = new Graphics();
  private figures = new Graphics();
  private labels = new Container();
  private names = new Map<string, Text>();
  private placeLabels = new Map<string, Text>();
  private pal: Palette = readPalette();
  private phase = new Map<string, number>();
  private camX = 0;
  private camAlt = 0;
  private camReady = false;
  private w = 360;
  private h = 400;
  /** Screen positions of the figures, for bubbles and taps. */
  readonly at = new Map<string, ScreenPoint>();
  selected: string | null = null;
  onTap: (id: string) => void = () => {};

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    el.prepend(this.app.canvas);
    // Pixi's resizeTo follows window resizes only; the scene box also changes when the sheet grows.
    new ResizeObserver(() => this.app.resize()).observe(el);
    this.app.stage.addChild(this.weather, this.ground, this.labels, this.figures);
    this.app.canvas.addEventListener('pointerdown', (e) => {
      const r = this.app.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let best: string | null = null;
      let bd = 34;
      for (const [id, p] of this.at) {
        const d = Math.hypot(p.x - x, p.y - 12 - y);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      if (best) this.onTap(best);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.pal = readPalette();
      for (const t of [...this.names.values(), ...this.placeLabels.values()]) t.destroy();
      this.names.clear();
      this.placeLabels.clear();
    });
  }

  private sx(x: number): number {
    return (x - this.camX) * (this.w / SPAN) + this.w / 2;
  }
  private sy(alt: number): number {
    return this.h * 0.58 - (alt - this.camAlt) * (this.w / SPAN) * VE;
  }

  /** Draw a frame. `dt` is real seconds since the last frame; `moving` animates walking. */
  draw(s: ClimbState, dt: number): void {
    const m = MOUNTAINS[s.mountain];
    if (!m) return;
    this.w = this.app.screen.width;
    this.h = this.app.screen.height;
    this.follow(s, dt);
    this.drawWeather(s, m);
    this.drawGround(s, m);
    this.drawPeople(s, m, dt);
  }

  private follow(s: ClimbState, dt: number): void {
    // Keep the leader in view, leaning toward the middle of the party.
    const L = posXY(s, s.leader.pos);
    const xs = s.members.filter((x) => x.homeAt === null).map((x) => posXY(s, x.pos));
    const mx = xs.length ? xs.reduce((a, b) => a + b.x, 0) / xs.length : L.x;
    const ma = xs.length ? xs.reduce((a, b) => a + b.alt, 0) / xs.length : L.alt;
    const tx = L.x * 0.6 + mx * 0.4;
    const ta = L.alt * 0.6 + ma * 0.4;
    if (!this.camReady) {
      this.camX = tx;
      this.camAlt = ta;
      this.camReady = true;
    }
    const k = Math.min(1, dt * 1.5);
    this.camX += (tx - this.camX) * k;
    this.camAlt += (ta - this.camAlt) * k;
  }

  /** A wobbly ink line through world points, jitter keyed to the world so it does not shimmer. */
  private inkLine(
    g: Graphics,
    pts: { x: number; alt: number }[],
    seed: number,
    width = 1.5,
    color = this.pal.ink,
  ): void {
    if (pts.length < 2) return;
    const first = pts[0];
    if (!first) return;
    g.moveTo(this.sx(first.x), this.sy(first.alt));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.alt - a.alt) / 60));
      for (let j = 1; j <= n; j++) {
        const f = j / n;
        const x = a.x + (b.x - a.x) * f;
        const alt = a.alt + (b.alt - a.alt) * f;
        const jx = j === n ? 0 : (hashUnit(seed, i, j, 1) - 0.5) * 18;
        const ja = j === n ? 0 : (hashUnit(seed, i, j, 2) - 0.5) * 22;
        g.lineTo(this.sx(x + jx), this.sy(alt + ja));
      }
    }
    g.stroke({ width, color, cap: 'round', join: 'round' });
  }

  private branchPoints(m: Mountain, legIds: string[]): { x: number; alt: number }[] {
    const pts: { x: number; alt: number }[] = [];
    for (const id of legIds) {
      const lg = m.legs.find((l) => l.id === id);
      if (!lg) continue;
      const a = place(m, lg.from);
      const b = place(m, lg.to);
      if (pts.length === 0) pts.push(a);
      pts.push(b);
    }
    return pts;
  }

  private routes(m: Mountain): string[][] {
    // Every path from the hut to the summit, as leg id lists.
    const out: string[][] = [];
    const walk = (at: string, acc: string[]) => {
      if (at === m.summit) {
        out.push(acc);
        return;
      }
      for (const lg of m.legs.filter((l) => l.from === at)) walk(lg.to, [...acc, lg.id]);
    };
    walk(m.hut, []);
    return out;
  }

  private drawGround(s: ClimbState, m: Mountain): void {
    const g = this.ground;
    g.clear();
    const P = this.pal;
    const routes = this.routes(m);
    // Far range, behind, in soft ink.
    const far: { x: number; alt: number }[] = [];
    // Far range: half-speed parallax, always a little above the camera so it reads as distance, not ground.
    for (let x = -3000; x <= 9000; x += 450) far.push({ x, alt: 250 + 450 * hashUnit(s.seed, 77, x) });
    this.inkLine(
      g,
      far.map((p) => ({ x: this.camX * 0.5 + p.x, alt: this.camAlt * 0.85 + p.alt })),
      91,
      1,
      P.soft,
    );
    // The mountain body: the lowest route, filled to the bottom of the page.
    const main = routes[0] ?? [];
    const body = this.branchPoints(m, main);
    const hut = place(m, m.hut);
    const top = place(m, m.summit);
    const poly: number[] = [
      this.sx(hut.x - 1500),
      this.h + 10,
      this.sx(hut.x - 1500),
      this.sy(hut.alt - 120),
    ];
    for (const p of body) poly.push(this.sx(p.x), this.sy(p.alt));
    poly.push(this.sx(top.x + 900), this.sy(top.alt - 900), this.sx(top.x + 2500), this.h + 10);
    g.poly(poly).fill({ color: P.paper2 });
    // Rock hatching under steep legs; snow legs stay bare paper.
    for (const lg of m.legs) {
      const a = place(m, lg.from);
      const b = place(m, lg.to);
      const steep = (b.alt - a.alt) / Math.max(1, b.x - a.x);
      if (lg.kind === 'snow') continue;
      const n = Math.round(Math.hypot(b.x - a.x, b.alt - a.alt) / 80);
      for (let i = 1; i < n; i++) {
        const f = i / n;
        const x = this.sx(a.x + (b.x - a.x) * f);
        const y = this.sy(a.alt + (b.alt - a.alt) * f) + 6;
        const len = 5 + 6 * Math.min(1, steep);
        g.moveTo(x, y).lineTo(x - len * 0.6, y + len);
      }
      g.stroke({ width: 1, color: P.soft, alpha: 0.6 });
    }
    // The routes.
    routes.forEach((r, i) => {
      this.inkLine(g, this.branchPoints(m, r), 11 + i, i === 0 ? 1.8 : 1.5);
    });
    // Fixed ropes, dotted along their legs.
    for (const id of s.fixed) {
      const lg = m.legs.find((l) => l.id === id);
      if (!lg) continue;
      const a = place(m, lg.from);
      const b = place(m, lg.to);
      for (let f = 0.05; f < 1; f += 0.07) {
        g.circle(this.sx(a.x + (b.x - a.x) * f), this.sy(a.alt + (b.alt - a.alt) * f) - 3, 1.3);
      }
      g.fill({ color: P.rope });
    }
    // Places: a tick and a name.
    for (const pl of m.places) {
      const x = this.sx(pl.x);
      const y = this.sy(pl.alt);
      if (x < -60 || x > this.w + 60) {
        const t = this.placeLabels.get(pl.id);
        if (t) t.visible = false;
        continue;
      }
      g.moveTo(x, y - 4)
        .lineTo(x, y + 4)
        .stroke({ width: 1.5, color: P.ink });
      if (pl.id === m.hut) {
        g.poly([x - 9, y, x - 9, y - 9, x, y - 16, x + 9, y - 9, x + 9, y]).stroke({
          width: 1.5,
          color: P.ink,
        });
      }
      if (pl.id === m.summit) {
        g.moveTo(x, y - 4)
          .lineTo(x, y - 22)
          .stroke({ width: 1.3, color: P.ink });
        if (s.members.some((x2) => x2.summitAt !== null)) {
          g.poly([x, y - 22, x + 12, y - 18, x, y - 14]).fill({ color: P.rope });
        }
      }
      let t = this.placeLabels.get(pl.id);
      if (!t) {
        t = new Text({ text: pl.name, style: { fontFamily: 'Caveat', fontSize: 17, fill: P.soft } });
        t.anchor.set(0.5, 1);
        this.labels.addChild(t);
        this.placeLabels.set(pl.id, t);
      }
      t.visible = true;
      t.position.set(x, y - (pl.id === m.summit ? 26 : 10));
    }
  }

  private drawWeather(s: ClimbState, m: Mountain): void {
    const g = this.weather;
    g.clear();
    const P = this.pal;
    const wind = windAt(s.seed, s.weather, s.minute);
    const mod = s.minute % 1440;
    const t = s.minute;
    // Dusk and night: sky hatching that thickens.
    const dark =
      mod > m.duskMinuteOfDay - 60
        ? Math.min(1, (mod - (m.duskMinuteOfDay - 60)) / 120)
        : mod < 6 * 60
          ? 0.7
          : 0;
    if (dark > 0) {
      const step = 14 - 8 * dark;
      for (let x = -this.h; x < this.w; x += step) g.moveTo(x, 0).lineTo(x + this.h * 0.5, this.h * 0.5);
      g.stroke({ width: 1, color: P.sky, alpha: 0.12 + 0.2 * dark });
    }
    // Cloud building over the west as the storm comes.
    const toStorm = mod - s.weather.stormAt;
    if (toStorm > -180) {
      const grow = Math.min(1, (toStorm + 180) / 240);
      const cx = this.w * (0.15 + 0.25 * grow);
      for (let i = 0; i < 9; i++) {
        const r = (16 + 22 * grow) * (0.6 + hashUnit(s.seed, 5, i));
        g.circle(cx + (i - 4) * 22 * (0.7 + grow), 28 + 10 * hashUnit(s.seed, 6, i), r);
      }
      g.stroke({ width: 1.3, color: P.soft, alpha: 0.5 + 0.4 * grow });
    }
    // Wind streaks drift across.
    const n = Math.round(wind * 22);
    for (let i = 0; i < n; i++) {
      const y = 20 + this.h * 0.75 * hashUnit(s.seed, 8, i);
      const speed = 40 + 80 * wind;
      const x = ((hashUnit(s.seed, 9, i) * this.w * 2 + t * speed * 0.2) % (this.w + 120)) - 60;
      g.moveTo(x, y).bezierCurveTo(x + 10, y - 3, x + 20, y + 3, x + 30 + 20 * wind, y);
    }
    g.stroke({ width: 1, color: P.sky, alpha: 0.55 });
  }

  private drawPeople(s: ClimbState, _m: Mountain, dt: number): void {
    const g = this.figures;
    g.clear();
    const P = this.pal;
    const slots = new Map<string, number>();
    const spot = (key: string): number => {
      const k = slots.get(key) ?? 0;
      slots.set(key, k + 1);
      return k;
    };
    // Ropes between partners first, under the figures.
    const pos = new Map<string, ScreenPoint>();
    const slotOf = new Map<string, number>();
    const place2screen = (p: { x: number; alt: number }, key: string, id = ''): ScreenPoint => {
      const k = spot(key);
      slotOf.set(id, k);
      return { x: this.sx(p.x) + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 9, y: this.sy(p.alt) };
    };
    const lp = s.leader.pos;
    pos.set('leader', place2screen(posXY(s, lp), lp.place ?? `${lp.leg}:${lp.t.toFixed(2)}`));
    for (const mem of s.members) {
      const key = mem.pos.place ?? `${mem.pos.leg}:${mem.pos.t.toFixed(2)}`;
      pos.set(mem.id, place2screen(posXY(s, mem.pos), key, mem.id));
    }
    for (const mem of s.members) {
      if (!mem.ropedTo || mem.id > mem.ropedTo) continue;
      const a = pos.get(mem.id);
      const b = pos.get(mem.ropedTo);
      if (!a || !b) continue;
      g.moveTo(a.x, a.y - 11).quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + 4, b.x, b.y - 11);
      g.stroke({ width: 1.3, color: P.rope });
    }
    this.at.clear();
    for (const x of MEMBERS) {
      const mem = memberState(s, x.id);
      const p = personOf(s, x.id);
      const sp = pos.get(x.id);
      if (!sp) continue;
      this.at.set(x.id, sp);
      const look = lookOf(p);
      const moving = mem.move !== null;
      const ph =
        (this.phase.get(x.id) ?? x.mark) + (moving ? dt * 5 * look.stride * (1 - 0.4 * look.limp) : 0);
      this.phase.set(x.id, ph);
      const dir = mem.move?.dir === 'down' ? -1 : 1;
      const lsp = pos.get('leader');
      const toLeader = lsp ? Math.sign(lsp.x - sp.x) || dir : dir;
      const cold = coldAt(s.seed, s.weather, s.minute, posXY(s, mem.pos).alt);
      this.figure(g, sp.x, sp.y, {
        color: this.selected === x.id ? P.rope : P.ink,
        phase: ph,
        moving,
        dir,
        look,
        lookDir: look.gaze >= 0 ? toLeader : -toLeader,
        pack: mem.pack,
        cold,
      });
      let t = this.names.get(x.id);
      if (!t) {
        t = new Text({ text: x.name, style: { fontFamily: 'Caveat', fontSize: 16, fill: P.ink } });
        t.anchor.set(0.5, 0);
        this.labels.addChild(t);
        this.names.set(x.id, t);
      }
      t.style.fill = this.selected === x.id ? P.rope : mem.homeAt !== null ? P.soft : P.ink;
      // Names of people standing together stagger down in rows so they stay readable.
      t.position.set(sp.x, sp.y + 3 + ((slotOf.get(x.id) ?? 0) % 3) * 13);
    }
    const L = pos.get('leader');
    if (L) {
      this.at.set('leader', L);
      const ph = (this.phase.get('leader') ?? 0) + (s.leader.move ? dt * 5 : 0);
      this.phase.set('leader', ph);
      this.figure(g, L.x, L.y, {
        color: P.rope,
        phase: ph,
        moving: s.leader.move !== null,
        dir: s.leader.move?.dir === 'down' ? -1 : 1,
        look: {
          stride: 1,
          lean: 0.1,
          hunch: 0,
          limp: 0,
          gaze: 0,
          bowed: 0,
          blot: 0,
          downed: false,
          protest: false,
        },
        lookDir: s.leader.move?.dir === 'down' ? -1 : 1,
        pack: true,
        cold: 0,
        coil: true,
      });
      if (s.leader.fixing) {
        g.circle(L.x + 8, L.y - 18, 4).stroke({ width: 1.2, color: P.rope });
      }
    }
  }

  private figure(
    g: Graphics,
    x: number,
    y: number,
    o: {
      color: number;
      phase: number;
      moving: boolean;
      dir: number;
      look: ReturnType<typeof lookOf>;
      lookDir: number;
      pack: boolean;
      cold: number;
      coil?: boolean;
    },
  ): void {
    const { look } = o;
    const c = o.color;
    if (look.downed) {
      g.moveTo(x - 9, y - 2)
        .lineTo(x + 7, y - 3)
        .stroke({ width: 1.6, color: c });
      g.circle(x + 10, y - 4, 3.2).stroke({ width: 1.4, color: c });
      if (look.blot > 0) g.circle(x - 1, y - 3, 2 + 3 * look.blot).fill({ color: this.pal.ink, alpha: 0.85 });
      return;
    }
    const lean = (look.lean + (look.protest ? 0.12 : 0)) * o.dir;
    const hip = { x, y: y - 9 };
    const sh = { x: hip.x + Math.sin(lean) * 9, y: hip.y - Math.cos(lean) * 9 + look.hunch * 1.5 };
    const swing = o.moving ? Math.sin(o.phase) * 5 * look.stride : 1.5;
    const limp = o.moving ? Math.max(0, Math.sin(o.phase * 0.5)) * look.limp * 2 : 0;
    // Legs.
    g.moveTo(hip.x, hip.y).lineTo(hip.x + swing, y - limp);
    g.moveTo(hip.x, hip.y).lineTo(hip.x - swing, y);
    // Body.
    g.moveTo(hip.x, hip.y).lineTo(sh.x, sh.y);
    // Arms: hanging when tired, swinging when walking.
    const arm = o.moving ? -swing * 0.6 : 0;
    g.moveTo(sh.x, sh.y + 1.5).lineTo(sh.x + arm + o.dir * 2, sh.y + 7 - look.hunch);
    g.stroke({ width: 1.6, color: c, cap: 'round' });
    // Head: bowed by low mood, pulled in by fear; a nose tick says where they look.
    const hx = sh.x + Math.sin(lean) * 3.5 + o.lookDir * look.bowed * 1.2;
    const hy = sh.y - 4 + look.hunch * 1.6 + look.bowed * 1.5;
    g.circle(hx, hy, 3.3).stroke({ width: 1.4, color: c });
    g.moveTo(hx + o.lookDir * 3.3, hy + look.bowed).lineTo(hx + o.lookDir * 5.3, hy + 0.6 + look.bowed * 1.6);
    g.stroke({ width: 1.2, color: c });
    if (o.pack) {
      const bx = sh.x - o.dir * 3.5;
      g.roundRect(bx - 2.5, sh.y + 0.5, 5, 6.5, 1.2).stroke({ width: 1.2, color: c });
    }
    if (o.coil) g.circle(sh.x + o.dir * 1, sh.y + 3, 3).stroke({ width: 1.1, color: c });
    if (look.blot > 0.05)
      g.circle(hip.x + 0.5, hip.y - 3, 1.5 + 3 * look.blot).fill({ color: this.pal.ink, alpha: 0.85 });
    // Cold: short hatching around the shoulders.
    if (o.cold > 0.55) {
      const n = Math.round((o.cold - 0.5) * 10);
      for (let i = 0; i < n; i++) {
        const ax = x + (i % 2 === 0 ? -8 : 7) - i * 0.6;
        const ay = y - 18 + i * 3;
        g.moveTo(ax, ay).lineTo(ax + 3, ay - 3);
      }
      g.stroke({ width: 1, color: this.pal.sky });
    }
  }
}
