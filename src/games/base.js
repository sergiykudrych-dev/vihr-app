// Базовый класс игры. Каждая игра: мир с физикой + правила звука + отрисовка.

import { World } from '../physics/world.js';
import { Particles, drawBall, NEON } from '../render/fx.js';
import { audio } from '../audio/engine.js';

export const ARENA = 320; // половина размера видимой области мира

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.world = new World(options.world || {});
    this.fx = new Particles();
    this.score = 0;
    this.time = 0;
    this.music = { beat: false, bass: 0, hue: 0 };
    this.react = { beat: true, bass: true, color: false };
    this.hueShift = 0;
    this.maxBalls = 12;
    this.world.onBallBall = (a, b, imp) => this.onBallBall(a, b, imp);
    this.world.onBallWall = (b, w, imp, type) => this.onBallWall(b, w, imp, type);
    this.setup();
  }

  setup() {}

  /** Нота от удара: громкость зависит от силы. */
  sound(index, impact, o) {
    const vel = Math.min(1, 0.25 + impact / 900);
    audio.hit(index, vel, o);
  }

  onBallBall(a, b, impact) {
    if (impact < 30) return;
    this.score++;
    this.sound(Math.round((a.x + b.x) / 80) + 4, impact);
    this.fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, a.color, 6, 200, 0.4);
  }

  onBallWall(b, wall, impact) {
    if (impact < 40) return;
    this.score++;
    this.sound((wall.data && wall.data.note) || 0, impact);
  }

  /** Касание экрана в координатах мира. */
  tap(x, y) {
    if (this.world.balls.length >= this.maxBalls) this.world.balls.shift();
    const a = Math.random() * Math.PI * 2;
    this.world.addBall({ x, y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 12, color: NEON[this.world.balls.length % NEON.length] });
  }

  drag() {}

  onBeat() {
    for (const b of this.world.balls) {
      const d = Math.hypot(b.x, b.y) || 1;
      b.vx += (b.x / d) * 120; b.vy += (b.y / d) * 120;
      b.flash = 1;
    }
  }

  update(dt, music) {
    this.time += dt;
    if (music) {
      this.music = music;
      if (music.beat && this.react.beat) this.onBeat();
      const k = this.react.bass ? 1 + music.bass * 0.6 : 1;
      for (const b of this.world.balls) b.r = b.baseR * k;
      if (this.react.color) this.hueShift = music.hue;
    }
    this.world.step(dt);
    this.fx.update(dt);
    this.tick(dt);
  }

  tick() {}

  draw(ctx) {
    this.drawWalls(ctx);
    this.fx.draw(ctx);
    this.drawBalls(ctx);
  }

  drawWalls() {}

  drawBalls(ctx) {
    for (const b of this.world.balls) drawBall(ctx, b);
  }
}
