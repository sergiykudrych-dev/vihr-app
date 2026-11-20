// Экран «Игры»: игра дня, категории, сетка карточек.

import { $, el, pressGroup } from './dom.js';
import { GAMES, CATEGORIES, CUSTOM_META } from '../games/registry.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';

let category = 'all';

function allGames() {
  const mine = store.data.customGames.map((g) => ({
    id: 'custom-' + g.id, title: g.name, sub: 'Своя игра', ...CUSTOM_META,
  }));
  return [...GAMES, ...mine].filter((g) => !api.isDisabled(g.id));
}

function renderGrid() {
  const list = allGames().filter((g) => category === 'all' || g.tag === category);
  const grid = $('#games-grid');
  if (!list.length) {
    grid.replaceChildren(el('a', { class: 'game-card', href: '#builder' },
      el('div', { class: 'game-card__thumb' }, el('img', { src: CUSTOM_META.thumb, alt: '' })),
      el('div', { class: 'game-card__title' }, 'Создать игру'),
      el('div', { class: 'game-card__sub' }, 'Собери свою в конструкторе')));
    return;
  }
  grid.replaceChildren(...list.map((g) => el('a', { class: 'game-card', href: `#play-${g.id}` },
    el('div', { class: 'game-card__thumb' }, el('img', { src: g.thumb, alt: '', loading: 'lazy' })),
    el('div', { class: 'game-card__title' }, g.title),
    el('div', { class: 'game-card__sub' }, g.sub))));
}

function renderHero() {
  // Игра дня меняется каждый день
  const day = Math.floor(Date.now() / 86400000);
  const open = GAMES.filter((x) => !api.isDisabled(x.id));
  const g = open.length ? open[day % open.length] : GAMES[0];
  $('#hero-title').textContent = g.title;
  $('#hero-sub').textContent = g.sub;
  $('#hero-art').src = g.thumb;
  $('#hero-play').href = `#play-${g.id}`;
}

export function initGames() {
  pressGroup($('#categories'), CATEGORIES.map((c) => [c.id, c.name]), category, (id) => { category = id; renderGrid(); }, 'chip');
  renderHero();
  api.onChange(() => { renderHero(); renderGrid(); });
}

export function enterGames() {
  renderGrid();
}
