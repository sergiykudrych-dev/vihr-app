// Telegram-бот на long polling: /start открывает игру, /stats показывает цифры админу,
// /pack продаёт пак видео за Telegram Stars.

import * as realDb from './db.js';

const PACK_ITEM = 'pack50';
const PACK_PAYLOAD = 'pack50-v1';

export function startBot({ token, webAppUrl, adminIds, db = realDb, fetchFn = fetch, poll = true }) {
  if (!token) { console.log('BOT_TOKEN не задан — бот выключен'); return; }
  const api = (method, body) => fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
  }).then((r) => r.json());

  const send = (chat_id, text, extra = {}) => api('sendMessage', { chat_id, text, ...extra }).then((r) => { if (!r.ok) console.error('sendMessage', r.description); return r; });

  const STATS_BTN = '📊 Статистика';
  const isRu = (u) => /^(ru|uk|be|kk)/.test((u && u.language_code) || '');
  const T = (u, ru, en) => (isRu(u) ? ru : en);
  const packBtn = (u) => ({ text: T(u, '🎁 Пак: 50 видео', '🎁 Pack: 50 videos'), callback_data: 'pack' });

  // Кнопки под приветствием: игра и пак
  const startKeyboard = (u) => ({ reply_markup: { inline_keyboard: [
    ...(webAppUrl ? [[{ text: '🌀 Play', web_app: { url: webAppUrl } }]] : []),
    [packBtn(u)],
  ] } });
  // Кнопка статистики внизу чата — только у админа
  const adminKeyboard = { reply_markup: { keyboard: [[{ text: STATS_BTN }]], resize_keyboard: true, is_persistent: true } };

  async function sendStats(chat) {
    const s = await db.stats();
    let sales = { total: 0, stars: 0, today: 0 };
    try { sales = await db.salesStats(); } catch (e) { /* нет таблицы — старая база */ }
    const top = s.top_games.slice(0, 5).map((g) => `• ${g.game}: ${g.plays}`).join('\n') || '—';
    await send(chat,
      `📊 Статистика\nИгроков всего: ${s.players} (сегодня новых: ${s.new_today})\n` +
      `Активных: сегодня ${s.dau}, за 7 дней ${s.wau}, за 30 дней ${s.mau}\n` +
      `Среднее время игры: ${s.avg_sec} с\nВидео за 7 дней: ${s.videos_7d}\n` +
      `Показов рекламы: сегодня ${s.ads_today}, за 7 дней ${s.ads_7d}\n` +
      `Продаж пака: ${sales.total} (сегодня ${sales.today}), звёзд: ${sales.stars} ⭐\n\nТоп игр за 7 дней:\n${top}`,
      adminKeyboard);
  }

  // Счёт на оплату пака в звёздах
  async function sendPackOffer(chat, user) {
    const pack = await db.packSettings();
    if (!pack.fileId) { await send(chat, T(user, 'Пак скоро появится 🙌', 'The pack is coming soon 🙌')); return; }
    if (await db.hasBought(user.id, PACK_ITEM)) { await sendPackFile(chat, user, true); return; }
    const r = await api('sendInvoice', {
      chat_id: chat,
      title: T(user, 'Пак «50 залипашек»', 'Pack “50 satisfying videos”'),
      description: T(user,
        '50 вертикальных видео из игр Вихря, 1080×1920, по 12 секунд, без кнопок и надписей. Для нарезок в TikTok, Reels и Shorts.',
        '50 vertical clips from Spinly games, 1080×1920, 12 s each, no buttons or text. Ready for TikTok, Reels and Shorts.'),
      payload: PACK_PAYLOAD,
      currency: 'XTR',
      prices: [{ label: T(user, 'Пак 50 видео', 'Pack of 50 videos'), amount: pack.price }],
    });
    if (!r.ok) console.error('sendInvoice', r.description);
  }

  async function sendPackFile(chat, user, again = false) {
    const pack = await db.packSettings();
    if (!pack.fileId) { await send(chat, T(user, 'Файл пака пока не загружен, напишите админу.', 'The pack file is not uploaded yet, please contact the admin.')); return; }
    const caption = again
      ? T(user, 'Вы уже купили пак — вот он снова 🎁', 'You already own the pack — here it is again 🎁')
      : T(user, 'Спасибо за покупку! Ваш пак 🎁\nЕсли файл потеряется, напишите /mypack.', 'Thanks for your purchase! Here is your pack 🎁\nIf you lose it, send /mypack.');
    const r = await api('sendDocument', { chat_id: chat, document: pack.fileId, caption });
    if (!r.ok) console.error('sendDocument', r.description);
  }

  async function handleMessage(msg) {
    const chat = msg.chat.id;
    const user = msg.from || {};
    const text = (msg.text || msg.caption || '').trim();
    const isAdmin = adminIds.includes(user.id);

    // Оплата прошла
    if (msg.successful_payment) {
      const p = msg.successful_payment;
      if (p.invoice_payload !== PACK_PAYLOAD || p.currency !== 'XTR') return;
      await db.addSale(p.telegram_payment_charge_id, user.id, PACK_ITEM, p.total_amount);
      await sendPackFile(chat, user);
      for (const a of adminIds) {
        send(a, `💰 Продажа пака: ${p.total_amount} ⭐ от ${user.username ? '@' + user.username : user.first_name || user.id}`).catch(() => {});
      }
      return;
    }

    // Админ загружает файл пака: документ с подписью /setpack
    if (isAdmin && msg.document && text.startsWith('/setpack')) {
      await db.setPack({ fileId: msg.document.file_id });
      await send(chat, `✅ Файл пака сохранён: ${msg.document.file_name || 'без имени'}`);
      return;
    }
    if (isAdmin && text.startsWith('/setpack')) {
      await send(chat, 'Чтобы загрузить пак: нажмите 📎 → «Файл» → выберите архив и в подписи к нему напишите /setpack. Отдельное сообщение /setpack без файла не сработает.');
      return;
    }
    if (isAdmin && text.startsWith('/setprice')) {
      const n = Number(text.split(/\s+/)[1]);
      if (!Number.isInteger(n) || n < 1 || n > 10000) { await send(chat, 'Формат: /setprice 50 (от 1 до 10000 звёзд)'); return; }
      const p = await db.setPack({ price: n });
      await send(chat, `✅ Цена пака: ${p.price} ⭐`);
      return;
    }

    if (text.startsWith('/start')) {
      if (text.split(/\s+/)[1] === 'pack') { await sendPackOffer(chat, user); return; }
      const welcome = 'Spinly Game is a collection of neon physics games that are oddly satisfying to watch and play. Tap Play to start.';
      await send(chat, welcome, startKeyboard(user));
      if (isAdmin) await send(chat, 'Админ-панель внизу 👇', adminKeyboard);
    } else if (text.startsWith('/pack')) {
      await sendPackOffer(chat, user);
    } else if (text.startsWith('/mypack')) {
      if (await db.hasBought(user.id, PACK_ITEM)) await sendPackFile(chat, user, true);
      else await send(chat, T(user, 'Покупок пока нет. Купить пак: /pack', 'No purchases yet. Get the pack: /pack'));
    } else if (text.startsWith('/paysupport')) {
      await send(chat, T(user, 'По вопросам оплаты напишите сюда, ответим в течение дня.', 'For payment questions reply here, we answer within a day.'));
    } else if ((text.startsWith('/stats') || text === STATS_BTN) && isAdmin) {
      await sendStats(chat);
    }
  }

  async function handleUpdate(u) {
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      const pack = await db.packSettings();
      const good = q.invoice_payload === PACK_PAYLOAD && q.currency === 'XTR' && q.total_amount === pack.price && !!pack.fileId;
      await api('answerPreCheckoutQuery', good
        ? { pre_checkout_query_id: q.id, ok: true }
        : { pre_checkout_query_id: q.id, ok: false, error_message: 'Цена изменилась, откройте /pack ещё раз' });
      return;
    }
    if (u.callback_query) {
      const c = u.callback_query;
      await api('answerCallbackQuery', { callback_query_id: c.id });
      if (c.data === 'pack' && c.message) await sendPackOffer(c.message.chat.id, c.from);
      return;
    }
    if (u.message) await handleMessage(u.message);
  }

  if (!poll) return { handleUpdate };

  // Кнопка «Play» слева от поля ввода (меню бота) — у всех
  if (webAppUrl) api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Play', web_app: { url: webAppUrl } } }).catch(() => {});

  (async () => {
    // long polling не работает вместе с вебхуком; пробуем, пока Telegram не ответит
    for (;;) {
      try { await api('deleteWebhook'); break; } catch (e) { console.error('deleteWebhook', (e.message + (e.cause ? ' [' + (e.cause.code || e.cause.message) + ']' : ''))); await new Promise((s) => setTimeout(s, 5000)); }
    }
    let offset = 0;
    for (;;) {
      try {
        const r = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
        if (!r.ok) { await new Promise((s) => setTimeout(s, 5000)); continue; }
        for (const u of r.result) {
          offset = u.update_id + 1;
          handleUpdate(u).catch((e) => console.error('bot', (e.message + (e.cause ? ' [' + (e.cause.code || e.cause.message) + ']' : ''))));
        }
      } catch (e) {
        console.error('polling', (e.message + (e.cause ? ' [' + (e.cause.code || e.cause.message) + ']' : '')));
        await new Promise((s) => setTimeout(s, 5000));
      }
    }
  })();
  console.log('Бот запущен');
  return { handleUpdate };
}
