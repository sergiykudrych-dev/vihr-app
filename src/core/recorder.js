// Запись игры в видео: картинка с canvas + весь звук (ноты и трек).

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
    const stream = this.canvas.captureStream(60);
    const audioStream = audio.getRecordStream();
    if (audioStream) audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.mimeType = mimeType || 'video/webm';
    this.chunks = [];
    this.rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  /** Останавливает запись и отдаёт файл. */
  stop() {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.rec = null;
        resolve(blob);
      };
      this.rec.stop();
    });
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
