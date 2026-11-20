// «Вихрь»: шарик в центре радужных колец. Кольца крутятся, у каждого есть разрыв.
// Удар о кольцо — нота, выход через разрыв — кольцо разбивается со звоном.

import { Game } from './base.js';
import { RAINBOW, neonStroke, withAlpha } from '../render/fx.js';

const TAU = Math.PI * 2;
const RINGS = 10;

export class VortexGame extends Game {
  setup() {
    this.world.gravity = 0;
    this.world.minSpeed = 260;
    this.world.maxSpeed = 900;
    this.world.ballCollisions = true;
    this.maxBalls = 6;
    this.reset();
  }

  reset() {
    this.world.arcs = [];
    this.world.balls = [];
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const gap = 0.55 - i * 0.025;
      const arc = {
        cx: 0, cy: 0, R: 62 + i * 23, w: 5,
        start: 0, len: TAU - gap, rot: Math.random() * TAU,
        spin: (i % 2 ? -1 : 1) * (0.5 + i * 0.06),
        data: { note: RINGS - i, ring: i },
        color: RAINBOW[i % RAINBOW.length],
        pulse: 0,
      };
      this.rings.push(arc);
      this.world.arcs.push(arc);
    }
    this.addCenterBall();
    this.cleared = 0;
  }

  addCenterBall() {
    const a = Math.random() * TAU;
    this.world.addBall({ x: 0, y: 0, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 9, color: '#FFFFFF' });
  }

  tap() {
    if (this.world.balls.length >= this.maxBalls) return;
    this.addCenterBall();
  }

  onBallWall(b, wall, impact) {
    if (impact < 30) return;
    this.score++;
    wall.pulse = 1;
    this.sound(wall.data.note, impact);
  }

  onBeat() {
    for (const r of this.rings) r.pulse = Math.max(r.pulse, 0.7);
    for (const b of this.world.balls) { b.vx *= 1.15; b.vy *= 1.15; b.flash = 1; }
  }

  tick(dt) {
    for (const r of this.rings) {
      if (r.broken) continue;
      r.rot += r.spin * dt;
      r.pulse = Math.max(0, r.pulse - dt * 3);
    }
    // Кольцо разбито, когда шарик вылетел за него
    for (const r of this.rings) {
      if (r.broken) continue;
      if (this.world.balls.some((b) => Math.hypot(b.x, b.y) > r.R + r.w + b.r)) this.breakRing(r);
    }
    // Улетевшие шарики убираем; если всё разбито — начинаем заново
    this.world.balls = this.world.balls.filter((b) => Math.hypot(b.x, b.y) < 420);
    const left = this.rings.filter((r) => !r.broken).length;
    if (left === 0 || this.world.balls.length === 0) {
      this._resetIn = (this._resetIn ?? 1.2) - dt;
      if (this._resetIn <= 0) { this._resetIn = null; this.reset(); }
    }
  }

  breakRing(r) {
    r.broken = true;
    const i = this.world.arcs.indexOf(r);
    if (i >= 0) this.world.arcs.splice(i, 1);
    this.score += 10;
    this.fx.shatterArc(0, 0, r.R, r.rot, r.len, r.color, 46);
    this.sound(r.data.note + 7, 900, { octave: 0 });
    this.sound(r.data.note + 9, 700);
  }

  drawWalls(ctx) {
    for (const r of this.rings) {
      if (r.broken) continue;
      const color = this.react.color ? `hsl(${(this.hueShift + r.data.ring * 28) % 360},92%,60%)` : r.color;
      neonStroke(ctx, color, r.w * (1 + r.pulse * 0.8), () => {
        ctx.beginPath();
        ctx.arc(0, 0, r.R, r.rot, r.rot + r.len);
      }, 0.7 + r.pulse);
    }
    // Тёмный центр
    ctx.fillStyle = withAlpha('#1A1740', 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, TAU);
    ctx.fill();
  }
}
