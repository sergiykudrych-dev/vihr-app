// Игровой экран: почти пустой — игра по центру, счёт, прогресс трека и кнопка записи.

import { $, el, toast } from './dom.js';
import { Runner } from '../core/runner.js';
import { Recorder, canRecord, saveVideo } from '../core/recorder.js';
import { GAMES, CUSTOM_META } from '../games/registry.js';
import { store } from '../core/store.js';
import { track } from '../audio/track.js';
import { audio } from '../audio/engine.js';
import { go } from '../core/router.js';
import { api } from '../core/api.js';
import { PALETTES, PALETTE_KEYS, paletteCss } from '../render/palettes.js';
import { t } from '../i18n/index.js';

let runner = null;
let recorder = null;
let recTimer = 0;
let lastScore = -1;
let currentId = null;
let playStart = 0; // когда началась игра (для статистики)

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
    mute.setAttribute('aria-label', audio.muted ? t('Включить звук касаний') : t('Выключить звук касаний'));
    $('#game-mute-icon').setAttribute('href', `assets/img/icons/sprite.svg?v=8f4948d8#${audio.muted ? 'i-sound-off' : 'i-sound'}`);
  };
  audio.muted = store.data.muted;
  renderMute();
  mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    store.set('muted', audio.muted);
    renderMute();
    toast(audio.muted ? t('Звук касаний выключен') : t('Звук касаний включён'));
  });

  initPalette();

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
  btn.setAttribute('aria-label', recording ? t('Остановить запись') : t('Записать видео'));
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
    if (!blob || !blob.size) { toast(t('Не получилось записать. Попробуй ещё раз')); return; }
    showVideo(blob);
    return;
  }
  try {
    recorder.start();
  } catch (e) {
    console.error(e);
    toast(t('Запись не поддерживается в этом браузере'));
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
  api.event('record', currentId);
  toast(result === 'shared' ? t('Готово') : t('Видео скачано'));
}

export function enterPlay(id) {
  const found = findGame(id);
  if (!found) { go('games'); return; }
  if (api.isDisabled(id)) { toast(t('Игра временно недоступна')); go('games'); return; }
  api.event('play_start', id);
  playStart = performance.now();
  lastScore = -1;
  store.set('lastGame', id); // экран «Трек» предложит эту игру
  audio.setTrackMix(1);
  const game = found.create();
  runner.setGame(game);
  currentId = id;
  setupPaletteFor(game);
  setupRingCount(game);
  // Некоторые игры рисуют счёт сами (например, «Туннель» — число в центре)
  $('#game-score').hidden = !!game.hideScore;
  runner.resize();
  runner.start();
  const hint = $('#game-hint');
  hint.textContent = found.meta.hint || t('Касайся экрана');
  hint.classList.remove('is-hidden');
  setTimeout(() => hint.classList.add('is-hidden'), 3500);
  runner.trackStarted = false;
  if (track.loaded && audio.ctx) { runner.trackStarted = true; track.play()?.catch?.(() => { runner.trackStarted = false; }); }
}

function flushPlay() {
  if (playStart && currentId) api.event('play_end', currentId, performance.now() - playStart);
  playStart = 0;
}

// Свернули игру или закрыли Telegram — сохраняем время игры
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushPlay();
  else if (currentId && $('#app').dataset.route === 'play') playStart = performance.now();
});

export async function leavePlay() {
  flushPlay();
  audio.setTrackMix(1); // игра могла приглушить трек — возвращаем громкость
  if (recorder && recorder.active) await recorder.stop();
  clearInterval(recTimer);
  $('#rec-time').hidden = true;
  setRecButton(false);
  stopping = false;
  closeVideo();
  closePalette();
  runner.stop();
  runner.setGame(null);
  track.pause();
}

// ===== Цвета колец =====

const customColors = () => ({ from: store.data.paletteFrom, to: store.data.paletteTo });

function applyPalette() {
  const g = runner.game;
  if (g && g.setPalette) g.setPalette(store.data.palette, customColors());
}

function renderSwatches() {
  const current = store.data.palette;
  $('#palette-grid').replaceChildren(...PALETTE_KEYS.map((key) => el('button', {
    class: 'swatch', type: 'button', 'aria-pressed': String(key === current),
    onclick: () => {
      store.set('palette', key);
      applyPalette();
      renderSwatches();
    },
  }, el('span', { class: 'swatch__bar', style: `background:${paletteCss(key, customColors())}`, 'aria-hidden': 'true' }), PALETTES[key].name)));
  $('#palette-custom').hidden = current !== 'custom';
}

function initPalette() {
  const from = $('#palette-from');
  const to = $('#palette-to');
  from.value = store.data.paletteFrom;
  to.value = store.data.paletteTo;
  const onColor = () => {
    store.data.paletteFrom = from.value;
    store.data.paletteTo = to.value;
    store.save();
    applyPalette();
    renderSwatches();
  };
  from.addEventListener('input', onColor);
  to.addEventListener('input', onColor);

  $('#game-palette').addEventListener('click', () => {
    if ($('#palette-sheet').hidden) openPalette(); else closePalette();
  });
  $('#palette-done').addEventListener('click', closePalette);

  // Своё число колец: только цифры, больше максимума набрать нельзя.
  // Применяем по Enter / «Готово» на клавиатуре или когда поле теряет фокус.
  const input = $('#ring-count-input');
  // Буквы и любые символы кроме цифр не попадают в поле вообще — ни с клавиатуры, ни вставкой
  input.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });
  input.addEventListener('beforeinput', (e) => {
    if (e.data && /\D/.test(e.data)) {
      e.preventDefault();
      // Вставили «abc45» — оставляем только цифры
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
    if (v && Number(v) > max) {
      v = String(max);
      showLimit(t('Максимум {max}', { max }));
    }
    if (input.value !== v) input.value = v;
  });
  const applyInput = () => {
    const min = Number(input.dataset.min);
    const n = parseInt(input.value, 10);
    if (!Number.isFinite(n)) { renderRingCount(); return; }
    if (n < min) showLimit(t('Минимум {min}', { min }));
    setRingCount(n);
  };
  input.addEventListener('change', applyInput);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
}

// ===== Количество колец =====

function setRingCount(n) {
  const g = runner.game;
  if (!g || !g.setRingCount) return;
  g.setRingCount(n);
  const value = g.ringOptions().value; // игра сама ограничит число допустимыми границами
  store.data.ringCounts = { ...store.data.ringCounts, [currentId]: value };
  store.save();
  renderRingCount();
}

function renderRingCount() {
  const g = runner.game;
  if (!g || !g.ringOptions) return;
  const o = g.ringOptions();
  $('#ring-presets').replaceChildren(...o.presets.map((n) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(n === o.value),
    onclick: () => setRingCount(n),
  }, String(n))));
  const input = $('#ring-count-input');
  input.dataset.min = o.min;
  input.dataset.max = o.max;
  input.maxLength = String(o.max).length;
  input.value = o.value;
  if (!limitTimer) $('#ring-count-hint').textContent = t('Своё число — от {min} до {max}', { min: o.min, max: o.max });
}

let limitTimer = 0;
/** Подсветить поле и подсказку красным на пару секунд. */
function showLimit(text) {
  const input = $('#ring-count-input');
  const hint = $('#ring-count-hint');
  hint.textContent = text;
  input.classList.add('is-limit');
  hint.classList.add('is-limit');
  clearTimeout(limitTimer);
  limitTimer = setTimeout(() => {
    limitTimer = 0;
    input.classList.remove('is-limit');
    hint.classList.remove('is-limit');
    renderRingCount();
  }, 1800);
}

/** Блок «Сколько колец» есть только у игр, которые это умеют (Вихрь, Туннель). */
function setupRingCount(game) {
  const supported = typeof game.setRingCount === 'function';
  $('#ring-count-section').hidden = !supported;
  if (!supported) return;
  const saved = store.data.ringCounts[currentId];
  if (saved) game.setRingCount(saved);
  renderRingCount();
}

function openPalette() {
  renderSwatches();
  renderRingCount();
  $('#palette-sheet').hidden = false;
  $('#game-hint').classList.add('is-hidden');
  $('#game-palette').setAttribute('aria-expanded', 'true');
  $('#rec-btn').hidden = true;
}

function closePalette() {
  $('#palette-sheet').hidden = true;
  $('#game-palette').setAttribute('aria-expanded', 'false');
  if (canRecord()) $('#rec-btn').hidden = false;
}

/** Кнопка цветов видна только в играх, которые умеют менять палитру. */
function setupPaletteFor(game) {
  const supported = typeof game.setPalette === 'function';
  $('#game-palette').hidden = !supported;
  closePalette();
  if (supported) applyPalette();
}
