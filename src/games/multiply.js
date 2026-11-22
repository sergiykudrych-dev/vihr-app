// «Размножение»: внутри круга вращаются две палки с серебристыми конусами на концах.
// Конусы то сходятся, то расходятся — шарики, зажатые между ними, удваиваются.
// С каждым удвоением цвет шариков меняется. Когда их набирается много, всё начинается заново.

import { Game } from './base.js';
import { audio } from '../audio/engine.js';

const TAU = Math.PI * 2;
const WALL_R = 300;       // радиус круга
const BR = 4.5;             // радиус шарика
const MAX = 70000;        // больше шариков не бывает
const GRAV = 300;
const MAX_SPEED = 400;
const WALL_E = 0.55;      // упругость стенки
const ARM_E = 0.05;       // упругость конусов
const BALL_E = 0.25;      // упругость между шариками

// Конус: от U0 (у палки) до U1 (у стенки), полуширина растёт от H0 до H1
const U0 = WALL_R * 0.4;
const U1 = WALL_R;
const H0 = 4;
const H1 = 24;
const ROD_W = 2.5;
const ROD_U0 = 22;        // палка начинается не от самой оси — шарик может пролететь через центр, а не зависнуть на нём

// Угол между палками: от GAP_MIN (конусы почти касаются у стенки) до GAP_MAX
// (при GAP_MIN концы конусов у стенки почти смыкаются — меньше диаметра шарика)
const GAP_MIN = 0.16; 
const GAP_MAX = 2.3;
const GAP_PERIOD = 2.2;   // секунд на «разжал — сжал»
const SPIN = 0.55;       // рад/с: «челюсти» целиком крутятся по кругу

const SPEEDUP = 1.03;     // на каждое смыкание конусов вращение ускоряется
const SPEED_MAX = 4.2;   // предел суммарной «скорости» палок

const PRESSURE = 1.1;
const MULT = 20;          // из одного зажатого шарика получается 20 (размер тот же)
const LIVE_SPEED = 2.4;         // в игре палки быстрее: раунд ~10 секунд
const LIVE_CD = 0.65;
const SQUEEZE_CD = 2.2;   // после удвоения шарик пару мгновений не удваивается

// Цвета по числу удвоений: розовый → синий → голубой → жёлтый → зелёный → оранжевый → красный
const GEN_COLORS = ['#4C5BFF', '#FFE14D', '#2EF0E0', '#39E58C', '#FF8A3D', '#FF3B3B', '#F3D9A4'];

const FLUID_N = 2500;     // когда шариков больше — вместо парных столкновений считаем «давление» по плотности
const CELL = BR * 2;
const GRID = Math.ceil((WALL_R * 2 + 40) / CELL);

const sprites = new Map();
function ballSprite(color) {
  let c = sprites.get(color);
  if (c) return c;
  const s = 40;
  c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.22, color);
  grad.addColorStop(0.5, color + '66');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  sprites.set(color, c);
  return c;
}

export class MultiplyGame extends Game {
  setup() {
    this.padding = 0.98;
    this.defaultPalette = null;
    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX);
    this.gen = new Uint8Array(MAX);
    this.cd = new Float32Array(MAX);
    this.head = new Int32Array(GRID * GRID);
    this.next = new Int32Array(MAX);
    this.cnt = new Uint16Array(GRID * GRID);
    this.cell = new Int32Array(MAX);
    this.n = 0;
    this.hold = 0;       // пауза на финале
    this.pulse = 0;
    this.restart();
  }

  restart() {
    this.n = 0;
    this.hold = 0;
    this.popping = false;
    this.time = 0;
    if (!this.limit) this.limit = MAX;
    const sp = this.offline ? 1 : LIVE_SPEED; // в игре — быстрый раунд-превью, в видео — неспешный
    this.a1 = Math.PI / 2 - 0.9; this.a2 = Math.PI / 2 + 0.9; this.w1 = 1.5 * sp; this.w2 = -0.9 * sp;
    this.spawn(0, WALL_R * 0.72, 0, 0, 0);
    this.score = 1;
  }

  spawn(x, y, vx, vy, gen) {
    if (this.n >= MAX) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.gen[i] = gen; this.cd[i] = 0;
    return i;
  }

  /** Палки как две бусины на кольце: ездят по кругу каждая со своей скоростью. */
  arms() {
    return [{ a: this.a1, w: this.w1 }, { a: this.a2, w: this.w2 }];
  }

  /** Двигает палки на h секунд. Сомкнулись конусами — отскакивают друг от друга (меняют направление) и разгоняются. */
  advance(h) {
    this.a1 += this.w1 * h;
    this.a2 += this.w2 * h;
    const gap = this.a2 - this.a1;
    const hitLow = gap <= GAP_MIN && this.w2 < this.w1;
    const hitHigh = gap >= TAU - GAP_MIN && this.w2 > this.w1;
    if (hitLow || hitHigh) {
      const k = Math.min(SPEED_MAX, Math.hypot(this.w1, this.w2) * SPEEDUP) / Math.max(1e-6, Math.hypot(this.w1, this.w2));
      const t = this.w1; this.w1 = this.w2 * k; this.w2 = t * k;
      if (hitLow) { const m = (this.a1 + this.a2) / 2; this.a1 = m - GAP_MIN / 2; this.a2 = m + GAP_MIN / 2; }
      else { const m = (this.a1 + this.a2 + TAU) / 2; this.a2 = m - GAP_MIN / 2; this.a1 = m + GAP_MIN / 2 - TAU; }
      this.pulse = 1;
      // Конусы стукнулись — слышно звонкий удар (ниже по тону, чем у шариков)
      audio.hit(2 + ((this.bounces = (this.bounces || 0) + 1) % 5), 0.95, { octave: -1 });
    }
  }

  tap(x, y) {
    if (Math.hypot(x, y) > WALL_R - BR) { const k = (WALL_R - BR * 2) / Math.hypot(x, y); x *= k; y *= k; }
    const ang = Math.random() * TAU;
    this.spawn(x, y, Math.cos(ang) * 120, Math.sin(ang) * 120, 0);
    this.score = this.n;
  }

  onBeat() { this.pulse = 1; }

  update(dt, music) {
    if (music) { this.music = music; if (music.beat) this.onBeat(); }
    this.fx.update(dt);
    this.pulse = Math.max(0, this.pulse - dt * 3);
    dt = Math.min(dt, 1 / 30);
    this.time += dt;

    // Финал: круг переполнен — он лопается, шарики разлетаются, потом всё сначала
    if (this.popping) { this.popStep(dt); return; }
    if (this.n >= this.limit) {
      this.hold += dt;
      // В видео круг лопается, в самой игре раунд просто начинается заново
      if (this.offline) { if (this.hold > 0.9) { this.startPop(); return; } }
      else if (this.hold > 0.4) { this.restart(); return; }
    }
    const steps = Math.max(1, Math.ceil(dt / (this.n > 6000 ? 1 / 60 : this.n > 2500 ? 1 / 80 : 1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) { this.advance(h); this.step(h); }
    this.score = this.n;
  }

  /** Видео собирается: игра переходит на неспешный ритм и начинает раунд заново. */
  onOffline() { this.offline = true; this.restart(); }

  squeezeCd() { return this.offline ? SQUEEZE_CD : LIVE_CD; }

  startPop() {
    this.popping = true;
    this.popT = 0;
    const { x, y, vx, vy } = this;
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(x[i], y[i]) || 1, k = 260 + Math.random() * 520;
      vx[i] = (x[i] / d) * k + (Math.random() - 0.5) * 120;
      vy[i] = (y[i] / d) * k + (Math.random() - 0.5) * 120;
    }
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      this.fx.burst(Math.cos(a) * WALL_R, Math.sin(a) * WALL_R, '#FFFFFF', 3, 320, 0.7);
    }
    audio.hit(0, 1, { octave: -2 });
    audio.hit(5, 1, { octave: -1 });
    audio.hit(9, 0.9);
    this.pulse = 1;
  }

  popStep(dt) {
    this.popT += dt;
    const { x, y, vx, vy } = this;
    const drag = Math.pow(0.55, dt);
    for (let i = 0; i < this.n; i++) {
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      vx[i] *= drag; vy[i] *= drag;
    }
    if (this.popT > 1.8) this.restart();
  }

  step(h) {
    const n = this.n;
    const { x, y, vx, vy, cd } = this;
    const arms = this.arms();

    // 1. Движение
    for (let i = 0; i < n; i++) {
      vy[i] += GRAV * h;
      let sp = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp > MAX_SPEED * MAX_SPEED) { const k = MAX_SPEED / Math.sqrt(sp); vx[i] *= k; vy[i] *= k; }
      x[i] += vx[i] * h; y[i] += vy[i] * h;
      if (cd[i] > 0) cd[i] -= h;
    }

    // 2. Шарики между собой (сетка)
    this.head.fill(-1);
    const half = WALL_R + 20;
    for (let i = 0; i < n; i++) {
      const cx = Math.max(0, Math.min(GRID - 1, ((x[i] + half) / CELL) | 0));
      const cy = Math.max(0, Math.min(GRID - 1, ((y[i] + half) / CELL) | 0));
      const c = cy * GRID + cx;
      this.next[i] = this.head[c]; this.head[c] = i;
    }
    const D = BR * 2, D2 = D * D;
    if (n > FLUID_N) this.relax(n);
    const stride = 1;
    for (let i = 0; i < n && n <= FLUID_N; i++) {
      const cx = Math.max(0, Math.min(GRID - 1, ((x[i] + half) / CELL) | 0));
      const cy = Math.max(0, Math.min(GRID - 1, ((y[i] + half) / CELL) | 0));
      let budget = 14;   // в тесной куче в клетке бывают сотни шариков — лишнее не считаем
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy; if (gy < 0 || gy >= GRID) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox; if (gx < 0 || gx >= GRID) continue;
          for (let j = this.head[gy * GRID + gx]; j !== -1 && budget > 0; j = this.next[j]) {
            budget--;
            if (j === i || (stride === 1 && j < i)) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 >= D2 || d2 < 1e-6) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            const push = (D - d) * 0.5;
            x[i] -= nx * push; y[i] -= ny * push; x[j] += nx * push; y[j] += ny * push;
            const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
            if (rv < 0) {
              const jn = -(1 + BALL_E) * rv * 0.5;
              vx[i] -= nx * jn; vy[i] -= ny * jn; vx[j] += nx * jn; vy[j] += ny * jn;
            }
          }
        }
      }
    }

    // 3. Стенка круга и конусы; считаем, кого зажали обе палки
    const squeezed = [];
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(x[i], y[i]);
      if (d > WALL_R - BR) {
        const nx = x[i] / d, ny = y[i] / d;
        x[i] = nx * (WALL_R - BR); y[i] = ny * (WALL_R - BR);
        const vn = vx[i] * nx + vy[i] * ny;
        if (vn > 0) { vx[i] -= (1 + WALL_E) * vn * nx; vy[i] -= (1 + WALL_E) * vn * ny; }
      }
      const a = this.armCollide(i, arms[0]);
      const b = this.armCollide(i, arms[1]);
      if (a && b && cd[i] <= 0) squeezed.push(i);
    }

    // 4. Удвоение зажатых
    let sounds = 0;
    // Когда уже тесно, новые шарики появляются не все сразу — куча успевает расправиться
    const cap = this.n > FLUID_N ? 4000 : 1e9;
    let made = 0;
    for (const i of squeezed) {
      if (this.n >= this.limit || made >= cap) break;
      const g = Math.min(250, this.gen[i] + 1);
      this.gen[i] = g;
      cd[i] = this.squeezeCd();
      for (let m = 1; m < MULT && this.n < this.limit; m++) {
        const ang = Math.random() * TAU, r = BR * (0.5 + Math.random() * 2.5), sp = 40 + Math.random() * 110;
        const c = this.spawn(x[i] + Math.cos(ang) * r, y[i] + Math.sin(ang) * r,
          vx[i] + Math.cos(ang) * sp, vy[i] + Math.sin(ang) * sp, g);
        if (c >= 0) cd[c] = this.squeezeCd();
        made++;
      }
      if (this.n < 800) this.fx.burst(x[i], y[i], GEN_COLORS[g % GEN_COLORS.length], 2, 140, 0.3);
      if (sounds < 2 && (this.n < 300 || Math.random() < 0.1)) { sounds++; audio.hit(g * 2 + (i % 3), 0.45); }
    }
  }

  /** Давление по клеткам сетки: перегруженная клетка выталкивает шарики в сторону, где свободнее. */
  relax(n) {
    const { x, y, vx, vy, cnt, cell } = this;
    const half = WALL_R + 20;
    for (let pass = 0; pass < 2; pass++) {
      cnt.fill(0);
      for (let i = 0; i < n; i++) {
        const cx = Math.max(1, Math.min(GRID - 2, ((x[i] + half) / CELL) | 0));
        const cy = Math.max(1, Math.min(GRID - 2, ((y[i] + half) / CELL) | 0));
        const c = cy * GRID + cx; cell[i] = c; cnt[c]++;
      }
      for (let i = 0; i < n; i++) {
        const c = cell[i], d = cnt[c];
        if (d < 2) continue;
        const gx = (cnt[c - 1] - cnt[c + 1]) + (Math.random() - 0.5) * (d - 1);
        const gy = (cnt[c - GRID] - cnt[c + GRID]) + (Math.random() - 0.5) * (d - 1);
        const k = PRESSURE;
        let dx = gx * k, dy = gy * k;
        const m = Math.abs(dx) + Math.abs(dy);
        if (m > 3) { dx *= 3 / m; dy *= 3 / m; }
        x[i] += dx; y[i] += dy;
        vx[i] += dx * 4; vy[i] += dy * 4;
      }
    }
  }

  /** Столкновение шарика i с палкой и конусом. Возвращает true, если коснулся. */
  armCollide(i, arm) {
    const { x, y, vx, vy } = this;
    const c = Math.cos(arm.a), s = Math.sin(arm.a);
    // Локальные координаты: u — вдоль палки, v — поперёк
    let u = x[i] * c + y[i] * s;
    let v = -x[i] * s + y[i] * c;
    let touched = false;
    let nu = 0, nv = 0; // нормаль в локальных координатах

    if (u > ROD_U0 - BR && u < U0 + BR) {
      // Палка (капсула)
      const cu = Math.max(ROD_U0, Math.min(U0, u));
      const dv = v, du = u - cu;
      const d = Math.hypot(du, dv);
      if (d < BR + ROD_W) {
        touched = true;
        const k = d > 1e-6 ? 1 / d : 0;
        nu = d > 1e-6 ? du * k : 0; nv = d > 1e-6 ? dv * k : (v >= 0 ? 1 : -1);
        const pen = BR + ROD_W - d;
        u += nu * pen; v += nv * pen;
      }
    }
    if (u > U0 - BR && u < U1 + BR) {
      // Конус: полуширина растёт к стенке
      const f = Math.max(0, Math.min(1, (u - U0) / (U1 - U0)));
      const hw = H0 + (H1 - H0) * f;
      // Нормаль боковой грани (наклонена из-за расширения)
      const slope = (H1 - H0) / (U1 - U0);
      const L = Math.hypot(1, slope);
      const sign = v >= 0 ? 1 : -1;
      const dist = (Math.abs(v) - hw) / L; // расстояние до боковой грани
      if (dist < BR) {
        touched = true;
        const pen = BR - dist;
        // нормаль: (−slope·sign..) в локальных координатах (u, v)
        nu = -slope / L; nv = sign / L;
        u += nu * pen; v += nv * pen;
      }
    }
    if (!touched) return false;

    // Обратно в мировые координаты
    x[i] = u * c - v * s; y[i] = u * s + v * c;
    const wx = nu * c - nv * s, wy = nu * s + nv * c;           // нормаль в мире
    // Скорость поверхности (палка вращается)
    const svx = -arm.w * y[i], svy = arm.w * x[i];
    const rvn = (vx[i] - svx) * wx + (vy[i] - svy) * wy;
    if (rvn < 0) {
      vx[i] -= (1 + ARM_E) * rvn * wx; vy[i] -= (1 + ARM_E) * rvn * wy;
    }
    return true;
  }

  tick() {}

  draw(ctx) {
    // Круг
    ctx.lineWidth = 2.2;
    if (this.popping) {
      // Круг лопнул: осколки кольца разлетаются и гаснут, на миг вспышка
      const T = this.popT, alpha = Math.max(0, 1 - T / 1.1);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 3;
      for (let k = 0; k < 28; k++) {
        const a0 = (k / 28) * TAU, r = WALL_R + 2 + T * (200 + ((k * 37) % 11) * 28);
        const off = T * (k % 2 ? 0.5 : -0.5);
        ctx.beginPath(); ctx.arc(0, 0, r, a0 + off, a0 + off + TAU / 28 - 0.06); ctx.stroke();
      }
      if (T < 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${(0.3 - T) * 2})`;
        ctx.beginPath(); ctx.arc(0, 0, WALL_R, 0, TAU); ctx.fill();
      }
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${0.85 + this.pulse * 0.15})`;
      ctx.beginPath(); ctx.arc(0, 0, WALL_R + 2, 0, TAU); ctx.stroke();
    }

    // Палки и конусы
    const arms = this.arms();
    for (const arm of arms) {
      ctx.save();
      ctx.rotate(arm.a);
      ctx.strokeStyle = 'rgba(170,180,200,0.45)';
      ctx.lineWidth = ROD_W * 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ROD_U0, 0); ctx.lineTo(U0, 0); ctx.stroke();
      const g = ctx.createLinearGradient(U0, 0, U1, 0);
      g.addColorStop(0, 'rgba(150,160,185,0.9)');
      g.addColorStop(1, 'rgba(240,244,255,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(U0, -H0); ctx.lineTo(U1, -H1); ctx.lineTo(U1, H1); ctx.lineTo(U0, H0); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,120,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(U0, -H0); ctx.lineTo(U1, -H1); ctx.moveTo(U0, H0); ctx.lineTo(U1, H1); ctx.stroke();
      ctx.restore();
    }
    // Ось
    ctx.fillStyle = '#9aa3b8';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10121c';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();

    // Шарики. Мало — светящиеся спрайты; много — цветные точки пачками по цвету (иначе всё белеет)
    if (this.n < 150) {
      ctx.globalCompositeOperation = 'lighter';
      const S = BR * 7;
      for (let i = 0; i < this.n; i++) {
        ctx.drawImage(ballSprite(GEN_COLORS[this.gen[i] % GEN_COLORS.length]), this.x[i] - S, this.y[i] - S, S * 2, S * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    const R = this.n < 150 ? BR * 1.2 : BR * 0.98;
    for (let c = 0; c < GEN_COLORS.length; c++) {
      ctx.fillStyle = GEN_COLORS[c];
      ctx.beginPath();
      let any = false;
      const rect = !this.offline && this.n > 15000; // в видео шарики всегда круглые
      for (let i = 0; i < this.n; i++) {
        if (this.gen[i] % GEN_COLORS.length !== c) continue;
        if (rect) ctx.rect(this.x[i] - R, this.y[i] - R, R * 2, R * 2);
        else { ctx.moveTo(this.x[i] + R, this.y[i]); ctx.arc(this.x[i], this.y[i], R, 0, TAU); }
        any = true;
      }
      if (any) ctx.fill();
    }
    this.fx.draw(ctx);
  }
}
