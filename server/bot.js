// Telegram-бот на long polling: /start открывает игру, /stats показывает цифры админу.

import { stats } from './db.js';

export function startBot({ token, webAppUrl, adminIds }) {
  if (!token) { console.log('BOT_TOKEN не задан — бот выключен'); return; }
  const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
  }).then((r) => r.json());

  const send = (chat_id, text, extra = {}) => api('sendMessage', { chat_id, text, ...extra });

  async function handle(msg) {
    const chat = msg.chat.id;
    const text = (msg.text || '').trim();
    if (text.startsWith('/start')) {
      const markup = webAppUrl
        ? { reply_markup: { inline_keyboard: [[{ text: '🌀 Play', web_app: { url: webAppUrl } }]] } }
        : {};
      await send(chat, 'Spinly Game is a collection of neon physics games that are oddly satisfying to watch and play. Tap Play to start.', markup);
    } else if (text.startsWith('/stats') && adminIds.includes(msg.from.id)) {
      const s = await stats();
      const top = s.top_games.slice(0, 5).map((g) => `• ${g.game}: ${g.plays}`).join('\n') || '—';
      await send(chat,
        `📊 Статистика\nИгроков всего: ${s.players} (сегодня новых: ${s.new_today})\n` +
        `Активных: сегодня ${s.dau}, за 7 дней ${s.wau}, за 30 дней ${s.mau}\n` +
        `Среднее время игры: ${s.avg_sec} с\nВидео за 7 дней: ${s.videos_7d}\n\nТоп игр за 7 дней:\n${top}`);
    }
  }

  (async () => {
    // long polling не работает вместе с вебхуком; пробуем, пока Telegram не ответит
    for (;;) {
      try { await api('deleteWebhook'); break; } catch (e) { console.error('deleteWebhook', e.message); await new Promise((s) => setTimeout(s, 5000)); }
    }
    let offset = 0;
    for (;;) {
      try {
        const r = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
        if (!r.ok) { await new Promise((s) => setTimeout(s, 5000)); continue; }
        for (const u of r.result) {
          offset = u.update_id + 1;
          if (u.message) handle(u.message).catch((e) => console.error('bot', e.message));
        }
      } catch (e) {
        console.error('polling', e.message);
        await new Promise((s) => setTimeout(s, 5000));
      }
    }
  })();
  console.log('Бот запущен');
}
