// Свой трек пользователя: загрузка файла, воспроизведение и анализ (бит, бас, «цвет» мелодии).

import { audio } from './engine.js';

class Track {
  constructor() {
    this.el = null;
    this.name = '';
    this.peaks = null;        // уровни для рисования волны
    this.sensitivity = 0.6;   // 0..1
    this.react = { beat: true, bass: true, color: false };

    this._bins = null;
    this._history = [];
    this._lastBeat = 0;
    this.state = { beat: false, bass: 0, level: 0, hue: 200 };
    this._listeners = new Set();
  }

  get loaded() { return !!this.el; }
  get playing() { return !!this.el && !this.el.paused; }
  get progress() { return this.el && this.el.duration ? this.el.currentTime / this.el.duration : 0; }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { this._listeners.forEach((fn) => fn(this)); }

  async load(file) {
    audio.unlock();
    this.unload();
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    this.el = el;
    this.name = file.name;
    this._url = url;
    this._source = audio.ctx.createMediaElementSource(el);
    this._source.connect(audio.trackGain);
    el.addEventListener('play', () => this._emit());
    el.addEventListener('pause', () => this._emit());
    el.addEventListener('loadedmetadata', () => this._emit());

    this.peaks = null;
    this._emit();
    try {
      const buf = await audio.ctx.decodeAudioData(await file.arrayBuffer());
      this.peaks = computePeaks(buf, 48);
      this.duration = buf.duration;
    } catch (e) {
      console.warn('Не удалось построить волну трека', e);
    }
    this._emit();
  }

  unload() {
    if (!this.el) return;
    this.el.pause();
    try { this._source.disconnect(); } catch (e) { /* уже отключён */ }
    URL.revokeObjectURL(this._url);
    this.el = null;
    this.name = '';
    this.peaks = null;
    this._emit();
  }

  play() { if (this.el) { audio.unlock(); return this.el.play(); } }
  pause() { if (this.el) this.el.pause(); }
  toggle() { return this.playing ? this.pause() : this.play(); }

  /** Вызывается каждый кадр игры. Возвращает состояние музыки для реакций. */
  analyse() {
    const s = this.state;
    s.beat = false;
    if (!this.playing || !audio.analyser) {
      s.bass *= 0.9; s.level *= 0.9;
      return s;
    }
    const an = audio.analyser;
    if (!this._bins) this._bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(this._bins);
    const bins = this._bins;
    const hzPerBin = audio.ctx.sampleRate / an.fftSize;
    const bassEnd = Math.max(2, Math.round(160 / hzPerBin));

    let bass = 0, all = 0, weighted = 0;
    for (let i = 0; i < bins.length; i++) {
      const v = bins[i] / 255;
      if (i < bassEnd) bass += v;
      all += v;
      weighted += v * i;
    }
    bass /= bassEnd;
    const level = all / bins.length;
    const centroid = all > 0 ? weighted / all : 0;

    // Бит: бас резко выше своего среднего за последнюю секунду
    const h = this._history;
    h.push(bass);
    if (h.length > 60) h.shift();
    const avg = h.reduce((a, b) => a + b, 0) / h.length;
    const k = 1.55 - this.sensitivity * 0.5; // выше чувствительность → ниже порог
    const now = performance.now();
    if (bass > avg * k && bass > 0.25 && now - this._lastBeat > 180) {
      s.beat = true;
      this._lastBeat = now;
    }
    s.bass = s.bass * 0.6 + bass * 0.4;
    s.level = level;
    s.hue = (s.hue * 0.9) + ((centroid / (bins.length * 0.35)) * 300) * 0.1;
    return s;
  }
}

function computePeaks(buffer, count) {
  const data = buffer.getChannelData(0);
  const size = Math.floor(data.length / count);
  const peaks = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    for (let j = i * size, end = j + size; j < end; j += 64) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / top);
}

export const track = new Track();
