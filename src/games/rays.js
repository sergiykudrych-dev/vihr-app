// «Лучи»: цветные шарики в круге, от каждого веером расходятся лучи к стенке.
// Касания шариков между собой звучат громче всего.

import { Game } from './base.js';
import { NEON, withAlpha } from '../render/fx.js';

const R = 290;
const TAU = Math.PI * 2;
const RAYS = 34;
const SPREAD = 0.9; // ширина веера в радианах

export class RaysGame extends Game {
  setup() {
    const w = this.world;
    w.gravity = 0;
    w.minSpeed = 150;
    w.maxSpeed = 520;
    this.maxBalls = 8;
    w.arcs.push({ cx: 0, cy: 0, R, w: 3, start: 0, len: null, data: { note: 0 } });
    const colors = ['#FFD84A', '#FF5FB0', '#2BD66B', '#12C4FF'];
    colors.forEach((c, i) => {
      const a = (i / colors.length) * TAU + 0.6;
      w.addBall({ x: Math.cos(a) * 40, y: Math.sin(a) * 40, vx: Math.cos(a + 1.4) * 200, vy: Math.sin(a + 1.4) * 200, r: 22, color: c });
    });
  }

  tap(x, y) {
    if (Math.hypot(x, y) > R - 30) { const k = (R - 40) / Math.hypot(x, y); x *= k; y *= k; }
    if (this.world.balls.length >= this.maxBalls) this.world.balls.shift();
    const a = Math.random() * TAU;
    this.world.addBall({ x, y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, r: 22, color: NEON[Math.floor(Math.random() * NEON.length)] });
  }

  onBallBall(a, b, impact) {
    if (impact < 15) return;
    this.score += 2;
    this.sound(Math.floor(((Math.atan2(a.y, a.x) + Math.PI) / TAU) * 8) + 5, impact + 300);
  }

  onBallWall(b, w, impact) {
    if (impact < 30) return;
    this.score++;
    this.sound(Math.floor(((Math.atan2(b.y, b.x) + Math.PI) / TAU) * 8), impact);
  }

  drawWalls(ctx) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();

    ctx.lineWidth = 1;
    for (const b of this.world.balls) {
      // Веер смотрит от центра наружу
      const base = Math.atan2(b.y, b.x) || 0;
      const alpha = 0.6 + b.flash * 0.4;
      ctx.strokeStyle = withAlpha(b.color, alpha);
      ctx.beginPath();
      for (let k = 0; k < RAYS; k++) {
        const a = base - SPREAD / 2 + (k / (RAYS - 1)) * SPREAD;
        const dx = Math.cos(a), dy = Math.sin(a);
        // Пересечение луча с окружностью арены
        const bb = b.x * dx + b.y * dy;
        const cc = b.x * b.x + b.y * b.y - R * R;
        const t = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + dx * t, b.y + dy * t);
      }
      ctx.stroke();
    }
  }
}
