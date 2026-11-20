// «Соты» и «Мишень»: поле из сотен маленьких плиток, шарики врезаются в край и
// разбивают плитки — они разлетаются кусками, поле «съедается» снаружи к центру.
// В центре крутится воронка: шарик, добравшийся до неё, проваливается и
// возвращается снаружи. Когда плиток не осталось, поле собирается заново.
//
// layout: 'hex' — шестиугольные соты, 'sectors' — кольца из секторов (как мишень).

import { Game } from './base.js';
import { neonStroke, withAlpha, NEON } from '../render/fx.js';
import { paletteColors } from '../render/palettes.js';

const TAU = Math.PI * 2;
const WALL_R = 300;     // внешняя стенка
const FIELD_R = 232;    // до какого радиуса лежат плитки
const HOLE_R = 30;      // воронка в центре
const BALL_R = 12;
const SPEED = 380;
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
    for (let i = 0; i < 3; i++) this.addEdgeBall(i * TAU / 3 + 0.4);
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

  addEdgeBall(angle = Math.random() * TAU) {
    const R = (FIELD_R + WALL_R) / 2;
    // Летит в сторону поля, но не точно в центр
    const dir = angle + Math.PI + (Math.random() - 0.5) * 1.1;
    return this.world.addBall({
      x: Math.cos(angle) * R, y: Math.sin(angle) * R,
      vx: Math.cos(dir) * SPEED, vy: Math.sin(dir) * SPEED,
      r: BALL_R, color: NEON[(this.serialBall = (this.serialBall || 0) + 1) % NEON.length],
    });
  }

  tap(x, y) {
    if (this.world.balls.length >= this.maxBalls) return;
    this.addEdgeBall(Math.atan2(y, x));
  }

  onBallWall(b, wall, impact, type) {
    if (type === 'peg' && wall.data && wall.data.tile) {
      if (wall.dead) return;
      this.breakTile(wall, b);
      return;
    }
    if (impact < 30) return;
    this.wall.pulse = 1;
    this.sound(0, impact, { octave: -1 });
  }

  breakTile(t, b) {
    t.dead = true;
    t.r = -1e9; // физика больше не видит плитку
    this.score++;
    // Чем ближе к центру, тем выше нота
    const k = 1 - (t.d - HOLE_R) / (FIELD_R - HOLE_R);
    this.sound(Math.round(k * 11), 420);
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
    for (const b of this.world.balls) { b.vx *= 1.12; b.vy *= 1.12; b.flash = 1; }
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

    // Воронка: шарик, добравшийся до центра, проваливается и потом возвращается снаружи
    for (const b of [...this.world.balls]) {
      const d = Math.hypot(b.x, b.y);
      if (d < HOLE_R * 0.75) {
        this.fx.burst(b.x, b.y, b.color, 18, 260, 0.6);
        this.sound(11, 700, { octave: 1 });
        this.world.removeBall(b);
        this.respawn.push(0.9);
      } else if (d < HOLE_R * 1.6) {
        // Лёгкое притяжение у края воронки
        b.vx -= (b.x / d) * 600 * dt; b.vy -= (b.y / d) * 600 * dt;
      }
    }
    this.respawn = this.respawn.map((s) => s - dt);
    while (this.respawn.length && this.respawn[0] <= 0) { this.respawn.shift(); this.addEdgeBall(); }
    if (!this.world.balls.length && !this.respawn.length) this.addEdgeBall();

    // Поле пустое — собираем заново
    if (!this.tiles.length) {
      if (!this.rebuildIn) this.rebuildIn = REBUILD_DELAY;
      this.rebuildIn -= dt;
      if (this.rebuildIn <= 0) {
        this.rebuildIn = 0;
        this.buildField();
        // Шарики, оказавшиеся внутри поля, переносим наружу
        for (const b of this.world.balls) {
          const d = Math.hypot(b.x, b.y) || 1;
          if (d < FIELD_R + BALL_R + 4) { const k2 = (FIELD_R + 40) / d; b.x *= k2; b.y *= k2; }
        }
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

export class HoneycombGame extends SmashGame {
  constructor(o = {}) { super({ ...o, layout: 'hex' }); }
}
export class TargetGame extends SmashGame {
  constructor(o = {}) { super({ ...o, layout: 'sectors' }); }
}
