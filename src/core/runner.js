// Запускает игру на canvas: размер под экран, цикл кадров, касания, анализ музыки.

import { ARENA } from '../games/base.js';
import { track } from '../audio/track.js';
import { audio } from '../audio/engine.js';

export class Runner {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [o] { padding: доля пустого поля вокруг арены, onFrame }
   */
  constructor(canvas, o = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.padding = o.padding ?? 1.0;
    this.onFrame = o.onFrame || null;
    this.bg = o.bg || '#05040C';
    this.game = null;
    this._raf = 0;
    this._last = 0;
    this._drag = null;

    this._resize = () => this.resize();
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(canvas);

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => { this._drag = null; });
    window.addEventListener('pointercancel', () => { this._drag = null; });
  }

  setGame(game) {
    this.game = game;
    if (game) game.react = track.react;
    if (this.w) this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    // Арена (2*ARENA) вписывается в меньшую сторону; padding < 1 делает её меньше
    // Игра может попросить свой размер (game.padding), например «Вихрь» — почти на весь экран
    const pad = (this.game && this.game.padding) || this.padding;
    this.scale = (Math.min(this.w, this.h) / (ARENA * 2)) * pad;
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.w / 2) / this.scale,
      y: (e.clientY - r.top - this.h / 2) / this.scale,
    };
  }

  _down(e) {
    audio.unlock();
    if (!this.game) return;
    const p = this.toWorld(e);
    this._drag = { x: p.x, y: p.y, moved: 0 };
    this.canvas.setPointerCapture?.(e.pointerId);
    this.game.tap(p.x, p.y);
    if (this.onTap) this.onTap();
  }

  _move(e) {
    if (!this._drag || !this.game) return;
    const p = this.toWorld(e);
    const a0 = Math.atan2(this._drag.y, this._drag.x);
    const a1 = Math.atan2(p.y, p.x);
    let da = a1 - a0;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    this.game.drag(da, p);
    this._drag.x = p.x; this._drag.y = p.y;
  }

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this._last) / 1000);
      this._last = t;
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this._raf); this._raf = 0; }

  frame(dt) {
    const { ctx, game } = this;
    if (!this.w) this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!game) return;
    // Видимый радиус в координатах мира — игры не рисуют то, что за краем экрана
    game.viewR = Math.hypot(this.w, this.h) / 2 / this.scale;
    const music = track.analyse();
    game.update(dt, music);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, (this.w / 2) * this.dpr, (this.h / 2) * this.dpr);
    game.draw(ctx);
    if (this.onFrame) this.onFrame(game);
  }
}
