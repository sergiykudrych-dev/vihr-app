// «Шестиугольник»: мяч прыгает внутри вращающейся фигуры. У каждой грани свой цвет и нота.
// Свайп по экрану крутит фигуру.

import { Game } from './base.js';
import { neonStroke } from '../render/fx.js';

const COLORS = ['#FF4D5A', '#FFD84A', '#4BF28A', '#2EE6C8', '#3B9BFF', '#E04BFF'];
const SIDES = 6;
const R = 250;

export class HexagonGame extends Game {
  setup() {
    const w = this.world;
    w.gravity = 650;
    w.restitution = 1;
    w.maxSpeed = 1100;
    this.maxBalls = 10;
    this.angle = 0;
    this.spin = 0.45;
    this.edges = [];
    for (let i = 0; i < SIDES; i++) {
      const s = { ax: 0, ay: 0, bx: 0, by: 0, w: 6, data: { note: i, color: COLORS[i] }, glow: 0 };
      this.edges.push(s);
      w.segments.push(s);
    }
    this.place();
    w.addBall({ x: 0, y: -60, vx: 180, vy: 0, r: 13, color: '#FFFFFF' });
  }

  place() {
    for (let i = 0; i < SIDES; i++) {
      const a0 = this.angle + (i / SIDES) * Math.PI * 2;
      const a1 = this.angle + ((i + 1) / SIDES) * Math.PI * 2;
      const s = this.edges[i];
      s.ax = Math.cos(a0) * R; s.ay = Math.sin(a0) * R;
      s.bx = Math.cos(a1) * R; s.by = Math.sin(a1) * R;
      // Скорость середины грани — шарик получает толчок от вращения
      const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      s.vx = -my * this.spin; s.vy = mx * this.spin;
    }
  }

  tap(x, y) {
    if (Math.hypot(x, y) > R * 0.8) { x *= 0.6; y *= 0.6; }
    super.tap(x, y);
  }

  drag(da) { this.angle += da; this.spin = this.spin * 0.7 + (da * 60) * 0.3; }

  onBeat() { this.spin += Math.sign(this.spin || 1) * 0.6; super.onBeat(); }

  onBallWall(b, wall, impact) {
    if (impact < 40) return;
    this.score++;
    wall.glow = 1;
    b.color = wall.data.color;
    this.sound(wall.data.note, impact);
    this.fx.burst(b.x, b.y, wall.data.color, 8, 220, 0.5);
  }

  tick(dt) {
    this.spin += (0.45 * Math.sign(this.spin || 1) - this.spin) * dt * 0.6;
    this.angle += this.spin * dt;
    this.place();
    for (const e of this.edges) e.glow = Math.max(0, e.glow - dt * 3);
    // На всякий случай: шарик, выбитый за фигуру, возвращаем в центр
    for (const b of this.world.balls) {
      if (Math.hypot(b.x, b.y) > R + 40) { b.x = 0; b.y = 0; }
    }
  }

  drawWalls(ctx) {
    for (const e of this.edges) {
      neonStroke(ctx, e.data.color, e.w * (1 + e.glow * 0.7), () => {
        ctx.beginPath(); ctx.moveTo(e.ax, e.ay); ctx.lineTo(e.bx, e.by);
      }, 0.8 + e.glow);
    }
  }
}
