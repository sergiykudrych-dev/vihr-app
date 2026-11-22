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
      this.trackGain.gain.value = (this.trackVolume ?? 0.9) * (this.trackMix ?? 1);
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
    this._applyTrackGain(0.02);
  }

  /**
   * Множитель громкости трека от самой игры (0..1). Например, «Туннель»:
   * шарик пробивает кольца — музыка громче, бьётся о стенку — тише.
   */
  setTrackMix(m) {
    if (this.cap) {
      if (Math.abs((this.cap.lastMix ?? 1) - m) >= 0.005) { this.cap.lastMix = m; this.cap.mix.push({ t: this.cap.t, m }); }
      return;
    }
    if (Math.abs((this.trackMix ?? 1) - m) < 0.005) return;
    this.trackMix = m;
    this._applyTrackGain(0.08);
  }

  _applyTrackGain(smooth) {
    if (!this.trackGain) return;
    const v = (this.trackVolume ?? 0.9) * (this.trackMix ?? 1);
    this.trackGain.gain.setTargetAtTime(v, this.ctx.currentTime, smooth);
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
    const cap = this.cap; // идёт сборка видео: ноты не играем, а записываем с точным временем
    if (cap && cap.off) return; // в видео выбрано «без звука шариков»
    if (!cap && (!this.ready || this.muted)) return;
    // Под музыку касания тише (или совсем выключены) — настройка на экране «Трек»
    const mix = cap ? (cap.withMusic ? Math.max(0.5, this.hitsWithMusic) : 1) : (this.musicPlaying ? this.hitsWithMusic : 1);
    if (mix <= 0.001) return;
    vel *= mix;
    const now = cap ? cap.t * 1000 : performance.now();
    this._hits = this._hits.filter((t) => now - t < WINDOW_MS);
    if (this._hits.length >= MAX_HITS_PER_WINDOW) return;
    const packKey = (cap && cap.pack) || o.pack || this.pack;
    const key = `${packKey}:${index}`;
    if (now - (this._lastNote.get(key) || 0) < SAME_NOTE_GAP_MS) return;
    this._lastNote.set(key, now);
    if (this.onHit && !cap) this.onHit(index, vel);
    this._hits.push(now);

    const pack = PACKS[packKey] || PACKS.glass;
    // Держим ноты в приятном диапазоне ~2 октавы, чтобы не уходить в писк
    const span = 12;
    const i = ((Math.round(index) % span) + span) % span;
    const f = noteFreq(i, this.scale, (pack.octave || 0) + (o.octave || 0));
    const v = Math.max(0.02, Math.min(1, vel));
    if (cap) { cap.events.push({ pack: PACKS[packKey] ? packKey : 'glass', f, v, when: cap.t }); return; }
    pack.play(this.ctx, this.master, f, v, this.ctx.currentTime + 0.001);
  }

  /** Начать запись нот для видео: время идёт от cap.t (секунды), а не от часов телефона. */
  beginCapture(withMusic, sound = {}) {
    this.cap = { t: 0, events: [], mix: [], withMusic, lastMix: 1, pack: sound.pack || null, off: !!sound.off };
    this._savedMusic = this.musicPlaying;
    this.musicPlaying = withMusic;
    this._hits = [];
    this._lastNote = new Map();
  }

  /** Закончить запись; возвращает { events, mix }. */
  endCapture() {
    const c = this.cap;
    this.cap = null;
    this.musicPlaying = this._savedMusic;
    this._hits = [];
    this._lastNote = new Map();
    return c;
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
