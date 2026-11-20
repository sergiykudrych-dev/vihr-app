// Запись игры в видео: картинка с canvas + весь звук (ноты и трек).
//
// Важно для iPhone (Safari):
// - для каждой записи создаём НОВЫЙ аудио-выход и новый поток, иначе метки времени звука
//   идут от запуска приложения и видео получается «сломанным» (длина в сотни часов);
// - MP4 пишем одним куском (без нарезки на части), иначе Safari портит длительность.

import { audio } from '../audio/engine.js';

const TYPES = [
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function canRecord() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
  }

  get active() { return !!this.rec && this.rec.state === 'recording'; }

  start() {
    audio.unlock();
    const video = this.canvas.captureStream(30).getVideoTracks()[0];
    const tracks = [video];

    // Новый выход звука только для этой записи
    this.audioOut = audio.ctx ? audio.ctx.createMediaStreamDestination() : null;
    if (this.audioOut) {
      audio.compressor.connect(this.audioOut);
      tracks.push(...this.audioOut.stream.getAudioTracks());
    }
    this.stream = new MediaStream(tracks);

    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.mimeType = mimeType || 'video/webm';
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, mimeType
      ? { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 }
      : undefined);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    // MP4 — одним куском, WebM — частями (так надёжнее в Chrome)
    if (this.mimeType.includes('mp4')) this.rec.start();
    else this.rec.start(500);
    this.startedAt = performance.now();
  }

  /** Останавливает запись и отдаёт файл. */
  stop() {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType.split(';')[0] });
        this.cleanup();
        resolve(blob);
      };
      this.rec.stop();
    });
  }

  cleanup() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioOut) {
      try { audio.compressor.disconnect(this.audioOut); } catch (e) { /* уже отключён */ }
    }
    this.stream = null;
    this.audioOut = null;
    this.rec = null;
  }
}

/** Скачать видео (на телефоне откроется меню «Поделиться», если доступно). */
export async function saveVideo(blob, name = 'vihr') {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `${name}-${Date.now()}.${ext}`, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Вихрь' }); return; } catch (e) { /* отменили — скачаем */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
