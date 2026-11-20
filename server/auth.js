// Проверка подписи Telegram (initData). Без неё любой мог бы выдать себя за админа.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SEC = 48 * 3600;

/** Вернуть { id, first_name, username } или null, если подпись неверна или устарела. */
export function verifyInitData(initData, botToken, now = Date.now()) {
  if (!initData || typeof initData !== 'string' || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');

  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const u = JSON.parse(params.get('user') || 'null');
    if (!u || !Number.isSafeInteger(u.id)) return null;
    return { id: u.id, first_name: String(u.first_name || '').slice(0, 64), username: u.username ? String(u.username).slice(0, 64) : null };
  } catch { return null; }
}
