// Сборка видео «в фоне», без записи экрана: игра считается кадр за кадром (60 к/с),
// картинка и звук кодируются на лету и склеиваются в .mp4. Ничего не зависит от скорости телефона:
// если он считает медленнее реального времени — видео всё равно получится ровным.

import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.js';
import { encodeAac } from '../vendor/aac-encode.js';
import { ARENA } from '../games/base.js';
import { audio } from '../audio/engine.js';
import { PACKS } from '../audio/packs.js';
import { store } from './store.js';

export const FPS = 60;
export const VIDEO_W = 1080; // вертикальное видео, как для TikTok и Shorts
export const VIDEO_H = 1920;
const SAMPLE_RATE = 48000;
const BG = '#05040C';

export function canRenderVideo() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
    && typeof OfflineAudioContext !== 'undefined' && typeof WebAssembly !== 'undefined'
    && !!(window.AudioContext || window.webkitAudioContext);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Читает файл с музыкой в AudioBuffer. */
export async function decodeMusic(file) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    ctx.close?.();
  }
}

/** Бит, бас и «цвет» музыки для каждого кадра (то же, что считает живой анализатор в игре). */
function analyseMusic(buf, frames, react) {
  const sr = buf.sampleRate;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const len = ch0.length;
  const spf = sr / FPS;
  const a = 1 - Math.exp((-2 * Math.PI * 160) / sr);
  let lp = 0, prev = 0;
  const low = new Float32Array(frames), all = new Float32Array(frames), zc = new Float32Array(frames);
  let pos = 0;
  for (let f = 0; f < frames; f++) {
    const end = Math.round((f + 1) * spf);
    let eLow = 0, eAll = 0, z = 0, n = 0;
    for (; pos < end; pos++) {
      const x = (ch0[pos % len] + ch1[pos % len]) * 0.5;
      lp += a * (x - lp);
      eLow += lp * lp; eAll += x * x;
      if ((x >= 0) !== (prev >= 0)) z++;
      prev = x; n++;
    }
    low[f] = Math.sqrt(eLow / n); all[f] = Math.sqrt(eAll / n); zc[f] = z / n;
  }
  const peakLow = Math.max(1e-6, ...low.slice(0, 20000)), peakAll = Math.max(1e-6, ...all.slice(0, 20000));
  const out = [];
  const hist = [];
  let lastBeat = -1, bassS = 0, hue = 200;
  const k = 1.55 - store.data.sensitivity * 0.5;
  for (let f = 0; f < frames; f++) {
    const bass = Math.min(1, (low[f] / peakLow) * 0.8);
    hist.push(bass); if (hist.length > 60) hist.shift();
    const avg = hist.reduce((x, y) => x + y, 0) / hist.length;
    let beat = false;
    if (bass > avg * k && bass > 0.25 && (f - lastBeat) * 1000 / FPS > 180) { beat = true; lastBeat = f; }
    bassS = bassS * 0.6 + bass * 0.4;
    hue = hue * 0.9 + Math.min(1, zc[f] / 0.12) * 300 * 0.1;
    out.push({ beat, bass: bassS, level: Math.min(1, all[f] / peakAll) * 0.5, hue });
  }
  return out;
}

/** Настоящий звук: ноты из игры + музыка, собранные одним куском без привязки к реальному времени. */
async function mixAudio(cap, music, seconds) {
  const length = Math.ceil(seconds * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = audio.volume;
  master.connect(comp);
  if (music) {
    const src = ctx.createBufferSource();
    src.buffer = music; src.loop = true;
    const g = ctx.createGain();
    const base = audio.trackVolume ?? store.data.trackVolume ?? 0.9;
    g.gain.setValueAtTime(base, 0);
    for (const p of cap.mix) g.gain.setTargetAtTime(base * p.m, p.t, 0.08);
    src.connect(g); g.connect(comp);
    src.start(0);
  }
  for (const e of cap.events) {
    const pack = PACKS[e.pack] || PACKS.glass;
    try { pack.play(ctx, master, e.f, e.v, e.when + 0.001); } catch (err) { /* одна нота не должна ломать видео */ }
  }
  return ctx.startRendering();
}

async function pickVideoConfig() {
  const sizes = [[VIDEO_W, VIDEO_H, 10_000_000], [720, 1280, 6_000_000]];
  const codecs = ['avc1.64002A', 'avc1.4D402A', 'avc1.42002A', 'avc1.640028', 'avc1.4D4028'];
  for (const [width, height, bitrate] of sizes) {
    for (const codec of codecs) {
      const cfg = { codec, width, height, bitrate, framerate: FPS, latencyMode: 'quality' };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, width, height }; } catch (e) { /* дальше */ }
    }
  }
  return null;
}

/**
 * Собрать видео.
 * @param {object} o { game, seconds, music: AudioBuffer|null, onProgress(0..1, phase), signal }
 * @returns {Promise<{blob: Blob, hasAudio: boolean}>}
 */
export async function renderVideo({ game, seconds, music, ballSound = null, onProgress = () => {}, signal }) {
  const vc = await pickVideoConfig();
  if (!vc) throw new Error('no-video-encoder');
  const { width, height } = vc;
  const frames = Math.round(seconds * FPS);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encError = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encError = e; },
  });
  venc.configure(vc.cfg);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const pad = game.padding || 0.9;
  const scale = (Math.min(width, height) / (ARENA * 2)) * pad;
  game.viewR = Math.hypot(width, height) / 2 / scale;

  const analysis = music ? analyseMusic(music, frames, store.data.react) : null;
  game.react = { ...store.data.react };
  audio.beginCapture(!!music, { pack: ballSound, off: !ballSound });
  let cap = null;
  try {
    const idle = { beat: false, bass: 0, level: 0, hue: 200 };
    const dt = 1 / FPS;
    for (let f = 0; f < frames; f++) {
      if (signal && signal.aborted) throw new DOMException('Отменено', 'AbortError');
      if (encError) throw encError;
      audio.cap.t = f * dt;
      game.update(dt, analysis ? analysis[f] : idle);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(scale, 0, 0, scale, width / 2, height / 2);
      game.draw(ctx);

      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      // Не копим очередь кадров в памяти и даём экрану обновиться
      while (venc.encodeQueueSize > 6) await tick();
      if (f % 6 === 0) { onProgress((f / frames) * 0.85, 'frames'); await tick(); }
    }
    await venc.flush();
  } catch (e) {
    try { venc.close(); } catch (e2) { /* уже закрыт */ }
    throw e;
  } finally {
    cap = audio.endCapture();
  }
  venc.close();

  onProgress(0.86, 'audio');
  await tick();
  const rendered = await mixAudio(cap, music, seconds);
  onProgress(0.92, 'audio');
  const aac = await encodeAac([rendered.getChannelData(0), rendered.getChannelData(1)], SAMPLE_RATE, 160);
  const dur = Math.round((aac.frameLength / SAMPLE_RATE) * 1e6);
  aac.frames.forEach((fr, i) => {
    const meta = i === 0 ? { decoderConfig: { codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: SAMPLE_RATE, description: aac.config } } : undefined;
    muxer.addAudioChunkRaw(fr, 'key', Math.round((i * aac.frameLength / SAMPLE_RATE) * 1e6), dur, meta);
  });
  const hasAudio = true;
  if (encError) throw encError;

  onProgress(0.98, 'mux');
  muxer.finalize();
  onProgress(1, 'done');
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), hasAudio };
}
