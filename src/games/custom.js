// «Своя игра» из конструктора: арена, шарики и правила «когда → тогда».

import { Game } from './base.js';
import { NEON, neonStroke } from '../render/fx.js';
import { t } from '../i18n/index.js';

const TAU = Math.PI * 2;
const R = 260;

export const DEFAULT_CONFIG = {
  name: t('Моя игра'),
  arena: 'hexagon',     // circle | hexagon | square | triangle
  gap: false,           // разрыв в стенке (шарики могут вылететь)
  gravity: 500,
  spin: 0.4,
  balls: 3,
  size: 12,
  bounce: 1,
  ballBall: ['note', 'flash'],       // note | flash | grow | sparks
  ballWall: ['note', 'sparks'],      // note | sparks | speed | recolor
};

export const RULE_ACTIONS = {
  ballBall: { note: t('Нота'), flash: t('Вспышка'), grow: t('Рост'), sparks: t('Искры') },
  ballWall: { note: t('Нота'), sparks: t('Искры'), speed: t('Ускорение'), recolor: t('Смена цвета') },
};

const SIDES = { triangle: 3, square: 4, hexagon: 6 };

export class CustomGame extends Game {
  setup() {
    const c = this.cfg = { ...DEFAULT_CONFIG, ...(this.options.config || {}) };
    const w = this.world;
    w.gravity = c.gravity;
    w.restitution = c.bounce;
    w.maxSpeed = 1000;
    w.minSpeed = c.gravity < 50 ? 220 : 0;
    this.maxBalls = 16;
    this.angle = 0;
    this.edges = [];

    if (c.arena === 'circle') {
      const gap = c.gap ? 0.7 : 0;
      this.ring = { cx: 0, cy: 0, R, w: 6, start: 0, len: TAU - gap, rot: 0, spin: c.spin, data: { note: 0, color: '#22E4F5' }, glow: 0 };
      w.arcs.push(this.ring);
    } else {
      const n = SIDES[c.arena] || 6;
      for (let i = 0; i < n; i++) {
        if (c.gap && i === 0) continue;
        const s = { ax: 0, ay: 0, bx: 0, by: 0, w: 6, i, data: { note: i, color: NEON[(i * 2) % NEON.length] }, glow: 0 };
        this.edges.push(s);
        w.segments.push(s);
      }
      this.sides = n;
      this.place();
    }
    for (let i = 0; i < c.balls; i++) this.spawn((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120);
  }

  place() {
    const n = this.sides;
    for (const s of this.edges) {
      const a0 = this.angle + (s.i / n) * TAU - Math.PI / 2;
      const a1 = this.angle + ((s.i + 1) / n) * TAU - Math.PI / 2;
      s.ax = Math.cos(a0) * R; s.ay = Math.sin(a0) * R;
      s.bx = Math.cos(a1) * R; s.by = Math.sin(a1) * R;
      const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      s.vx = -my * this.cfg.spin; s.vy = mx * this.cfg.spin;
    }
  }

  spawn(x, y) {
    const a = Math.random() * TAU;
    return this.world.addBall({ x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: this.cfg.size, color: NEON[this.world.balls.length % NEON.length] });
  }

  tap(x, y) {
    if (Math.hypot(x, y) > R * 0.8) { x *= 0.5; y *= 0.5; }
    if (this.world.balls.length >= this.maxBalls) this.world.balls.shift();
    this.spawn(x, y);
  }

  drag(da) { this.angle += da; if (this.ring) this.ring.rot += da; }

  onBallBall(a, b, impact) {
    if (impact < 25) return;
    const act = this.cfg.ballBall;
    this.score++;
    if (act.includes('note')) this.sound(8 + (Math.round(a.x / 60) % 5), impact);
    if (act.includes('flash')) this.fx.ring((a.x + b.x) / 2, (a.y + b.y) / 2, '#FFFFFF', 46, 0.4);
    if (act.includes('sparks')) this.fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, a.color, 10, 240, 0.5);
    if (act.includes('grow')) {
      for (const x of [a, b]) x.baseR = Math.min(this.cfg.size * 2.5, x.baseR + 1.2);
    }
  }

  onBallWall(b, wall, impact) {
    if (impact < 40) return;
    const act = this.cfg.ballWall;
    this.score++;
    wall.glow = 1;
    // В круге нота зависит от места удара, у многоугольника — от грани
    const note = this.ring ? Math.floor(((Math.atan2(b.y, b.x) + Math.PI) / TAU) * 8) : wall.data.note;
    if (act.includes('note')) this.sound(note, impact);
    if (act.includes('sparks')) this.fx.burst(b.x, b.y, wall.data.color || b.color, 8, 220, 0.5);
    if (act.includes('speed')) { b.vx *= 1.06; b.vy *= 1.06; }
    if (act.includes('recolor')) b.color = NEON[Math.floor(Math.random() * NEON.length)];
  }

  tick(dt) {
    if (this.ring) {
      this.ring.rot += this.cfg.spin * dt;
      this.ring.glow = Math.max(0, this.ring.glow - dt * 3);
    } else {
      this.angle += this.cfg.spin * dt;
      this.place();
      for (const e of this.edges) e.glow = Math.max(0, e.glow - dt * 3);
    }
    // Вылетевшие шарики возвращаем в центр
    for (const b of this.world.balls) {
      if (Math.hypot(b.x, b.y) > 400) { b.x = 0; b.y = 0; b.vx *= 0.5; b.vy *= 0.5; }
    }
  }

  drawWalls(ctx) {
    if (this.ring) {
      const r = this.ring;
      neonStroke(ctx, r.data.color, 6 * (1 + r.glow * 0.6), () => {
        ctx.beginPath(); ctx.arc(0, 0, R, r.rot, r.rot + r.len);
      }, 0.8 + r.glow);
      return;
    }
    for (const e of this.edges) {
      neonStroke(ctx, e.data.color, e.w * (1 + e.glow * 0.7), () => {
        ctx.beginPath(); ctx.moveTo(e.ax, e.ay); ctx.lineTo(e.bx, e.by);
      }, 0.8 + e.glow);
    }
  }
}
