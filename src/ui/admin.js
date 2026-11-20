// Экран «Админка»: статистика и выключатели игр. Открывается только у админа (проверяет сервер).

import { $, el, toast } from './dom.js';
import { GAMES } from '../games/registry.js';
import { api } from '../core/api.js';
import { go } from '../core/router.js';
import { t } from '../i18n/index.js';

const NAMES = Object.fromEntries(GAMES.map((g) => [g.id, g.title]));
let busy = false;

function card(value, label) {
  return el('div', { class: 'stat' }, el('div', { class: 'stat__value' }, String(value)), el('div', { class: 'stat__label' }, label));
}

function chart(days) {
  const max = Math.max(1, ...days.map((d) => d.users));
  return el('div', { class: 'bars', role: 'img', 'aria-label': t('Активные игроки по дням') },
    ...days.map((d) => el('div', { class: 'bars__col', title: `${d.day}: ${d.users}` },
      el('div', { class: 'bars__val' }, d.users ? String(d.users) : ''),
      el('div', { class: 'bars__bar', style: `height:${Math.max(3, Math.round((d.users / max) * 100))}%` }),
      el('div', { class: 'bars__day' }, d.day.slice(0, 2)))));
}

function gameRow(g) {
  const on = !api.isDisabled(g.id);
  const sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': g.title });
  sw.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    try { await api.adminSetGame(g.id, next); toast(next ? t('Игра включена') : t('Игра выключена')); }
    catch { sw.setAttribute('aria-checked', String(!next)); toast(t('Не получилось, попробуй ещё раз')); }
    busy = false;
  });
  return el('div', { class: 'toggle-row' }, el('div', { class: 'toggle-row__body' }, el('div', { class: 'toggle-row__title' }, g.title)), sw);
}

async function render() {
  const box = $('#admin-body');
  if (!api.isAdmin) { box.replaceChildren(el('p', { class: 'muted' }, t('Нет доступа. Админка открывается только внутри Telegram у администратора.'))); return; }
  box.replaceChildren(el('p', { class: 'muted' }, t('Загружаю…')));
  try {
    const s = await api.adminStats();
    const top = s.top_games.length
      ? s.top_games.map((g) => el('div', { class: 'toplist__row' },
        el('span', {}, NAMES[g.game] || g.game), el('span', { class: 'muted' }, t('{plays} запусков · {players} игроков', { plays: g.plays, players: g.players }))))
      : [el('p', { class: 'muted' }, t('Пока нет данных'))];
    box.replaceChildren(
      el('div', { class: 'stats' },
        card(s.players, t('игроков всего')), card(s.new_today, t('новых сегодня')),
        card(s.dau, t('активных сегодня')), card(s.wau, t('за 7 дней')),
        card(s.mau, t('за 30 дней')), card(t('{sec} с', { sec: s.avg_sec }), t('среднее время игры'))),
      el('h2', { class: 'admin-h' }, t('Активные игроки, 14 дней')), chart(s.days),
      el('h2', { class: 'admin-h' }, t('Популярные игры за 7 дней')), el('div', { class: 'toplist' }, ...top),
      el('p', { class: 'muted small' }, t('Видео записано за 7 дней: {n}', { n: s.videos_7d })),
      el('h2', { class: 'admin-h' }, t('Игры')),
      el('p', { class: 'muted small' }, t('Выключенная игра сразу пропадает у всех игроков.')),
      el('div', { class: 'card' }, ...GAMES.map(gameRow)),
      el('button', { class: 'btn btn--ghost btn--block', type: 'button', onclick: render }, t('Обновить')));
  } catch {
    box.replaceChildren(el('p', { class: 'muted' }, t('Сервер не отвечает.')),
      el('button', { class: 'btn btn--ghost', type: 'button', onclick: render }, t('Повторить')));
  }
}

export function initAdmin() {
  const link = $('#admin-link');
  const sync = () => { link.hidden = !api.isAdmin; };
  api.onChange(sync);
  sync();
  $('#admin-close').addEventListener('click', () => go('games'));
}

export function enterAdmin() { render(); }
