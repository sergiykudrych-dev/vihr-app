// Сервер Вихря. Запускается на Railway: node index.js
//
// Переменные окружения:
//   BOT_TOKEN       токен бота из BotFather (секрет, только в настройках Railway)
//   DATABASE_URL    адрес Postgres (Railway подставляет сам, если подключить базу)
//   ADMIN_IDS       Telegram ID админов через запятую, по умолчанию 615166297
//   WEBAPP_URL      адрес игры (кнопка «Играть» в боте)
//   ALLOWED_ORIGIN  откуда можно слать запросы, по умолчанию https://sergiykudrych-dev.github.io

import http from 'node:http';
import { verifyInitData } from './auth.js';
import { migrate, upsertPlayer, addEvent, disabledGames, setGameEnabled, stats } from './db.js';
import { startBot } from './bot.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_IDS = (process.env.ADMIN_IDS || '615166297').split(',').map((s) => Number(s.trim())).filter(Boolean);
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://sergiykudrych-dev.github.io/vihr-app/';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://sergiykudrych-dev.github.io';
const PORT = Number(process.env.PORT) || 3000;

const EVENT_TYPES = new Set(['open', 'play_start', 'play_end', 'record', 'track_load', 'ad_view']);
const GAME_ID = /^[a-z0-9-]{1,40}$/;

// Не больше 120 событий в минуту на игрока
const buckets = new Map();
function allowed(id) {
  const m = Math.floor(Date.now() / 60000);
  const b = buckets.get(id);
  if (!b || b.m !== m) { buckets.set(id, { m, n: 1 }); return true; }
  return ++b.n <= 120;
}
setInterval(() => buckets.clear(), 10 * 60000).unref();

function cors(res) {
  res.setHeader('access-control-allow-origin', ORIGIN);
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('vary', 'origin');
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 10_000) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });

      // Публично: какие игры выключены (чтобы скрыть их и в обычном браузере)
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return send(res, 200, { disabled: await disabledGames() });
      }
      if (req.method !== 'POST') return send(res, 404, { error: 'not_found' });

      const body = await readJson(req);
      const user = verifyInitData(body.initData, BOT_TOKEN);
      if (!user) return send(res, 401, { error: 'bad_init_data' });
      const isAdmin = ADMIN_IDS.includes(user.id);

      if (url.pathname === '/api/hello') {
        await upsertPlayer(user);
        await addEvent(user.id, 'open', null, null);
        return send(res, 200, { isAdmin, disabled: await disabledGames() });
      }

      if (url.pathname === '/api/event') {
        if (!allowed(user.id)) return send(res, 429, { error: 'slow_down' });
        if (!EVENT_TYPES.has(body.type)) return send(res, 400, { error: 'bad_type' });
        const game = typeof body.game === 'string' && GAME_ID.test(body.game) ? body.game : null;
        const ms = Number.isFinite(body.ms) ? Math.max(0, Math.min(Math.round(body.ms), 6 * 3600 * 1000)) : null;
        await addEvent(user.id, body.type, game, ms);
        return send(res, 200, { ok: true });
      }

      // Всё, что ниже, — только для админов
      if (!isAdmin) return send(res, 403, { error: 'forbidden' });

      if (url.pathname === '/api/admin/stats') {
        return send(res, 200, { ...(await stats()), disabled: await disabledGames() });
      }
      if (url.pathname === '/api/admin/game') {
        if (typeof body.id !== 'string' || !GAME_ID.test(body.id) || typeof body.enabled !== 'boolean') {
          return send(res, 400, { error: 'bad_request' });
        }
        await setGameEnabled(body.id, body.enabled);
        return send(res, 200, { disabled: await disabledGames() });
      }
      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error(e.message);
      return send(res, 500, { error: 'server' });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await migrate();
  createServer().listen(PORT, () => console.log(`Сервер на порту ${PORT}`));
  process.on('unhandledRejection', (e) => console.error('unhandled', e && e.message)); // бот не должен ронять сервер
  startBot({ token: BOT_TOKEN, webAppUrl: WEBAPP_URL, adminIds: ADMIN_IDS });
}
