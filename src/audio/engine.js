// Звуковой движок: один AudioContext на всё приложение.
// Схема: ноты → masterGain → compressor → динамики (+ выход для записи видео)
//        трек → trackGain → analyser
//                         ↘ compressor

import { PACKS } from './packs.js';
import { noteFreq } from './scales.js';

const MAX_HITS_PER_WINDOW = 8;   // не больше 8 нот за окно — чтобы не было «каши»
const WINDOW_MS = 40;
const SAME_NOTE_GAP_MS = 35;      // одна и та же нота не чаще чем раз в 35 мс

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.pack = 'glass';
    this.scale = 'pentatonic';
    this.volume = 0.7;
    this.hitsWithMusic = 0.5;  // громкость касаний, пока играет трек (0 — выключены)
    this.musicPlaying = false; // выставляет track.js
    this.muted = false;        // кнопка на игровом экране
    this._hits = [];
    this._lastNote = new Map();
  }

  /** Создаёт контекст. Вызывать только из обработчика касания/клика (правило браузеров). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.ratio.value = 4;
      this.compressor.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.compressor);

      this.trackGain = this.ctx.createGain();
      this.trackGain.gain.value = this.trackVolume ?? 0.9;
      this.trackGain.connect(this.compressor);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.trackGain.connect(this.analyser);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setTrackVolume(v) {
    this.trackVolume = v;
    if (this.trackGain) this.trackGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /**
   * Сыграть ноту от столкновения.
   * @param {number} index ступень гаммы (номер стенки, ряда, кольца…)
   * @param {number} vel сила 0..1
   * @param {object} [o] { pack, octave }
   */
  hit(index, vel = 0.7, o = {}) {
    if (!this.ready || this.muted) return;
    // Под музыку касания тише (или совсем выключены) — настройка на экране «Трек»
    const mix = this.musicPlaying ? this.hitsWithMusic : 1;
    if (mix <= 0.001) return;
    vel *= mix;
    const now = performance.now();
    this._hits = this._hits.filter((t) => now - t < WINDOW_MS);
    if (this._hits.length >= MAX_HITS_PER_WINDOW) return;
    const key = `${o.pack || this.pack}:${index}`;
    if (now - (this._lastNote.get(key) || 0) < SAME_NOTE_GAP_MS) return;
    this._lastNote.set(key, now);
    this._hits.push(now);

    const pack = PACKS[o.pack || this.pack] || PACKS.glass;
    // Держим ноты в приятном диапазоне ~2 октавы, чтобы не уходить в писк
    const span = 12;
    const i = ((Math.round(index) % span) + span) % span;
    const f = noteFreq(i, this.scale, (pack.octave || 0) + (o.octave || 0));
    const v = Math.max(0.02, Math.min(1, vel));
    pack.play(this.ctx, this.master, f, v, this.ctx.currentTime + 0.001);
  }

  /** Короткое превью набора: три ноты подряд. */
  preview(packKey) {
    if (!this.unlock()) return;
    const pack = PACKS[packKey];
    const t = this.ctx.currentTime + 0.02;
    [0, 2, 4].forEach((i, k) => pack.play(this.ctx, this.master, noteFreq(i, this.scale, pack.octave), 0.8, t + k * 0.16));
  }
}

export const audio = new AudioEngine();
