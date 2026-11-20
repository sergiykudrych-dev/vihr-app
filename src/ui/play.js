// Игровой экран: почти пустой — игра по центру, счёт, прогресс трека и кнопка записи.

import { $, toast } from './dom.js';
import { Runner } from '../core/runner.js';
import { Recorder, canRecord, saveVideo } from '../core/recorder.js';
import { GAMES, CUSTOM_META } from '../games/registry.js';
import { store } from '../core/store.js';
import { track } from '../audio/track.js';
import { audio } from '../audio/engine.js';
import { go } from '../core/router.js';

let runner = null;
let recorder = null;
let recTimer = 0;
let lastScore = -1;

export function findGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (g) return { meta: g, create: () => new g.Game() };
  if (id && id.startsWith('custom-')) {
    const cfg = store.data.customGames.find((c) => 'custom-' + c.id === id);
    if (cfg) return { meta: { ...CUSTOM_META, title: cfg.name }, create: () => new CUSTOM_META.Game({ config: cfg }) };
  }
  return null;
}

export function initPlay() {
  const canvas = $('#game-canvas');
  // padding < 1 — арена меньше экрана, вокруг много пустого места
  runner = new Runner(canvas, {
    padding: 0.8,
    onFrame: (game) => {
      if (game.score !== lastScore) { lastScore = game.score; $('#game-score').textContent = game.score; }
      const bar = $('#game-progress');
      bar.hidden = !track.loaded;
      if (track.loaded) $('#game-progress-bar').style.width = `${(track.progress * 100).toFixed(1)}%`;
    },
  });
  runner.onTap = () => {
    $('#game-hint').classList.add('is-hidden');
    // Телефоны разрешают звук только после касания — запускаем трек на первом тапе
    if (track.loaded && !track.playing && !runner.trackStarted) { runner.trackStarted = true; track.play(); }
  };

  // Быстрое выключение звука касаний прямо в игре (музыка продолжает играть)
  const mute = $('#game-mute');
  const renderMute = () => {
    mute.setAttribute('aria-pressed', String(audio.muted));
    mute.setAttribute('aria-label', audio.muted ? 'Включить звук касаний' : 'Выключить звук касаний');
    $('#game-mute-icon').setAttribute('href', `assets/img/icons/sprite.svg#${audio.muted ? 'i-sound-off' : 'i-sound'}`);
  };
  audio.muted = store.data.muted;
  renderMute();
  mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    store.set('muted', audio.muted);
    renderMute();
    toast(audio.muted ? 'Звук касаний выключен' : 'Звук касаний включён');
  });

  recorder = new Recorder(canvas);
  $('#rec-btn').addEventListener('click', toggleRecord);
  $('#video-save').addEventListener('click', saveCurrentVideo);
  $('#video-discard').addEventListener('click', closeVideo);
  if (!canRecord()) $('#rec-btn').hidden = true;
}

const MIN_RECORD_MS = 2000; // короче iPhone может отдать пустой файл
let videoBlob = null;
let videoUrl = '';
let stopping = false;

function setRecButton(recording) {
  const btn = $('#rec-btn');
  btn.setAttribute('aria-pressed', String(recording));
  btn.setAttribute('aria-label', recording ? 'Остановить запись' : 'Записать видео');
}

async function toggleRecord() {
  const btn = $('#rec-btn');
  if (stopping) return;
  if (recorder.active) {
    // Слишком короткая запись — дописываем до 2 секунд, потом останавливаем
    stopping = true;
    btn.setAttribute('aria-busy', 'true');
    const left = MIN_RECORD_MS - (performance.now() - recorder.startedAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    clearInterval(recTimer);
    $('#rec-time').hidden = true;
    const blob = await recorder.stop();
    btn.removeAttribute('aria-busy');
    setRecButton(false);
    stopping = false;
    if (!blob || !blob.size) { toast('Не получилось записать. Попробуй ещё раз'); return; }
    showVideo(blob);
    return;
  }
  try {
    recorder.start();
  } catch (e) {
    console.error(e);
    toast('Запись не поддерживается в этом браузере');
    return;
  }
  setRecButton(true);
  const time = $('#rec-time');
  time.hidden = false;
  time.textContent = '0:00';
  recTimer = setInterval(() => {
    const s = Math.floor((performance.now() - recorder.startedAt) / 1000);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 250);
}

function showVideo(blob) {
  closeVideo();
  videoBlob = blob;
  videoUrl = URL.createObjectURL(blob);
  const v = $('#video-preview');
  v.src = videoUrl;
  v.play().catch(() => {});
  $('#video-sheet').hidden = false;
}

function closeVideo() {
  const v = $('#video-preview');
  v.pause();
  v.removeAttribute('src');
  v.load();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = '';
  videoBlob = null;
  $('#video-sheet').hidden = true;
}

async function saveCurrentVideo() {
  if (!videoBlob) return;
  // Вызывается прямо из нажатия — iPhone разрешит «Сохранить видео» в меню «Поделиться»
  const result = await saveVideo(videoBlob);
  if (result === 'cancelled') return;
  closeVideo();
  toast(result === 'shared' ? 'Готово' : 'Видео скачано');
}

export function enterPlay(id) {
  const found = findGame(id);
  if (!found) { go('games'); return; }
  lastScore = -1;
  runner.setGame(found.create());
  runner.resize();
  runner.start();
  const hint = $('#game-hint');
  hint.textContent = found.meta.hint || 'Касайся экрана';
  hint.classList.remove('is-hidden');
  setTimeout(() => hint.classList.add('is-hidden'), 3500);
  runner.trackStarted = false;
  if (track.loaded && audio.ctx) { runner.trackStarted = true; track.play()?.catch?.(() => { runner.trackStarted = false; }); }
}

export async function leavePlay() {
  if (recorder && recorder.active) await recorder.stop();
  clearInterval(recTimer);
  $('#rec-time').hidden = true;
  setRecButton(false);
  stopping = false;
  closeVideo();
  runner.stop();
  runner.setGame(null);
  track.pause();
}
