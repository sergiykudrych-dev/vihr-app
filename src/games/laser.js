// «Лазерное кольцо»: шарики летают в круге и тянут лучи к точкам, где ударились о стенку.

import { Game } from './base.js';
import { NEON, neonStroke, withAlpha } from '../render/fx.js';

const R = 280;
const MAX_POINTS = 7;
const TAU = Math.PI * 2;

export class LaserGame extends Game {
  setup() {
    const w = this.world;
    w.gravity = 0;
    w.minSpeed = 300;
    w.maxSpeed = 800;
    this.maxBalls = 10;
    this.ring = { cx: 0, cy: 0, R, w: 6, start: 0, len: null, data: { note: 0 } };
    w.arcs.push(this.ring);
    this.ringGlow = 0;
    const colors = ['#4BF28A', '#FF4FD8', '#22E4F5', '#FFD84A', '#B25BFF'];
    colors.forEach((c, i) => {
      const a = (i / colors.length) * TAU;
      const b = w.addBall({ x: Math.cos(a) * 120, y: Math.sin(a) * 120, vx: Math.cos(a + 2) * 340, vy: Math.sin(a + 2) * 340, r: 13, color: c });
      b.data.points = [];
    });
  }

  tap(x, y) {
    if (Math.hypot(x, y) > R - 20) { const k = (R - 30) / Math.hypot(x, y); x *= k; y *= k; }
    if (this.world.balls.length >= this.maxBalls) this.world.balls.shift();
    const a = Math.random() * TAU;
    const b = this.world.addBall({ x, y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 13, color: NEON[Math.floor(Math.random() * NEON.length)] });
    b.data.points = [];
  }

  onBallWall(b, wall, impact) {
    const pts = b.data.points || (b.data.points = []);
    pts.push({ x: b.x, y: b.y });
    if (pts.length > MAX_POINTS) pts.shift();
    this.ringGlow = 1;
    this.score++;
    // Нота по сектору круга — у каждой части стены свой тон
    const sector = Math.floor(((Math.atan2(b.y, b.x) + Math.PI) / TAU) * 10);
    this.sound(sector, impact);
    this.fx.burst(b.x, b.y, b.color, 5, 160, 0.35);
  }

  onBallBall(a, b, impact) {
    if (impact < 20) return;
    this.score += 2;
    this.sound(12 + (this.score % 5), impact, { octave: 1 });
    this.fx.ring((a.x + b.x) / 2, (a.y + b.y) / 2, '#FFFFFF', 40, 0.4);
  }

  tick(dt) { this.ringGlow = Math.max(0, this.ringGlow - dt * 2); }

  drawWalls(ctx) {
    // Лучи
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.4;
    for (const b of this.world.balls) {
      const pts = b.data.points || [];
      pts.forEach((p, i) => {
        ctx.strokeStyle = withAlpha(b.color, 0.25 + (i / pts.length) * 0.6);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
    }
    ctx.globalCompositeOperation = 'source-over';
    const color = this.react.color ? `hsl(${this.hueShift},92%,60%)` : '#FFE45A';
    neonStroke(ctx, color, 5, () => { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); }, 0.8 + this.ringGlow * 0.6);
  }
}
