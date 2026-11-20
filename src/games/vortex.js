// «Вихрь»: радужные кольца без конца плывут к центру, как воронка.
// - Самое внутреннее кольцо сжимается до размера шарика и само исчезает.
// - Шарик вылетел через отверстие — кольцо разбивается со звоном, внешние сдвигаются внутрь.
// - Когда кольцо исчезло (любым способом), снаружи появляется новое — игра бесконечная.

import { Game } from './base.js';
import { neonStroke } from '../render/fx.js';
import { paletteColors } from '../render/palettes.js';

const TAU = Math.PI * 2;
const RINGS = 13;        // сколько колец по умолчанию (круг чуть шире экрана)
const RINGS_MIN = 3;
const RINGS_MAX = 100;
const STEP = 34;         // расстояние между кольцами
const MIN_R = 9;         // до такого радиуса сжимается внутреннее кольцо (≈ размер шарика), потом исчезает
const DRIFT = 0.14;      // скорость «воронки»: колец в секунду, уходящих в центр сами по себе
const BALL_R = 7.5;
const COLOR_SPAN = 22;   // столько колец занимает палитра, дальше — обратно
const FADE_IN = 0.6;     // секунды, за которые проявляется новое кольцо снаружи
const GAP_LEN = 44;      // длина отверстия (шарик — 11)
const GAP_MAX = 1.2;     // максимальный угол отверстия у самых маленьких колец

export class VortexGame extends Game {
  setup() {
    this.padding = 1.04;
    this.world.gravity = 0;
    this.world.minSpeed = 260;
    this.world.maxSpeed = 900;
    this.world.ballCollisions = true;
    this.maxBalls = 4;
    this.serial = 0;   // номер следующего кольца — от него зависят цвет, вращение, наклон разрыва
    this.phase = 0;    // 0..1 — насколько внутреннее кольцо уже «уплыло» к центру
    this.rings = [];
    this.world.arcs = this.rings; // физика видит те же кольца
    this.ringCount = RINGS;
    for (let k = 0; k < this.ringCount; k++) {
      const r = this.makeRing();
      r.R = this.targetR(k);
      r.alpha = 1;
    }
    this.addCenterBall();
  }

  /** Где должно стоять кольцо номер k (0 — внутреннее). */
  targetR(k) {
    return MIN_R + (k + 1 - this.phase) * STEP;
  }

  makeRing() {
    const n = this.serial++;
    const ring = {
      cx: 0, cy: 0, R: 0, w: 4.5,
      start: 0, len: TAU - 0.5,
      rot: n * 0.42,                                        // разрывы складываются в спираль
      spin: (n % 2 ? -1 : 1) * (0.35 + (n % 12) * 0.035),  // соседние кольца крутятся в разные стороны
      data: { note: 0, serial: n },
      color: this.colorFor(n),
      pulse: 0,
      alpha: 0,
    };
    this.rings.push(ring);
    return ring;
  }

  // ===== Количество колец =====

  /** Что показать в настройках: готовые варианты и границы для ручного ввода. */
  ringOptions() {
    return { presets: [10, 22, 40, 60], min: RINGS_MIN, max: RINGS_MAX, value: this.ringCount };
  }

  /** Сменить число колец на лету: лишние внешние гаснут, недостающие проявляются снаружи. */
  setRingCount(n) {
    n = Math.max(RINGS_MIN, Math.min(RINGS_MAX, Math.round(n)));
    this.ringCount = n;
    while (this.rings.length > n) this.rings.pop();
    while (this.rings.length < n) this.addOuter();
  }

  // ===== Цвета =====

  setPalette(key, custom) {
    this.palette = key;
    this.paletteCustom = custom;
    this._colors = null;
    for (const r of this.rings) r.color = this.colorFor(r.data.serial);
  }

  colorFor(serial) {
    if (!this._colors) this._colors = paletteColors(this.palette || 'rainbow', COLOR_SPAN, this.paletteCustom);
    // Туда-обратно по палитре, чтобы цвета текли без резких скачков
    const period = (COLOR_SPAN - 1) * 2;
    const k = serial % period;
    return this._colors[k < COLOR_SPAN ? k : period - k];
  }

  // ===== Шарики =====

  addCenterBall() {
    const a = Math.random() * TAU;
    this.world.addBall({ x: 0, y: 0, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: BALL_R, color: '#FFFFFF' });
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

  // ===== Каждый кадр =====

  tick(dt) {
    // Воронка: все кольца понемногу плывут к центру
    this.phase += DRIFT * dt;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.vanishInner();
    }

    this.rings.forEach((r, k) => {
      // Плавно догоняем своё место (резко сдвигаться нельзя — шарик проскочит сквозь стенку)
      r.R += (this.targetR(k) - r.R) * Math.min(1, dt * 5);
      // Отверстие одной длины (чуть шире шарика) на любом кольце, у маленьких — не больше 0,8 рад
      r.len = TAU - Math.min(GAP_MAX, Math.max(0.55, GAP_LEN / r.R));
      r.rot += r.spin * dt;
      r.pulse = Math.max(0, r.pulse - dt * 3);
      r.alpha = Math.min(1, r.alpha + dt / FADE_IN);
      r.data.note = this.ringCount - k;
    });

    // Кольцо разбито, как только центр шарика оказался снаружи кольца
    for (const r of [...this.rings]) {
      if (this.world.balls.some((b) => Math.hypot(b.x, b.y) > r.R + r.w / 2 + 0.5)) this.breakRing(r);
    }

    // Шарик снаружи последнего кольца гаснет и исчезает
    const outer = this.rings[this.rings.length - 1];
    for (const b of this.world.balls) {
      const d = Math.hypot(b.x, b.y);
      if (outer && d > outer.R && !b.data.escaping) {
        b.data.escaping = 0.35;
        this.fx.burst(b.x, b.y, '#FFFFFF', 14, 260, 0.5);
      }
      if (b.data.escaping) {
        b.data.escaping -= dt;
        b.baseR = Math.max(0.5, b.baseR * 0.9);
      }
      this.unstick(b, d, dt);
    }
    this.world.balls = this.world.balls.filter((b) => !(b.data.escaping <= 0) && Math.hypot(b.x, b.y) < 900);

    // Шариков не осталось — через секунду новый в центре
    if (this.world.balls.length === 0) {
      this._respawnIn = (this._respawnIn ?? 1) - dt;
      if (this._respawnIn <= 0) { this._respawnIn = null; this.addCenterBall(); }
    }
  }

  /** Внутреннее кольцо сжалось до размера шарика — оно тихо исчезает, снаружи появляется новое. */
  vanishInner() {
    const r = this.rings[0];
    if (!r) return;
    this.rings.shift();
    this.score++;
    this.fx.burst(0, 0, r.color, 10, 120, 0.5);
    this.fx.ring(0, 0, r.color, 30, 0.5);
    this.sound(r.data.note + 4, 380);
    this.addOuter();
  }

  /** Шарик вылетел через отверстие — кольцо разбивается, внешние сдвигаются внутрь. */
  breakRing(r) {
    const i = this.rings.indexOf(r);
    if (i < 0) return;
    this.rings.splice(i, 1);
    this.score += 10;
    this.fx.shatterArc(0, 0, r.R, r.rot, r.len, r.color, 46);
    this.sound(r.data.note + 7, 900, { octave: 0 });
    this.sound(r.data.note + 9, 700);
    this.addOuter();
  }

  addOuter() {
    const r = this.makeRing();
    r.R = this.targetR(this.rings.length - 1);
    r.alpha = 0; // проявляется постепенно
  }

  /** Если шарик завис прямо в отверстии дольше полсекунды — выталкиваем его наружу. */
  unstick(b, d, dt) {
    const inGap = this.rings.some((r) => {
      if (Math.abs(d - r.R) > b.r + r.w) return false;
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

  drawWalls(ctx) {
    const viewR = (this.viewR || 2000) + 10;
    const visible = this.rings.filter((r) => r.R <= viewR).length;
    const lite = visible > 26; // много колец на экране — облегчённое свечение, чтобы не тормозило
    this.rings.forEach((r, k) => {
      if (r.R > viewR) return; // за краем экрана — не рисуем
      const color = this.react.color ? `hsl(${(this.hueShift + k * 28) % 360},92%,60%)` : r.color;
      ctx.globalAlpha = r.alpha;
      neonStroke(ctx, color, r.w * (1 + r.pulse * 0.12), () => {
        ctx.beginPath();
        ctx.arc(0, 0, r.R, r.rot, r.rot + r.len);
      }, 0.7 + r.pulse * 0.45, lite);
    });
    ctx.globalAlpha = 1;
  }
}
