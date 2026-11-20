// Экран «Звуки»: наборы, гамма, громкость.

import { $, el, icon, pressGroup, bindSlider } from './dom.js';
import { PACKS, PACK_KEYS } from '../audio/packs.js';
import { SCALES } from '../audio/scales.js';
import { audio } from '../audio/engine.js';
import { store } from '../core/store.js';
import { t } from '../i18n/index.js';

function renderPacks() {
  const box = $('#packs');
  box.replaceChildren(...PACK_KEYS.map((key) => {
    const p = PACKS[key];
    const selected = store.data.pack === key;
    const row = el('div', { class: selected ? 'row is-selected' : 'row' },
      el('span', { class: 'row__icon', style: `background:${p.color}` }, icon(p.icon)),
      el('button', {
        class: 'row__body', type: 'button', style: 'background:none;border:0;padding:0;text-align:left;min-height:44px',
        'aria-pressed': String(selected),
        onclick: () => { store.set('pack', key); audio.pack = key; audio.preview(key); renderPacks(); },
      },
        el('span', { class: 'row__title' }, p.name, selected ? el('span', { class: 'badge badge--accent' }, t('Выбрано')) : null),
        el('span', { class: 'row__sub', style: 'display:block' }, p.sub)),
      el('button', {
        class: 'icon-btn icon-btn--glass', type: 'button', 'aria-label': t('Прослушать: {name}', { name: p.name }),
        onclick: () => audio.preview(key),
      }, icon('i-play', 'icon icon--sm')));
    return row;
  }));
}

export function initSounds() {
  audio.pack = store.data.pack;
  audio.scale = store.data.scale;
  audio.setVolume(store.data.volume);

  renderPacks();
  pressGroup($('#scales'), Object.entries(SCALES).map(([k, s]) => [k, s.name]), store.data.scale, (k) => {
    store.set('scale', k);
    audio.scale = k;
    audio.preview(audio.pack);
  });
  bindSlider($('#volume'), $('#volume-out'), Math.round(store.data.volume * 100), (v) => `${v}%`, (v) => {
    store.set('volume', v / 100);
    audio.setVolume(v / 100);
  });
}
