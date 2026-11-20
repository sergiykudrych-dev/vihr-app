// Экран «Мой трек»: загрузка музыки, плеер, настройки реакции игры.

import { $, el, bindSlider, fmtTime, toast } from './dom.js';
import { track } from '../audio/track.js';
import { store } from '../core/store.js';

const REACTIONS = [
  { key: 'beat', title: 'Бит → вспышка', sub: 'Игра вздрагивает на каждый удар' },
  { key: 'bass', title: 'Бас → размер шариков', sub: 'Шарики «дышат» вместе с низами' },
  { key: 'color', title: 'Мелодия → цвет', sub: 'Цвет меняется с высотой звука' },
];

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm', 'mp4', 'caf', 'aif', 'aiff'];

function isAudioFile(file) {
  if (file.type && file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop().toLowerCase();
  // Файлы из Telegram и мессенджеров часто приходят без типа — смотрим на расширение
  return AUDIO_EXT.includes(ext) || !file.type;
}

function drawWave() {
  const c = $('#track-wave');
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const peaks = track.peaks || Array.from({ length: 48 }, () => 0.15);
  const bw = r.width / peaks.length;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim();
  const played = track.progress;
  peaks.forEach((p, i) => {
    const h = Math.max(4, p * r.height);
    g.fillStyle = i / peaks.length <= played ? accent : '#5E5C94';
    g.beginPath();
    g.roundRect(i * bw + bw * 0.25, (r.height - h) / 2, bw * 0.5, h, bw * 0.25);
    g.fill();
  });
}

function renderPlayer() {
  const has = track.loaded;
  $('#player').hidden = !has;
  $('#upload-title').textContent = has ? 'Заменить трек' : 'Загрузить трек';
  if (!has) return;
  $('#track-name').textContent = track.name;
  const ext = track.name.split('.').pop().toUpperCase();
  $('#track-meta').textContent = `${fmtTime(track.duration || track.el.duration)} · ${ext}`;
  $('#track-toggle-icon').setAttribute('href', `assets/img/icons/sprite.svg#${track.playing ? 'i-pause' : 'i-play'}`);
  $('#track-toggle').setAttribute('aria-label', track.playing ? 'Пауза' : 'Слушать трек');
  drawWave();
}

function renderReactions() {
  $('#reactions').replaceChildren(...REACTIONS.map((r) => el('div', { class: 'toggle-row' },
    el('div', { class: 'toggle-row__body' },
      el('div', { class: 'toggle-row__title' }, r.title),
      el('div', { class: 'muted small' }, r.sub)),
    el('button', {
      class: 'switch', role: 'switch', type: 'button', 'aria-label': r.title,
      'aria-checked': String(!!track.react[r.key]),
      onclick: (e) => {
        track.react[r.key] = !track.react[r.key];
        e.currentTarget.setAttribute('aria-checked', String(track.react[r.key]));
        store.set('react', { ...track.react });
      },
    }))));
}

export function initTrack() {
  Object.assign(track.react, store.data.react);
  track.sensitivity = store.data.sensitivity;

  $('#track-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!isAudioFile(file)) {
      toast('Это не музыкальный файл. Выбери MP3, M4A или WAV');
      e.target.value = '';
      return;
    }
    try {
      await track.load(file);
      toast('Трек загружен');
    } catch (err) {
      console.error(err);
      toast('Не получилось открыть этот файл');
    }
    e.target.value = '';
  });
  $('#track-toggle').addEventListener('click', () => track.toggle());
  $('#track-remove').addEventListener('click', () => track.unload());
  track.onChange(renderPlayer);

  renderReactions();
  bindSlider($('#sensitivity'), $('#sensitivity-out'), Math.round(track.sensitivity * 100), (v) => `${v}%`, (v) => {
    track.sensitivity = v / 100;
    store.set('sensitivity', v / 100);
  });

  // Волна обновляется, пока трек играет на этом экране
  setInterval(() => { if (track.playing && $('[data-screen="track"]').classList.contains('is-active')) drawWave(); }, 200);
}

export function enterTrack() {
  renderPlayer();
}
