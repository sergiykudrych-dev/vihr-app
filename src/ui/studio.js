// Экран «Видео»: выбираешь игру, цвета, длительность и музыку → видео собирается само → скачиваешь.
// Сборка идёт кадр за кадром (src/core/video-render.js), поэтому не зависит от скорости телефона.

import { $, el, toast, pressGroup } from './dom.js';
import { findGame } from './play.js';
import { GAMES } from '../games/registry.js';
import { store } from '../core/store.js';
import { track } from '../audio/track.js';
import { api } from '../core/api.js';
import { shouldShowRecordAd, showAd } from '../core/ads.js';
import { saveVideo } from '../core/recorder.js';
import { canRenderVideo, renderVideo, decodeMusic } from '../core/video-render.js';
import { PALETTES, PALETTE_KEYS, paletteCss } from '../render/palettes.js';
import { go } from '../core/router.js';
import { t } from '../i18n/index.js';

const SECONDS = [10, 15, 30, 60];

let gameId = null;
let seconds = 30;
let musicMode = 'none';     // 'none' | 'track'
let musicFile = null;       // выбранный файл с музыкой
let probe = null;           // пробный экземпляр игры — узнать, какие настройки она умеет
let busy = false;
let abort = null;
let wakeLock = null;
let videoBlob = null;
let videoUrl = '';

const customColors = () => ({ from: store.data.paletteFrom, to: store.data.paletteTo });

function gameList() {
  const mine = store.data.customGames.map((g) => ({ id: 'custom-' + g.id, title: g.name }));
  return [...GAMES, ...mine].filter((g) => !api.isDisabled(g.id));
}

function currentPalette() {
  const own = (store.data.gamePalettes || {})[gameId];
  return own || (probe && probe.defaultPalette) || store.data.palette;
}

export function initStudio() {
  seconds = store.data.studioSeconds || 30;
  pressGroup($('#st-seconds'), SECONDS.map((s) => [String(s), t('{n} с', { n: s })]), String(seconds), (v) => {
    seconds = Number(v);
    store.set('studioSeconds', seconds);
    renderNote();
  }, 'chip');

  $('#st-music-file').addEventListener('change', onMusicFile);
  const from = $('#st-from'), to = $('#st-to');
  from.value = store.data.paletteFrom; to.value = store.data.paletteTo;
  const onColor = () => {
    store.data.paletteFrom = from.value; store.data.paletteTo = to.value; store.save();
    renderPalettes();
  };
  from.addEventListener('input', onColor);
  to.addEventListener('input', onColor);

  $('#st-create').addEventListener('click', create);
  $('#st-cancel').addEventListener('click', () => { if (abort) abort.abort(); });
  $('#st-save').addEventListener('click', save);
  $('#st-again').addEventListener('click', () => { clearResult(); showForm(); });
}

export function enterStudio() {
  if (busy) return;
  clearResult();
  showForm();
  const list = gameList();
  const wanted = gameId && list.some((g) => g.id === gameId) ? gameId : store.data.lastGame;
  gameId = list.some((g) => g.id === wanted) ? wanted : (list[0] && list[0].id);
  if (!musicFile && track.file) musicFile = track.file;
  renderGames();
  pickGame(gameId);
  renderMusic();
  renderNote();
}

export function leaveStudio() {
  if (abort) abort.abort();
  clearResult();
}

function showForm() {
  $('#studio-form').hidden = false;
  $('#studio-progress').hidden = true;
  $('#studio-result').hidden = true;
}

function renderGames() {
  $('#st-games').replaceChildren(...gameList().map((g) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(g.id === gameId),
    onclick: () => { pickGame(g.id); renderGames(); },
  }, g.title)));
}

function pickGame(id) {
  gameId = id;
  const found = findGame(id);
  probe = found ? found.create() : null;
  const canRings = !!probe && typeof probe.setRingCount === 'function';
  const canColors = !!probe && typeof probe.setPalette === 'function';
  $('#st-rings').hidden = !canRings;
  $('#st-colors').hidden = !canColors;
  if (canRings) renderRings();
  if (canColors) renderPalettes();
}

function renderRings() {
  const saved = store.data.ringCounts[gameId];
  if (saved) probe.setRingCount(saved);
  const o = probe.ringOptions();
  $('#st-ring-presets').replaceChildren(...o.presets.map((n) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(n === o.value),
    onclick: () => {
      probe.setRingCount(n);
      store.data.ringCounts = { ...store.data.ringCounts, [gameId]: probe.ringOptions().value };
      store.save();
      renderRings();
    },
  }, String(n))));
}

function renderPalettes() {
  const current = currentPalette();
  $('#st-palettes').replaceChildren(...PALETTE_KEYS.map((key) => el('button', {
    class: 'swatch', type: 'button', 'aria-pressed': String(key === current),
    onclick: () => {
      store.data.gamePalettes = { ...(store.data.gamePalettes || {}), [gameId]: key };
      store.set('palette', key);
      renderPalettes();
    },
  }, el('span', { class: 'swatch__bar', style: `background:${paletteCss(key, customColors())}`, 'aria-hidden': 'true' }), PALETTES[key].name)));
  $('#st-custom').hidden = current !== 'custom';
}

function renderMusic() {
  const name = musicFile ? (musicFile.name.length > 20 ? musicFile.name.slice(0, 18) + '…' : musicFile.name) : t('Загрузить трек');
  const items = [['none', t('Без музыки')], ['track', musicFile ? '♪ ' + name : name]];
  if (musicFile) items.push(['pick', t('Другой трек')]);
  pressGroup($('#st-music'), items, musicMode, (v) => {
    if (v === 'pick' || (v === 'track' && !musicFile)) { renderMusic(); $('#st-music-file').click(); return; }
    musicMode = v;
    renderMusic();
    renderNote();
  }, 'chip');
}

function onMusicFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  musicFile = file;
  musicMode = 'track';
  renderMusic();
  renderNote();
}

function renderNote() {
  const parts = [t('Горизонтальное видео 1080p, 60 к/с')];
  if (!canRenderVideo()) parts.unshift(t('Этот браузер не умеет собирать видео. Обнови iOS или Telegram.'));
  $('#st-note').textContent = parts.join(' · ');
  $('#st-create').disabled = !canRenderVideo();
}

const PHASES = { frames: 'Рисую кадры…', audio: 'Собираю звук…', mux: 'Склеиваю видео…', done: 'Готово', music: 'Читаю трек…' };

function setProgress(p, phase) {
  $('#st-phase').textContent = `${t(PHASES[phase] || PHASES.frames)} ${Math.round(p * 100)}%`;
  $('#st-bar').style.width = `${(p * 100).toFixed(1)}%`;
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseAwake() { try { wakeLock?.release(); } catch (e) { /* уже отпущен */ } wakeLock = null; }

async function create() {
  if (busy || !gameId) return;
  const found = findGame(gameId);
  if (!found) return;
  busy = true;
  abort = new AbortController();
  $('#studio-form').hidden = true;
  $('#studio-progress').hidden = false;
  setProgress(0, 'music');
  keepAwake();
  try {
    // Новая игра с выбранными цветами и числом колец
    const game = found.create();
    if (typeof game.setPalette === 'function') game.setPalette(currentPalette(), customColors());
    if (typeof game.setRingCount === 'function' && store.data.ringCounts[gameId]) game.setRingCount(store.data.ringCounts[gameId]);

    let music = null;
    if (musicMode === 'track' && musicFile) {
      try { music = await decodeMusic(musicFile); } catch (e) { toast(t('Не получилось прочитать трек — сделаю без музыки')); }
    }
    const { blob, hasAudio } = await renderVideo({ game, seconds, music, onProgress: setProgress, signal: abort.signal });
    $('#studio-progress').hidden = true;
    api.event('record', gameId);
    // Реклама, когда видео уже готово: игрок получает ролик сразу после неё
    if (shouldShowRecordAd()) {
      await showAd(gameId);
    }
    if (location.hash !== '#studio') return;
    showResult(blob, hasAudio);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      toast(t('Сборка отменена'));
    } else {
      console.error(e);
      toast(t('Не получилось собрать видео. Попробуй ещё раз'));
    }
    showForm();
  } finally {
    busy = false;
    abort = null;
    releaseAwake();
  }
}

function showResult(blob, hasAudio) {
  clearResult();
  videoBlob = blob;
  videoUrl = URL.createObjectURL(blob);
  const v = $('#st-video');
  v.src = videoUrl;
  v.play().catch(() => {});
  const mb = (blob.size / 1048576).toFixed(1);
  $('#st-result-note').textContent = hasAudio ? t('{mb} МБ', { mb }) : t('{mb} МБ · без звука: этот браузер не умеет кодировать звук', { mb });
  $('#studio-form').hidden = true;
  $('#studio-result').hidden = false;
}

function clearResult() {
  const v = $('#st-video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = ''; videoBlob = null;
  $('#studio-result').hidden = true;
}

async function save() {
  if (!videoBlob) return;
  // Нажатие напрямую: iPhone покажет «Сохранить видео» в меню «Поделиться»
  const result = await saveVideo(videoBlob);
  if (result === 'cancelled') return;
  toast(result === 'shared' ? t('Готово') : t('Видео скачано'));
}
