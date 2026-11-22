// Экран «Видео»: выбираешь игру, цвета, длительность и музыку → видео собирается само → скачиваешь.
// Сборка идёт кадр за кадром (src/core/video-render.js), поэтому не зависит от скорости телефона.

import { $, el, toast, pressGroup } from './dom.js';
import { findGame } from './play.js';
import { Runner } from '../core/runner.js';
import { audio } from '../audio/engine.js';
import { GAMES } from '../games/registry.js';
import { store } from '../core/store.js';
import { track } from '../audio/track.js';
import { api } from '../core/api.js';
import { shouldShowRecordAd, showAd } from '../core/ads.js';
import { saveVideo } from '../core/recorder.js';
import { canRenderVideo, renderVideo, decodeMusic } from '../core/video-render.js';
import { PACKS } from '../audio/packs.js';
import { PALETTES, PALETTE_KEYS, paletteCss } from '../render/palettes.js';
import { go } from '../core/router.js';
import { t } from '../i18n/index.js';

const SECONDS = [10, 15, 30, 60];

let gameId = null;
let seconds = 30;
let ballSound = 'glass';   // набор звуков удара или 'off'
let musicMode = 'none';     // 'none' | 'track'
let musicFile = null;       // выбранный файл с музыкой
let ballDefault = 1;        // сколько шариков в игре по умолчанию
let probe = null;           // игра в превью — она же подсказывает, какие настройки умеет
let preview = null;         // экран превью (живая игра в рамке 9:16)
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

  ballSound = store.data.studioSound || store.data.pack || 'glass';
  preview = new Runner($('#st-preview'), { padding: 0.9 });
  initRingInput();
  $('#st-music-file').addEventListener('change', onMusicFile);
  const from = $('#st-from'), to = $('#st-to');
  from.value = store.data.paletteFrom; to.value = store.data.paletteTo;
  const onColor = () => {
    store.data.paletteFrom = from.value; store.data.paletteTo = to.value; store.save();
    renderPalettes();
    startPreview();
  };
  from.addEventListener('input', onColor);
  to.addEventListener('input', onColor);

  $('#st-create').addEventListener('click', create);
  $('#st-cancel').addEventListener('click', () => { if (abort) abort.abort(); });
  $('#st-save').addEventListener('click', save);
  $('#st-again').addEventListener('click', () => { clearResult(); showForm(); });
}

export function enterStudio() {
  audio.muted = true; // в превью звуков нет
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
  renderSound();
  renderNote();
}

export function leaveStudio() {
  if (abort) abort.abort();
  clearResult();
  preview.stop();
  preview.setGame(null);
  audio.muted = store.data.muted;
}

/** Превью: живая игра в рамке 9:16 с выбранными цветами и числом колец. */
const NO_BALL_CHOICE = new Set(['plinko', 'smash', 'multiply', 'spiral']);

/** Сколько шариков можно выбрать в игре (null — выбора нет). */
function ballChoices(game) {
  if (!game || !game.world || NO_BALL_CHOICE.has(gameId) || !(game.maxBalls > 1)) return null;
  const max = Math.min(game.maxBalls, 12);
  const set = new Set([1, 2, 3, 4, 5, 8, 12, max, ballDefault].filter((n) => n >= 1 && n <= max));
  return [...set].sort((x, y) => x - y);
}

function applyBalls(game) {
  const n = (store.data.ballCounts || {})[gameId];
  if (!n || !ballChoices(game)) return;
  let guard = 40;
  while (game.world.balls.length < n && guard--) game.tap((Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160);
  while (game.world.balls.length > n) game.world.balls.pop();
}

function renderBalls() {
  const choices = ballChoices(probe);
  $('#st-balls').hidden = !choices;
  if (!choices) return;
  const cur = (store.data.ballCounts || {})[gameId] || ballDefault;
  $('#st-ball-presets').replaceChildren(...choices.map((n) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(n === cur),
    onclick: () => {
      store.data.ballCounts = { ...(store.data.ballCounts || {}), [gameId]: n };
      store.save();
      startPreview();
      renderBalls();
    },
  }, String(n))));
}

function startPreview() {
  const found = gameId && findGame(gameId);
  if (!found) return;
  const game = found.create();
  if (typeof game.setPalette === 'function') game.setPalette(currentPalette(), customColors());
  if (typeof game.setRingCount === 'function' && store.data.ringCounts[gameId]) game.setRingCount(store.data.ringCounts[gameId]);
  ballDefault = game.world ? game.world.balls.length : 1;
  applyBalls(game);
  probe = game;
  preview.setGame(game);
  preview.resize();
  preview.start();
}

function showForm() {
  $('#studio-form').hidden = false;
  $('#studio-progress').hidden = true;
  $('#studio-result').hidden = true;
  $('#st-create').hidden = false;
  $('#st-save').hidden = true;
  $('#st-video').hidden = true;
  $('#st-preview').hidden = false;
  $('#studio-frame').hidden = false;
  $('#studio-frame').classList.remove('is-video');
  if (probe) preview.start();
}

function renderGames() {
  $('#st-games').replaceChildren(...gameList().map((g) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(g.id === gameId),
    onclick: () => { pickGame(g.id); renderGames(); },
  }, g.title)));
}

function pickGame(id) {
  gameId = id;
  startPreview();
  const canRings = !!probe && typeof probe.setRingCount === 'function';
  const canColors = !!probe && typeof probe.setPalette === 'function';
  $('#st-rings').hidden = !canRings;
  $('#st-colors').hidden = !canColors;
  if (canRings) renderRings();
  if (canColors) renderPalettes();
  renderBalls();
}

function setRingCount(n) {
  if (!probe || !probe.setRingCount) return;
  probe.setRingCount(n);
  const value = probe.ringOptions().value; // игра сама ограничит число своими границами
  store.data.ringCounts = { ...store.data.ringCounts, [gameId]: value };
  store.save();
  startPreview();
  renderRings();
}

function renderRings() {
  const o = probe.ringOptions();
  $('#st-ring-presets').replaceChildren(...o.presets.map((n) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(n === o.value),
    onclick: () => setRingCount(n),
  }, String(n))));
  const input = $('#st-ring-input');
  input.dataset.min = o.min;
  input.dataset.max = o.max;
  input.maxLength = String(o.max).length;
  input.value = o.value;
  if (!limitTimer) $('#st-ring-hint').textContent = t('Своё число — от {min} до {max}', { min: o.min, max: o.max });
}

let limitTimer = 0;
function showLimit(text) {
  const input = $('#st-ring-input'), hint = $('#st-ring-hint');
  hint.textContent = text;
  input.classList.add('is-limit'); hint.classList.add('is-limit');
  clearTimeout(limitTimer);
  limitTimer = setTimeout(() => {
    limitTimer = 0;
    input.classList.remove('is-limit'); hint.classList.remove('is-limit');
    if (probe && probe.ringOptions) renderRings();
  }, 1800);
}

/** Своё число колец: только цифры, больше максимума набрать нельзя. */
function initRingInput() {
  const input = $('#st-ring-input');
  input.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('beforeinput', (e) => {
    if (e.data && /\D/.test(e.data)) {
      e.preventDefault();
      const digits = e.data.replace(/\D/g, '');
      if (digits && e.inputType === 'insertFromPaste') {
        input.setRangeText(digits, input.selectionStart, input.selectionEnd, 'end');
        input.dispatchEvent(new Event('input'));
      }
    }
  });
  input.addEventListener('input', () => {
    const max = Number(input.dataset.max);
    let v = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, String(max).length);
    if (v && Number(v) > max) { v = String(max); showLimit(t('Максимум {max}', { max })); }
    if (input.value !== v) input.value = v;
  });
  input.addEventListener('change', () => {
    const min = Number(input.dataset.min);
    const n = parseInt(input.value, 10);
    if (!Number.isFinite(n)) { renderRings(); return; }
    if (n < min) showLimit(t('Минимум {min}', { min }));
    setRingCount(n);
  });
}

function renderPalettes() {
  const current = currentPalette();
  $('#st-palettes').replaceChildren(...PALETTE_KEYS.map((key) => el('button', {
    class: 'swatch', type: 'button', 'aria-pressed': String(key === current),
    onclick: () => {
      store.data.gamePalettes = { ...(store.data.gamePalettes || {}), [gameId]: key };
      store.set('palette', key);
      renderPalettes();
      startPreview();
    },
  }, el('span', { class: 'swatch__bar', style: `background:${paletteCss(key, customColors())}`, 'aria-hidden': 'true' }), PALETTES[key].name)));
  $('#st-custom').hidden = current !== 'custom';
}

function renderSound() {
  const items = [...Object.entries(PACKS).map(([k, p]) => [k, p.name]), ['off', t('Без звука')]];
  pressGroup($('#st-sound'), items, ballSound, (v) => {
    ballSound = v;
    store.set('studioSound', v);
    if (v !== 'off') audio.preview(v); // коротко проигрываем, как звучит
  }, 'chip');
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
  const parts = [t('Вертикальное видео 1080×1920, 60 к/с')];
  if (!canRenderVideo()) parts.unshift(t('Этот браузер не умеет собирать видео. Обнови iOS или Telegram.'));
  $('#st-note').textContent = parts.join(' · ');
  $('#st-create').disabled = !canRenderVideo();
  $('#st-create').textContent = t('Создать видео') + ' · ' + t('{n} с', { n: seconds });
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
  // Реклама на кнопке «Создать видео»: показываем до сборки
  if (shouldShowRecordAd()) {
    await showAd(gameId);
    if (location.hash !== '#studio') { busy = false; return; }
  }
  abort = new AbortController();
  $('#studio-form').hidden = true;
  $('#studio-progress').hidden = false;
  $('#st-create').hidden = true;
  $('#studio-frame').hidden = true; // пока идёт сборка, превью не нужно
  preview.stop();
  setProgress(0, 'music');
  keepAwake();
  try {
    // Новая игра с выбранными цветами и числом колец
    const game = found.create();
    if (typeof game.setPalette === 'function') game.setPalette(currentPalette(), customColors());
    if (typeof game.setRingCount === 'function' && store.data.ringCounts[gameId]) game.setRingCount(store.data.ringCounts[gameId]);
    applyBalls(game);

    let music = null;
    if (musicMode === 'track' && musicFile) {
      try { music = await decodeMusic(musicFile); } catch (e) { toast(t('Не получилось прочитать трек — сделаю без музыки')); }
    }
    const { blob, hasAudio } = await renderVideo({ game, seconds, music, ballSound: ballSound === 'off' ? null : ballSound, onProgress: setProgress, signal: abort.signal });
    $('#studio-progress').hidden = true;
    api.event('record', gameId);
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
  $('#studio-progress').hidden = true;
  $('#studio-result').hidden = false;
  $('#st-create').hidden = true;
  $('#st-save').hidden = false;
  $('#st-preview').hidden = true;
  $('#studio-frame').hidden = false;
  $('#studio-frame').classList.add('is-video'); // готовое видео вертикальное
  v.hidden = false;
}

function clearResult() {
  const v = $('#st-video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = ''; videoBlob = null;
  $('#studio-result').hidden = true;
  if (v) v.hidden = true;
}

async function save() {
  if (!videoBlob) return;
  // Нажатие напрямую: iPhone покажет «Сохранить видео» в меню «Поделиться»
  const result = await saveVideo(videoBlob);
  if (result === 'cancelled') return;
  toast(result === 'shared' ? t('Готово') : t('Видео скачано'));
}
