// Связь игры с сервером: статистика, список выключенных игр, права админа.
// Если API_URL пуст или сервер недоступен, игра просто работает как раньше.

import { API_URL } from '../config.js';
import { inTelegram, tgInitData } from './telegram.js';

const CACHE_KEY = 'vihr:disabled';
const listeners = new Set();

function readCache() {
  try { return new Set(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')); } catch { return new Set(); }
}

let disabled = readCache();
let admin = false;
let ads = { enabled: false, every: 3, gapSec: 180, firstSec: 120 };

export const api = {
  get enabled() { return !!API_URL; },
  get isAdmin() { return admin; },
  /** Правила показа рекламы (с сервера). */
  get ads() { return ads; },
  isDisabled: (id) => disabled.has(id),
  /** Подписаться на изменение списка выключенных игр или прав. */
  onChange(fn) { listeners.add(fn); },

  /** Вызвать один раз при запуске: регистрирует игрока и получает список выключенных игр. */
  async hello() {
    if (!API_URL) return;
    try {
      const data = inTelegram ? await post('/api/hello', {}) : await (await fetch(API_URL + '/api/config')).json();
      apply(data);
    } catch { /* сервер недоступен — работаем с тем, что есть */ }
  },

  /** Отправить событие статистики. Ошибки молча игнорируем. */
  event(type, game, ms) {
    if (!API_URL || !inTelegram) return;
    post('/api/event', { type, game: normGame(game), ms: ms == null ? undefined : Math.round(ms) }).catch(() => {});
  },

  adminStats: () => post('/api/admin/stats', {}),
  async adminSetAds(next) {
    const data = await post('/api/admin/ads', { ads: next });
    apply(data);
    return data.ads;
  },
  async adminSetGame(id, enabled) {
    const data = await post('/api/admin/game', { id, enabled });
    apply(data);
    return data;
  },
};

function normGame(id) {
  if (!id) return undefined;
  return id.startsWith('custom-') ? 'custom' : id;
}

function apply(data) {
  if (Array.isArray(data.disabled)) {
    disabled = new Set(data.disabled);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data.disabled)); } catch { /* ignore */ }
  }
  if (typeof data.isAdmin === 'boolean') admin = data.isAdmin;
  if (data.ads && typeof data.ads === 'object') ads = { ...ads, ...data.ads };
  listeners.forEach((fn) => fn());
}

async function post(path, body) {
  const r = await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: tgInitData, ...body }),
    keepalive: true,
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
