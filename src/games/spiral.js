// «Спираль»: десятки тонких колец, разрывы выстроены по спирали и вращаются вместе —
// получается тёмный «рукав». Шарик отскакивает внутри; проскочив через разрыв,
// он разбивает кольцо — оно рассыпается точками и гаснет, дыра в центре растёт.
// Когда разбиты все кольца, спираль собирается заново.

import { Game } from './base.js';
import { paletteColors } from '../render/palettes.js';
import { drawBall } from '../render/fx.js';

const TAU = Math.PI * 2;
const RINGS = 80;
const RINGS_MIN = 20;
const RINGS_MAX = 160;
const INNER_R = 26;       // первое кольцо
const OUTER_R = 430;      // последнее кольцо (за краями экрана, как в примере)
const GAP = 0.95;         // ширина разрыва, рад (~55°)
const TWIST = 0.042;      // поворот разрыва от кольца к кольцу — спираль закручена сильнее
const SPIN = 0.55;        // вращение спирали, рад/с
const BALL_R = 5.5;
const GRAVITY = 55;       // шарик всё время тянет вниз с одной и той же силой

export class SpiralGame extends Game {
  setup() {
    this.padding = 1.04;
    this.world.gravity = GRAVITY;
    this.world.minSpeed = 0;     // шарик летит по траектории под действием притяжения вниз
    this.world.maxSpeed = 520;
    this.world.restitution = 0.93; // отскок сильнее — шарик отбивается от линий
    this.world.ballCollisions = true;
    this.maxBalls = 1;   // всегда ровно один шарик
    this.ringCount = RINGS;
    this.defaultPalette = 'amber';
    this.dust = [];        // рассыпающиеся кольца
    this.rebuildIn = 0;
    this.build();
    this.addBall();
  }

  build() {
    this.world.gravity = GRAVITY;
    const n = this.ringCount;
    const step = (OUTER_R - INNER_R) / Math.max(1, n - 1);
    this.w = Math.max(1.2, Math.min(3, step * 0.62));
    this.rings = [];
    for (let k = 0; k < n; k++) {
      this.rings.push({
        cx: 0, cy: 0, R: INNER_R + k * step, w: this.w,
        start: 0, len: TAU - GAP, rot: k * TWIST + (this.rot0 || 0),
        // spin: 0 — стенка не подталкивает шарик по кругу (вращается только рисунок)
        spin: 0, data: { note: k }, k, color: '#fff', glow: 0, alpha: 0, delay: k * 0.012,
      });
    }
    this.world.arcs = this.rings.slice();
    this.recolor();
  }

  recolor() {
    const cols = paletteColors(this.palette || this.defaultPalette, this.ringCount, this.paletteCustom);
    for (const r of this.rings) r.color = cols[r.k];
  }

  setPalette(key, custom) { this.palette = key; this.paletteCustom = custom; this.recolor(); }

  ringOptions() { return { presets: [40, 80, 120, 160], min: RINGS_MIN, max: RINGS_MAX, value: this.ringCount }; }

  setRingCount(n) {
    this.ringCount = Math.max(RINGS_MIN, Math.min(RINGS_MAX, Math.round(n)));
    this.restart();
  }

  restart() {
    this.dust = [];
    this.world.balls = [];
    this.build();
    this.addBall();
  }

  addBall() {
    const a = Math.random() * TAU;
    this.world.addBall({ x: 0, y: 0, vx: Math.cos(a) * 180, vy: -120, r: BALL_R, color: '#2EF0E0' });
  }

  tap(x, y) {
    if (this.world.balls.length >= this.maxBalls) return;
    // Новый шарик появляется в центре
    this.addBall();
  }

  onBallWall(b, ring, impact) {
    // Трение о стенку: шарик не катается по кругу, а оседает вниз
    b.vx *= 0.985; b.vy *= 0.985;
    if (impact < 25) return;
    ring.glow = 1;
    this.sound(ring.k, impact, { pack: 'glass' });
  }

  onBeat() {
    for (const b of this.world.balls) { b.vx *= 1.06; b.vy *= 1.06; b.flash = 1; }
  }

  breakRing(r) {
    this.score++;
    const i = this.world.arcs.indexOf(r);
    if (i >= 0) this.world.arcs.splice(i, 1);
    r.broken = true;
    // Кольцо рассыпается точками
    this.dust.push({ R: r.R, rot: r.rot, len: r.len, color: r.color, age: 0, life: 1.4 });
    this.sound(r.k + 3, 600, { octave: 1, pack: 'glass' });
  }

  tick(dt) {
    for (const r of this.rings) {
      r.rot += SPIN * dt;
      r.glow = Math.max(0, r.glow - dt * 3);
      if (r.alpha < 1) { r.delay -= dt; if (r.delay <= 0) r.alpha = Math.min(1, r.alpha + dt * 4); }
    }
    this.rot0 = this.rings.length ? this.rings[0].rot : (this.rot0 || 0) + SPIN * dt;

    // Шарик вышел за внутреннее целое кольцо — кольцо разбивается
    for (const b of this.world.balls) {
      const d = Math.hypot(b.x, b.y);
      for (const r of this.world.arcs.slice()) {
        if (d - b.r > r.R + r.w / 2) this.breakRing(r); else break;
      }
    }

    for (const p of this.dust) { p.age += dt; p.R += 18 * dt; p.rot += SPIN * dt; }
    this.dust = this.dust.filter((p) => p.age < p.life);

    // Все кольца разбиты — собираем заново, шарики возвращаем в центр
    if (!this.world.arcs.length) {
      if (!this.rebuildIn) this.rebuildIn = 1.2;
      this.rebuildIn -= dt;
      if (this.rebuildIn <= 0) {
        this.rebuildIn = 0;
        this.build();
        for (const b of this.world.balls) { b.x = (Math.random() - 0.5) * 6; b.y = (Math.random() - 0.5) * 6; }
      }
    }
    // Шарик улетел совсем далеко (за экран) — возвращаем в центр
    for (const b of this.world.balls) if (Math.hypot(b.x, b.y) > OUTER_R + 120) { b.x = 0; b.y = 0; }
  }

  drawWalls(ctx) {
    const view = (this.viewR || 400) + 10;
    for (const r of this.rings) {
      if (r.broken || r.R > view || r.alpha <= 0) continue;
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * (1 + r.glow * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, r.R, r.rot, r.rot + r.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Рассыпающиеся кольца — точки
    for (const p of this.dust) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const step = 5.5 / p.R, size = 1.6 + k;
      ctx.beginPath();
      for (let a = 0; a < p.len; a += step) {
        const x = Math.cos(p.rot + a) * p.R, y = Math.sin(p.rot + a) * p.R;
        ctx.rect(x - size / 2, y - size / 2, size, size);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBalls(ctx) { for (const b of this.world.balls) drawBall(ctx, b, -1); }
}
