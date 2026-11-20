// Экран «Конструктор»: собери свою игру — арена, шарики, правила «когда → тогда».

import { $, el, pressGroup, bindSlider, toast } from './dom.js';
import { Runner } from '../core/runner.js';
import { CustomGame, DEFAULT_CONFIG, RULE_ACTIONS } from '../games/custom.js';
import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { t } from '../i18n/index.js';

const ARENAS = [['circle', t('Круг')], ['triangle', t('Треугольник')], ['square', t('Квадрат')], ['hexagon', t('Шестиугольник')]];

let cfg = structuredClone(DEFAULT_CONFIG);
let runner = null;
let rebuildTimer = 0;

function rebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => runner.setGame(new CustomGame({ config: cfg })), 60);
}

function renderRule(key) {
  const box = $(`#r-${key}`);
  box.replaceChildren(...Object.entries(RULE_ACTIONS[key]).map(([id, label]) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(cfg[key].includes(id)),
    onclick: (e) => {
      cfg[key] = cfg[key].includes(id) ? cfg[key].filter((x) => x !== id) : [...cfg[key], id];
      e.currentTarget.setAttribute('aria-pressed', String(cfg[key].includes(id)));
      rebuild();
    },
  }, label)));
}

function bindAll() {
  $('#b-name').value = cfg.name;
  pressGroup($('#b-arena'), ARENAS, cfg.arena, (id) => { cfg.arena = id; rebuild(); });
  $('#b-gap').setAttribute('aria-checked', String(cfg.gap));
  const sliders = [
    ['spin', (v) => v / 10, (c) => Math.round(c * 10), (v) => (v / 10).toFixed(1)],
    ['balls', (v) => v, (c) => c, (v) => String(v)],
    ['size', (v) => v, (c) => c, (v) => String(v)],
    ['gravity', (v) => v, (c) => c, (v) => (v === 0 ? t('нет') : String(v))],
    ['bounce', (v) => v / 100, (c) => Math.round(c * 100), (v) => `${v}%`],
  ];
  for (const [key, toCfg, fromCfg, fmt] of sliders) {
    const input = $(`#b-${key}`);
    input.value = fromCfg(cfg[key]);
    $(`#b-${key}-out`).textContent = fmt(Number(input.value));
  }
  renderRule('ballBall');
  renderRule('ballWall');
  return sliders;
}

export function initBuilder() {
  runner = new Runner($('#builder-canvas'), { padding: 0.92 });

  const sliders = bindAll();
  for (const [key, toCfg, , fmt] of sliders) {
    const input = $(`#b-${key}`);
    input.addEventListener('input', () => {
      $(`#b-${key}-out`).textContent = fmt(Number(input.value));
      cfg[key] = toCfg(Number(input.value));
      rebuild();
    });
  }
  $('#b-name').addEventListener('input', (e) => { cfg.name = e.target.value; });
  $('#b-gap').addEventListener('click', (e) => {
    cfg.gap = !cfg.gap;
    e.currentTarget.setAttribute('aria-checked', String(cfg.gap));
    rebuild();
  });

  // Вкладки Арена / Шарики / Правила
  $('#builder-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#builder-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === b.dataset.panel));
  });

  $('#builder-save').addEventListener('click', () => {
    const name = (cfg.name || '').trim() || t('Моя игра');
    const game = { ...structuredClone(cfg), name, id: Date.now().toString(36) };
    store.data.customGames.push(game);
    store.save();
    toast(t('«{name}» сохранена', { name }));
    go(`play-custom-${game.id}`);
  });
}

export function enterBuilder() {
  runner.resize();
  runner.setGame(new CustomGame({ config: cfg }));
  runner.start();
}

export function leaveBuilder() {
  runner.stop();
}
