// «Соты» и «Мишень»: поле из сотен маленьких плиток.
// Шарик летит по спирали к центру, проходит сквозь поле и лопает плитки со звуком.
// Каждая плитка его немного тормозит; когда он почти остановился — лопается сам,
// и снаружи появляется новый шарик, чуть быстрее прежнего.
// Шарик, долетевший до воронки в центре, проваливается в неё.
// Когда плиток не осталось, поле собирается заново.
//
// layout: 'hex' — шестиугольные соты, 'sectors' — кольца из секторов (как мишень).

import { Game } from './base.js';
import { neonStroke, withAlpha, NEON, drawBall } from '../render/fx.js';
import { paletteColors } from '../render/palettes.js';

const TAU = Math.PI * 2;
const WALL_R = 300;     // внешняя стенка
const FIELD_R = 232;    // до какого радиуса лежат плитки
const HOLE_R = 30;      // воронка в центре
const BALL_R = 16;   // как в примере: шарик размером с 2–3 плитки
const SPEED = 230;          // скорость первого шарика
const SPEED_UP = 1.07;      // каждый следующий шарик быстрее на 7%
const SPEED_MAX = 900;
const DRAG = 0.982;         // каждая лопнутая плитка оставляет шарику 98,2% скорости
const POP_AT = 0.22;        // лопается, когда скорость упала до 22% от стартовой
const SPIRAL = 0.11;        // насколько круто спираль уходит к центру
const COLORS = 24;      // оттенков в палитре
const REBUILD_DELAY = 1.2;

export class SmashGame extends Game {
  setup() {
    this.layout = this.options.layout || 'hex';
    this.padding = 1.06; // стенка почти по краям экрана
    this.world.gravity = 0;
    this.world.minSpeed = 300;
    this.world.maxSpeed = 820;
    this.world.ballCollisions = true;
    this.maxBalls = 30;
    this.ringColor = this.layout === 'hex' ? '#F2B530' : '#2EF0D8';
    this.deco = this.layout === 'hex' ? [62, 102, 142, 182, 240] : [70, 115, 160, 205, 252];
    // Внешняя стенка — сплошное кольцо
    this.wall = { cx: 0, cy: 0, R: WALL_R, w: 5, start: 0, len: TAU, rot: 0, data: { note: 0 }, pulse: 0 };
    this.world.arcs = [this.wall];
    this.debris = [];
    this.respawn = [];
    this.rebuildIn = 0;
    this.spin = 0;
    this.buildField();
    this.spirals = [];      // шарики на спирали (своя физика, не World)
    this.generation = 0;    // сколько шариков уже было — от этого скорость
    this.addSpiralBall(0.6);
  }

  // ===== Поле =====

  buildField() {
    const tiles = [];
    if (this.layout === 'hex') {
      const s = 11.5;                 // шаг сетки
      const h = s * Math.sqrt(3) / 2;
      for (let row = -Math.ceil(FIELD_R / h); row <= FIELD_R / h; row++) {
        for (let col = -Math.ceil(FIELD_R / s) - 1; col <= FIELD_R / s + 1; col++) {
          const x = col * s + (row & 1 ? s / 2 : 0), y = row * h;
          const d = Math.hypot(x, y);
          if (d > FIELD_R || d < HOLE_R + 8) continue;
          tiles.push({ x, y, r: s * 0.5, d, a: Math.atan2(y, x), size: s * 0.56 });
        }
      }
    } else {
      const band = 15;                // толщина кольца плиток
      for (let R0 = HOLE_R + 10; R0 + band <= FIELD_R + 1; R0 += band) {
        const n = Math.max(8, Math.round((TAU * (R0 + band / 2)) / 15));
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU, am = (a0 + a1) / 2, rm = R0 + band / 2;
          tiles.push({ x: Math.cos(am) * rm, y: Math.sin(am) * rm, r: band * 0.5, d: rm, a: am, r0: R0, r1: R0 + band, a0, a1 });
        }
      }
    }
    for (const t of tiles) { t.data = { tile: true }; t.grow = 0; t.delay = (t.d - HOLE_R) / FIELD_R * 0.8; }
    this.tiles = tiles;
    this.world.pegs = tiles;
    this.total = tiles.length;
    this.recolor();
  }

  recolor() {
    const cols = paletteColors(this.palette || this.defaultPalette, COLORS, this.paletteCustom);
    for (const t of this.tiles) {
      // Соты красим от центра к краю, мишень — по кругу (радуга по углу)
      const k = this.layout === 'hex'
        ? (t.d - HOLE_R) / (FIELD_R - HOLE_R)
        : ((t.a % TAU) + TAU) % TAU / TAU;
      // Радуга по кругу должна замыкаться без шва
      t.color = this.layout !== 'hex' && (this.palette || this.defaultPalette) === 'rainbow'
        ? `hsl(${Math.floor(k * COLORS) * (360 / COLORS)},90%,58%)`
        : cols[Math.min(COLORS - 1, Math.floor(k * COLORS))];
    }
  }

  get defaultPalette() { return this.layout === 'hex' ? 'gold' : 'rainbow'; }

  setPalette(key, custom) {
    this.palette = key;
    this.paletteCustom = custom;
    this.recolor();
  }

  // ===== Шарики =====

  addSpiralBall(angle = Math.random() * TAU, inherit = true) {
    const speed = Math.min(SPEED_MAX, SPEED * Math.pow(SPEED_UP, this.generation));
    if (inherit) this.generation++;
    const b = {
      a: angle, R: WALL_R - 26, speed, start: speed, dir: Math.random() < 0.5 ? 1 : -1,
      r: BALL_R, baseR: BALL_R, color: NEON[this.generation % NEON.length], flash: 0, hits: 0, born: 0,
      x: 0, y: 0, vx: 0, vy: 0,
    };
    this.place(b);
    this.spirals.push(b);
    return b;
  }

  place(b) {
    b.x = Math.cos(b.a) * b.R; b.y = Math.sin(b.a) * b.R;
  }

  tap(x, y) {
    if (this.spirals.length >= this.maxBalls) return;
    this.addSpiralBall(Math.atan2(y, x));
  }

  onBallWall() {}

  popBall(b, big = false) {
    this.fx.burst(b.x, b.y, b.color, big ? 30 : 22, big ? 340 : 260, 0.7);
    this.fx.burst(b.x, b.y, '#FFFFFF', 8, 180, 0.4);
    this.sound(big ? 11 : 0, 800, { octave: big ? 1 : -1, pack: 'bass' });
    b.dead = true;
  }

  breakTile(t, b) {
    t.dead = true;
    t.r = -1e9; // физика больше не видит плитку
    this.score++;
    // «Поп»: ноты идут вверх по гамме, пока шарик лопает плитки подряд
    b.hits++;
    this.sound(b.hits, 380, { pack: 'drops' });
    // Плитка вылетает куском: от шарика и чуть наружу, с вращением
    const dx = t.x - b.x, dy = t.y - b.y, dl = Math.hypot(dx, dy) || 1;
    const sp = 90 + Math.random() * 140;
    this.debris.push({
      t, x: t.x, y: t.y, vx: (dx / dl) * sp + b.vx * 0.15, vy: (dy / dl) * sp + b.vy * 0.15,
      rot: 0, vr: (Math.random() - 0.5) * 9, life: 1.1 + Math.random() * 0.5, age: 0,
    });
    this.fx.burst(t.x, t.y, t.color, 3, 160, 0.45);
  }

  onBeat() {
    this.wall.pulse = 1;
    for (const b of this.spirals) { b.speed = Math.min(SPEED_MAX, b.speed * 1.1); b.flash = 1; }
  }

  // ===== Каждый кадр =====

  tick(dt) {
    this.spin += dt;
    this.wall.pulse = Math.max(0, this.wall.pulse - dt * 3);
    // Поле проявляется от центра к краю
    for (const t of this.tiles) {
      if (t.grow >= 1) continue;
      t.delay -= dt;
      if (t.delay <= 0) t.grow = Math.min(1, t.grow + dt * 3);
    }

    // Убираем разбитые плитки из физики
    if (this.tiles.some((t) => t.dead)) {
      this.tiles = this.tiles.filter((t) => !t.dead);
      this.world.pegs = this.tiles;
    }

    // Осколки-плитки
    for (const p of this.debris) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.vx *= 1 - dt * 0.6; p.vy *= 1 - dt * 0.6;
    }
    this.debris = this.debris.filter((p) => p.age < p.life);

    // Шарики на спирали
    for (const b of this.spirals) {
      b.born += dt;
      b.flash = Math.max(0, b.flash - dt * 3);
      const steps = Math.max(1, Math.ceil((b.speed * dt) / 6));
      const h = dt / steps;
      for (let i = 0; i < steps && !b.dead; i++) {
        // По кругу со скоростью speed и понемногу к центру — получается спираль
        b.a += (b.dir * b.speed * h) / Math.max(b.R, 40);
        b.R -= b.speed * SPIRAL * h;
        this.place(b);
        b.vx = -Math.sin(b.a) * b.speed * b.dir; b.vy = Math.cos(b.a) * b.speed * b.dir;
        for (const t of this.tiles) {
          if (t.dead) continue;
          const dx = t.x - b.x, dy = t.y - b.y;
          if (dx * dx + dy * dy < (b.r + t.r) * (b.r + t.r)) {
            this.breakTile(t, b);
            b.speed *= DRAG;
            b.flash = 0.45; // ярче свечение, но цвет остаётся
          }
        }
        if (b.R < HOLE_R * 0.8) this.popBall(b, true);               // упал в воронку
        else if (b.speed < b.start * POP_AT) this.popBall(b);       // выдохся — лопается
      }
    }
    const popped = this.spirals.filter((b) => b.dead).length;
    if (popped) {
      this.spirals = this.spirals.filter((b) => !b.dead);
      for (let i = 0; i < popped; i++) this.respawn.push(0.5);
    }
    this.respawn = this.respawn.map((t) => t - dt);
    while (this.respawn.length && this.respawn[0] <= 0) { this.respawn.shift(); this.addSpiralBall(); }
    if (!this.spirals.length && !this.respawn.length) this.addSpiralBall();

    // Поле пустое — собираем заново
    if (!this.tiles.length) {
      if (!this.rebuildIn) this.rebuildIn = REBUILD_DELAY;
      this.rebuildIn -= dt;
      if (this.rebuildIn <= 0) {
        this.rebuildIn = 0;
        this.buildField();
      }
    }
  }

  // ===== Рисование =====

  tilePath(ctx, t, scale = 1) {
    if (this.layout === 'hex') {
      const r = t.size * scale;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * TAU) / 6;
        const x = t.x + Math.cos(a) * r, y = t.y + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    } else {
      const gap = 0.9, rm = (t.r0 + t.r1) / 2, am = (t.a0 + t.a1) / 2;
      const r0 = rm - ((rm - t.r0) - gap) * scale, r1 = rm + ((t.r1 - rm) - gap) * scale;
      const ga = gap / rm, a0 = am - ((am - t.a0) - ga) * scale, a1 = am + ((t.a1 - am) - ga) * scale;
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.arc(0, 0, r0, a0, a1);
      ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.arc(0, 0, r1, a1, a0, true);
      ctx.closePath();
    }
  }

  drawWalls(ctx) {
    // Воронка в центре: вращающиеся многоугольники, уходящие вглубь
    for (let k = 0; k < 7; k++) {
      const r = HOLE_R * (1 - k / 7.5);
      const rot = this.spin * (0.9 + k * 0.15) + k * 0.3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * TAU) / 6;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.strokeStyle = withAlpha(this.ringColor, 0.55 - k * 0.06);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, HOLE_R * 0.6);
    core.addColorStop(0, '#FFFFFF'); core.addColorStop(0.25, '#E04BFF'); core.addColorStop(1, 'rgba(224,75,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, HOLE_R * (0.55 + Math.sin(this.spin * 4) * 0.05), 0, TAU); ctx.fill();

    // Плитки: группируем по цвету, рисуем одним путём на цвет
    const groups = new Map();
    for (const t of this.tiles) {
      let g = groups.get(t.color); if (!g) groups.set(t.color, (g = []));
      g.push(t);
    }
    ctx.globalAlpha = this.layout === 'hex' ? 0.8 : 0.85;
    for (const [color, list] of groups) {
      ctx.beginPath();
      for (const t of list) this.tilePath(ctx, t, t.grow);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Декоративные кольца поверх поля и внешняя стенка
    for (const R of this.deco) {
      neonStroke(ctx, this.ringColor, 2.6, () => { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); }, 0.8, true);
    }
    neonStroke(ctx, this.ringColor, 4 + this.wall.pulse * 2, () => { ctx.beginPath(); ctx.arc(0, 0, WALL_R, 0, TAU); }, 1 + this.wall.pulse * 0.5);

    // Летящие куски плиток
    for (const p of this.debris) {
      const k = 1 - p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.translate(-p.t.x, -p.t.y);
      ctx.globalAlpha = Math.max(0, k);
      ctx.beginPath(); this.tilePath(ctx, p.t, 0.6 + k * 0.4);
      ctx.fillStyle = p.t.color; ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

SmashGame.prototype.drawBalls = function drawSpiralBalls(ctx) {
  for (const b of this.spirals) {
    // Пока шарик быстрый — яркий, к концу тускнеет и чуть сжимается
    const k = Math.min(1, (b.speed / b.start - POP_AT) / (1 - POP_AT));
    drawBall(ctx, { ...b, r: b.r * (0.75 + 0.25 * k) });
  }
};

export class HoneycombGame extends SmashGame {
  constructor(o = {}) { super({ ...o, layout: 'hex' }); }
}
export class TargetGame extends SmashGame {
  constructor(o = {}) { super({ ...o, layout: 'sectors' }); }
}
