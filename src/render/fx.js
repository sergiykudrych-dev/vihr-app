// Визуальные эффекты: неоновое свечение, искры, расходящиеся круги.

const glowCache = new Map();

/** Готовая «светящаяся точка» нужного цвета — рисуем картинкой, это быстрее shadowBlur. */
export function glowSprite(color, size = 64) {
  const key = color + size;
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.25, withAlpha(color, 0.45));
  grd.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export function withAlpha(hex, a) {
  if (hex.startsWith('hsl')) return hex.replace('hsl(', 'hsla(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function hsl(h, s = 92, l = 58) { return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`; }

/** Шарик с ореолом. */
export function drawBall(ctx, b, extraGlow = 0) {
  const glow = b.r * (3 + b.flash * 2 + extraGlow);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite(b.color), b.x - glow, b.y - glow, glow * 2, glow * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = b.flash > 0.5 ? '#ffffff' : b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
}

/** Неоновая линия: широкий полупрозрачный слой + тонкая яркая сердцевина. */
export function neonStroke(ctx, color, width, drawPath, intensity = 1) {
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(color, 0.18 * intensity);
  ctx.lineWidth = width * 4;
  drawPath(); ctx.stroke();
  ctx.strokeStyle = withAlpha(color, 0.35 * intensity);
  ctx.lineWidth = width * 2;
  drawPath(); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  drawPath(); ctx.stroke();
}

export class Particles {
  constructor(max = 600) { this.list = []; this.rings = []; this.max = max; }

  burst(x, y, color, count = 10, speed = 260, life = 0.7) {
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, t: 0, color, len: 4 + Math.random() * 8 });
    }
  }

  /** Осколки вдоль дуги — когда кольцо разбито. */
  shatterArc(cx, cy, R, start, len, color, count = 40) {
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const a = start + Math.random() * len;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const s = 80 + Math.random() * 260;
      const out = Math.random() < 0.7 ? 1 : -1;
      this.list.push({ x, y, vx: Math.cos(a) * s * out, vy: Math.sin(a) * s * out, life: 1.1, t: 0, color, len: 6 + Math.random() * 10 });
    }
  }

  ring(x, y, color, maxR = 60, life = 0.5) {
    this.rings.push({ x, y, color, maxR, life, t: 0 });
  }

  update(dt) {
    for (const p of this.list) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
    this.list = this.list.filter((p) => p.t < p.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      ctx.strokeStyle = withAlpha(p.color, k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.vx / sp) * p.len * k, p.y - (p.vy / sp) * p.len * k);
      ctx.stroke();
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = withAlpha(r.color, (1 - k) * 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + r.maxR * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

export const NEON = ['#FF4D5A', '#FF7A45', '#FFD84A', '#4BF28A', '#2EE6C8', '#22E4F5', '#3B9BFF', '#8B6CFF', '#FF4FD8'];
export const RAINBOW = ['#FF7A45', '#FFA040', '#FFC93D', '#E3E64A', '#A5EF55', '#4BF28A', '#2EE6C8', '#22D3F5', '#3B9BFF', '#6C7CFF', '#A56CFF'];
