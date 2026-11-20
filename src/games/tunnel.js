// «Туннель»: сотни тонких колец на весь экран. Шарик-комета летает внутри центрального кольца.
// Нашёл разрыв — пролетает сквозь кольца подряд, счётчик в центре уменьшается,
// а вся картинка «затягивается» к центру, так что центральное кольцо всегда одного размера.
//
// Физика своя (без World): колец слишком много, а шарик всегда внутри одного — текущего.

import { Game } from './base.js';
import { neonStroke, withAlpha, hsl } from '../render/fx.js';
import { PALETTES, mixStops } from '../render/palettes.js';
import { audio } from '../audio/engine.js';

const TAU = Math.PI * 2;
const TOTAL = 900;        // сколько колец в начале
const CENTER_R = 135;     // радиус центрального кольца на экране
const STEP = 6.2;         // расстояние между кольцами
const GAP = 0.8;          // ширина разрыва (радианы) — одинаковая, поэтому «клин» расширяется к краю
const TWIST = 0.004;      // каждое следующее кольцо чуть повёрнуто — край клина неровный
const SPIN = 0.55;        // скорость вращения колец
const SPEED = 560;        // скорость шарика
const BALL_R = 6;
const COLOR_PERIOD = 70;  // через сколько колец повторяется палитра

// Музыка под шарик: пробил кольцо — громче, ударился о стенку — тише
const MUSIC_START = 0.45; // громкость трека в начале игры (доля от настройки «Трек»)
const MUSIC_MIN = 0.12;   // тише этого трек не становится
const MUSIC_UP = 0.08;    // + за каждое пробитое кольцо
const MUSIC_DOWN = 0.07;  // − за каждый удар о стенку

function rand(i) {
  // Детерминированный «случай» для кольца i — чтобы неровность не мигала
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class TunnelGame extends Game {
  setup() {
    this.padding = 1;
    this.hideScore = true;     // счётчик рисуем сами, в центре
    this.maxBalls = 5;
    this.world.balls = [];
    this.palette = 'rainbow';
    this.reset();
  }

  reset() {
    this.musicLevel = MUSIC_START;
    this.c = 0;              // индекс текущего (центрального) кольца
    this.cAnim = 0;          // плавная версия — для «затягивания»
    this.rot = Math.random() * TAU;
    this.pulse = 0;
    this.combo = 0;
    this.colorCache = new Map();
    this.world.balls = [];
    this.spawn();
    this.stars = Array.from({ length: 40 }, () => {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * (CENTER_R - 12);
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, p: Math.random() * TAU };
    });
  }

  spawn(x = 0, y = 40) {
    const a = Math.random() * TAU;
    const b = this.world.addBall({ x, y, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, r: BALL_R, color: '#FFFFFF' });
    b.trail = [];
    return b;
  }

  tap(x, y) {
    if (this.world.balls.length >= this.maxBalls) return;
    const d = Math.hypot(x, y);
    const lim = this.radius(this.c) - 20;
    if (d > lim) { x *= lim / d; y *= lim / d; }
    this.spawn(x, y);
  }

  // ===== Геометрия колец =====

  radius(i) { return CENTER_R + (i - this.cAnim) * STEP; }
  ringRot(i) { return this.rot + i * TWIST + (rand(i) - 0.5) * 0.14; }
  ringGap(i) { return GAP * (0.85 + rand(i + 999) * 0.3); }

  /** Угол a (мировой) попадает в разрыв кольца i? margin — запас под размер шарика. */
  inGap(i, a, margin) {
    const start = this.ringRot(i);
    const rel = (((a - start) % TAU) + TAU) % TAU;
    return rel > margin && rel < this.ringGap(i) - margin;
  }

  setPalette(key, custom) {
    this.palette = key;
    this.paletteCustom = custom;
    this.colorCache.clear();
  }

  colorOf(i) {
    let c = this.colorCache.get(i);
    if (c) return c;
    const p = PALETTES[this.palette] || PALETTES.rainbow;
    const k = (i % COLOR_PERIOD) / COLOR_PERIOD;
    if (p.rainbow) {
      c = hsl(330 - k * 360, 92, 60);
    } else {
      const stops = p.custom ? [this.paletteCustom.from, this.paletteCustom.to] : p.stops;
      const t = k < 0.5 ? k * 2 : (1 - k) * 2; // туда-обратно, чтобы цвета не обрывались
      c = mixStops(stops, t);
    }
    this.colorCache.set(i, c);
    return c;
  }

  // ===== Логика =====

  onBeat() {
    this.pulse = 1;
    for (const b of this.world.balls) b.flash = 1;
  }

  update(dt, music) {
    // Своя физика вместо World: отключаем шаг мира, остальное — как в базовой игре
    this.time += dt;
    if (music) {
      this.music = music;
      if (music.beat && this.react.beat) this.onBeat();
      const k = this.react.bass ? 1 + music.bass * 0.5 : 1;
      for (const b of this.world.balls) b.r = b.baseR * k;
      if (this.react.color) this.hueShift = music.hue;
    }
    const steps = 4;
    const h = Math.min(dt, 1 / 30) / steps;
    for (let s = 0; s < steps; s++) {
      this.rot += SPIN * h;
      for (const b of this.world.balls) this.moveBall(b, h);
    }
    for (const b of this.world.balls) {
      b.flash = Math.max(0, b.flash - dt * 3);
      b.trail.push(b.x, b.y);
      if (b.trail.length > 24) b.trail.splice(0, 2);
    }
    this.cAnim += (this.c - this.cAnim) * Math.min(1, dt * 5);
    // Кольца «затянулись» к центру — ещё раз проверяем, что шарик внутри текущего
    for (const b of this.world.balls) this.moveBall(b, 0);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    audio.setTrackMix(this.musicLevel);
    this.fx.update(dt);
    if (this.c >= TOTAL) {
      this._resetIn = (this._resetIn ?? 2) - dt;
      if (this._resetIn <= 0) { this._resetIn = null; this.reset(); }
    }
  }

  moveBall(b, h) {
    // Скорость шарика постоянная — как в оригинале
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const target = SPEED * (1 + this.pulse * 0.25);
    b.vx *= target / sp; b.vy *= target / sp;
    b.x += b.vx * h; b.y += b.vy * h;

    // Пока шарик у стенки текущего кольца: либо пролетает в разрыв, либо отскакивает
    for (let guard = 0; guard < 40 && this.c < TOTAL; guard++) {
      const R = this.radius(this.c);
      const d = Math.hypot(b.x, b.y) || 0.0001;
      if (d + b.r < R - 1) return;
      const a = Math.atan2(b.y, b.x);
      if (this.inGap(this.c, a, (b.r * 0.6) / R)) {
        if (d < R) return;          // ещё в проёме — летим дальше
        this.passRing(b);           // вылетел наружу — кольцо пройдено
        continue;
      }
      // Отскок от внутренней стороны кольца
      const ux = b.x / d, uy = b.y / d;
      b.x = ux * (R - 1.5 - b.r); b.y = uy * (R - 1.5 - b.r);
      const vn = b.vx * ux + b.vy * uy;
      if (vn > 0) {
        b.vx -= 2 * vn * ux; b.vy -= 2 * vn * uy;
        // Лёгкий случайный поворот, чтобы не застревать в одном ритме
        const t = (Math.random() - 0.5) * 0.25;
        const c = Math.cos(t), s = Math.sin(t);
        [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c];
        b.flash = 1;
        this.combo = 0;
        this.pulse = Math.max(this.pulse, 0.5);
        this.sound(Math.floor(((a + Math.PI) / TAU) * 8), 600);
        this.musicLevel = Math.max(MUSIC_MIN, this.musicLevel - MUSIC_DOWN);
      }
      return;
    }
  }

  passRing(b) {
    this.musicLevel = Math.min(1, this.musicLevel + MUSIC_UP);
    const color = this.colorOf(this.c);
    this.fx.burst(b.x, b.y, color, 3, 160, 0.35);
    this.c++;
    this.score++;
    this.combo++;
    // Чем дольше пролёт, тем выше нота — звучит как глиссандо
    this.sound(this.combo, 500 + this.combo * 40, { octave: 0 });
  }

  // ===== Отрисовка =====

  draw(ctx) {
    const hueShift = this.react.color ? this.hueShift : 0;
    const shift = (col) => (hueShift && col.startsWith('hsl') ? col.replace(/hsl\((-?[\d.]+)/, (m, h) => `hsl(${(+h + hueShift) % 360}`) : col);

    // Кольца снаружи (только видимые на экране)
    const maxR = 820;
    const last = Math.min(TOTAL - 1, this.c + Math.ceil((maxR - CENTER_R) / STEP) + 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'butt';
    for (let i = last; i > this.c; i--) {
      const R = this.radius(i);
      if (R <= 0) continue;
      const start = this.ringRot(i);
      ctx.strokeStyle = shift(this.colorOf(i));
      ctx.beginPath();
      ctx.arc(0, 0, R, start + this.ringGap(i), start + TAU);
      ctx.stroke();
    }

    // Центральное кольцо: яркое, с подсветкой внутри
    const R = this.radius(this.c);
    const main = shift(this.colorOf(this.c));
    if (this.c < TOTAL) {
      ctx.fillStyle = withAlpha('#120E2E', 0.92);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.fillStyle = withAlpha(main.startsWith('#') ? main : '#8B6CFF', 0.10 + this.pulse * 0.08);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      // Звёздочки внутри
      ctx.fillStyle = '#FFFFFF';
      for (const s of this.stars) {
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 2 + s.p));
        ctx.fillRect(s.x * (R / CENTER_R), s.y * (R / CENTER_R), 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      const start = this.ringRot(this.c);
      neonStroke(ctx, main, 4 + this.pulse * 1.5, () => {
        ctx.beginPath();
        ctx.arc(0, 0, R, start + this.ringGap(this.c), start + TAU);
      }, (audio.musicPlaying ? 0.6 + this.musicLevel * 0.7 : 1) + this.pulse * 0.5); // под музыку кольцо светится ярче, когда трек громче
    }

    // Число в центре — сколько колец осталось
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 64px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, TOTAL - this.c)), 0, 2);

    this.fx.draw(ctx);

    // Шарики-кометы
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.world.balls) {
      const t = b.trail;
      for (let k = 2; k < t.length; k += 2) {
        const f = k / t.length;
        ctx.strokeStyle = withAlpha('#9FFFE0', f * 0.7);
        ctx.lineWidth = b.r * 1.6 * f;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(t[k - 2], t[k - 1]); ctx.lineTo(t[k], t[k + 1]); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawBalls(ctx);
  }
}
