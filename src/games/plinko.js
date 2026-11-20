// «Плинко»: шарики падают сквозь колышки. Каждый ряд — своя нота, каждая лунка внизу — аккорд.

import { Game } from './base.js';
import { glowSprite, withAlpha } from '../render/fx.js';

const ROWS = 9;
const GAP = 50;
const TOP = -250;
const BIN_TOP = 200;
const BIN_BOTTOM = 300;
const BIN_COLORS = ['#3B9BFF', '#5FB6FF', '#22E4F5', '#2EE6C8', '#8B6CFF', '#2EE6C8', '#22E4F5', '#5FB6FF', '#3B9BFF', '#6C7CFF'];

export class PlinkoGame extends Game {
  setup() {
    const w = this.world;
    w.gravity = 900;
    w.restitution = 0.5;
    w.maxSpeed = 900;
    this.maxBalls = 40;

    // Колышки треугольником
    for (let row = 0; row < ROWS; row++) {
      const n = row + 3;
      for (let k = 0; k < n; k++) {
        w.pegs.push({ x: (k - (n - 1) / 2) * GAP, y: TOP + row * GAP * 0.92, r: 5, data: { note: ROWS - row }, glow: 0 });
      }
    }
    // Лунки
    const lastN = ROWS + 2;
    const halfW = ((lastN - 1) / 2) * GAP + GAP / 2;
    this.bins = [];
    for (let i = 0; i <= lastN; i++) {
      const x = -halfW + i * GAP;
      w.segments.push({ ax: x, ay: BIN_TOP, bx: x, by: BIN_BOTTOM, w: 3, data: { wall: true } });
      if (i < lastN) this.bins.push({ x0: x, x1: x + GAP, glow: 0, note: i });
    }
    w.segments.push({ ax: -halfW, ay: BIN_BOTTOM, bx: halfW, by: BIN_BOTTOM, w: 3, data: { floor: true } });
    // Боковые стенки-воронка
    w.segments.push({ ax: -halfW, ay: BIN_TOP, bx: -halfW - 10, by: TOP - 60, w: 3, data: { wall: true } });
    w.segments.push({ ax: halfW, ay: BIN_TOP, bx: halfW + 10, by: TOP - 60, w: 3, data: { wall: true } });
    this.halfW = halfW;
    this.idle = 0;
  }

  tap(x) {
    this.idle = 0;
    this.drop(Math.max(-60, Math.min(60, x)));
  }

  drop(x = (Math.random() - 0.5) * 40) {
    if (this.world.balls.length >= this.maxBalls) this.world.balls.shift();
    const hue = 200 + Math.random() * 70;
    this.world.addBall({ x, y: TOP - 50, vx: (Math.random() - 0.5) * 40, vy: 0, r: 10.5, color: `hsl(${hue},95%,68%)` });
  }

  onBeat() { this.drop(); }

  onBallWall(b, wall, impact, type) {
    if (type === 'peg') {
      wall.glow = 1;
      if (impact > 60) { this.score++; this.sound(wall.data.note, impact * 0.8); }
      return;
    }
    if (wall.data.floor && !b.data.landed) {
      b.data.landed = true;
      const bin = this.bins.find((bn) => b.x >= bn.x0 && b.x < bn.x1);
      if (bin) {
        bin.glow = 1;
        this.score += 5;
        this.sound(bin.note, 700, { octave: -1 });
        this.sound(bin.note + 2, 500, { octave: -1 });
        this.fx.burst(b.x, BIN_BOTTOM - 10, b.color, 12, 220, 0.6);
      }
    }
  }

  tick(dt) {
    for (const p of this.world.pegs) p.glow = Math.max(0, p.glow - dt * 2.5);
    for (const bn of this.bins) bn.glow = Math.max(0, bn.glow - dt * 1.5);
    // Сами по себе падают шарики, если никто не трогает экран
    this.idle += dt;
    this._auto = (this._auto || 0) + dt;
    if (this.idle > 2.5 && this._auto > 0.8) { this._auto = 0; this.drop(); }
    // Упавшие шарики постепенно убираем
    const landed = this.world.balls.filter((b) => b.data.landed);
    if (landed.length > 14) this.world.removeBall(landed[0]);
  }

  drawWalls(ctx) {
    for (const bn of this.bins) {
      if (bn.glow <= 0) continue;
      ctx.fillStyle = withAlpha(BIN_COLORS[bn.note % BIN_COLORS.length], bn.glow * 0.25);
      ctx.fillRect(bn.x0, BIN_TOP, bn.x1 - bn.x0, BIN_BOTTOM - BIN_TOP);
    }
    ctx.strokeStyle = '#5B57A8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const s of this.world.segments) {
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.world.pegs) {
      const g = 14 + p.glow * 22;
      ctx.drawImage(glowSprite('#8B8CFF'), p.x - g, p.y - g, g * 2, g * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.world.pegs) {
      ctx.fillStyle = p.glow > 0.3 ? '#FFFFFF' : '#C9C6FF';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
