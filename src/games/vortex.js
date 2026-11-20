// «Вихрь»: шарик в центре радужных колец. Кольца крутятся, у каждого есть разрыв.
// Удар о кольцо — нота, выход через разрыв — кольцо разбивается со звоном.

import { Game } from './base.js';
import { neonStroke, withAlpha } from '../render/fx.js';
import { paletteColors } from '../render/palettes.js';

const TAU = Math.PI * 2;
const RINGS = 22;           // круг чуть шире экрана, сверху и снизу — тёмное поле
const INNER_R = 44;         // радиус первого кольца
const STEP = 18;            // расстояние между кольцами
const COLOR_SPAN = 22;      // палитра от центра до последнего кольца
const SHRINK = STEP * 0.7;  // на сколько сужаются оставшиеся кольца, когда одно разбили

export class VortexGame extends Game {
  setup() {
    this.padding = 1.04; // кольца крупные, почти от края до края
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
      const R = INNER_R + i * STEP;
      // Разрыв примерно одной длины на всех кольцах (на внешних — меньший угол)
      const gap = Math.max(0.28, 34 / R);
      const arc = {
        cx: 0, cy: 0, R, baseR: R, w: 4.5,
        start: 0, len: TAU - gap,
        // Разрывы выстроены спиралью — как в залипательных роликах
        rot: i * 0.42,
        // Внешние кольца крутятся не быстрее внутренних — иначе края экрана мельтешат
        spin: (i % 2 ? -1 : 1) * (0.35 + (i % COLOR_SPAN) * 0.035),
        data: { note: RINGS - i, ring: i },
        color: '#FFFFFF', // задаётся палитрой ниже
        pulse: 0,
      };
      this.rings.push(arc);
      this.world.arcs.push(arc);
    }
    this.shrink = 0;      // на сколько должны сузиться кольца
    this.shrinkAnim = 0;  // плавная версия — кольца сжимаются постепенно
    this.applyPalette();
    this.addCenterBall();
    this.cleared = 0;
  }

  /** Сменить цвета колец на лету. key — из src/render/palettes.js */
  setPalette(key, custom) {
    this.palette = key;
    this.paletteCustom = custom;
    this.applyPalette();
  }

  applyPalette() {
    // Палитра идёт от центра до края ширины экрана, дальше — обратно (туда-сюда),
    // поэтому кольца у верха и низа экрана продолжают тот же плавный переход
    const colors = paletteColors(this.palette || 'rainbow', COLOR_SPAN, this.paletteCustom);
    const period = (COLOR_SPAN - 1) * 2;
    this.rings.forEach((r, i) => {
      const k = i % period;
      r.color = colors[k < COLOR_SPAN ? k : period - k];
    });
  }

  addCenterBall() {
    const a = Math.random() * TAU;
    this.world.addBall({ x: 0, y: 0, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 5.5, color: '#FFFFFF' });
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
    // Плавное сужение после разбитого кольца
    this.shrinkAnim += (this.shrink - this.shrinkAnim) * Math.min(1, dt * 3);
    for (const r of this.rings) {
      if (r.broken) continue;
      r.R = r.baseR - this.shrinkAnim;
      r.rot += r.spin * dt;
      r.pulse = Math.max(0, r.pulse - dt * 3);
    }
    // Кольцо разбито, как только центр шарика оказался снаружи кольца.
    // (Стенка не пускает шарик сквозь себя, значит снаружи он мог оказаться только через отверстие.)
    for (const r of this.rings) {
      if (r.broken) continue;
      if (this.world.balls.some((b) => Math.hypot(b.x, b.y) > r.R + r.w / 2 + 0.5)) this.breakRing(r);
    }
    // Шарик, который вылетел за последнее целое кольцо, свободен: он гаснет и исчезает
    for (const b of this.world.balls) {
      const d = Math.hypot(b.x, b.y);
      const outside = !this.rings.some((r) => !r.broken && r.R > d);
      if (outside && !b.data.escaping) {
        b.data.escaping = 0.35;
        this.fx.burst(b.x, b.y, '#FFFFFF', 14, 260, 0.5);
        this.fx.ring(b.x, b.y, '#FFFFFF', 30, 0.4);
      }
      if (b.data.escaping) {
        b.data.escaping -= dt;
        b.baseR = Math.max(0.5, b.baseR * 0.9);
      }
      this.unstick(b, d, dt);
    }
    this.world.balls = this.world.balls.filter((b) => !(b.data.escaping <= 0) && Math.hypot(b.x, b.y) < 900);
    // Если всё разбито или шариков не осталось — начинаем заново
    const left = this.rings.filter((r) => !r.broken).length;
    if (left === 0 || this.world.balls.length === 0) {
      this._resetIn = (this._resetIn ?? 1.2) - dt;
      if (this._resetIn <= 0) { this._resetIn = null; this.reset(); }
    }
  }

  /** Если шарик завис прямо в отверстии кольца дольше полсекунды — выталкиваем его наружу. */
  unstick(b, d, dt) {
    const inGap = this.rings.some((r) => {
      if (r.broken || Math.abs(d - r.R) > b.r + r.w) return false;
      const a = (((Math.atan2(b.y, b.x) - r.rot) % TAU) + TAU) % TAU;
      return a > r.len;
    });
    b.data.gapTime = inGap ? (b.data.gapTime || 0) + dt : 0;
    if (b.data.gapTime > 0.5 && d > 0.01) {
      const sp = Math.max(260, b.speed);
      b.vx = (b.x / d) * sp; b.vy = (b.y / d) * sp;
      b.x += (b.x / d) * (b.r + 6); b.y += (b.y / d) * (b.r + 6);
      b.data.gapTime = 0;
    }
  }

  breakRing(r) {
    r.broken = true;
    this.shrink += SHRINK; // все оставшиеся кольца чуть сужаются
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
      neonStroke(ctx, color, r.w * (1 + r.pulse * 0.12), () => {
        ctx.beginPath();
        ctx.arc(0, 0, r.R, r.rot, r.rot + r.len);
      }, 0.7 + r.pulse * 0.45);
    }
    // Тёмный центр
    ctx.fillStyle = withAlpha('#1A1740', 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
  }
}
