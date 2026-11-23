// Postgres: таблицы, запросы статистики.

import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  // Railway по внутренней сети работает без SSL; внешний адрес — с SSL
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
});

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      tg_id BIGINT PRIMARY KEY,
      first_name TEXT, username TEXT,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      tg_id BIGINT NOT NULL,
      type TEXT NOT NULL,
      game TEXT,
      ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at);
    CREATE INDEX IF NOT EXISTS events_type_idx ON events (type, created_at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS sales (
      charge_id TEXT PRIMARY KEY,
      tg_id BIGINT NOT NULL,
      item TEXT NOT NULL,
      stars INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sales_user_idx ON sales (tg_id, item);
  `);
}

export async function upsertPlayer(u) {
  const r = await pool.query(
    `INSERT INTO players (tg_id, first_name, username) VALUES ($1,$2,$3)
     ON CONFLICT (tg_id) DO UPDATE SET last_seen = now(), first_name = $2, username = $3
     RETURNING (xmax = 0) AS is_new`,
    [u.id, u.first_name, u.username]);
  return r.rows[0].is_new;
}

export async function addEvent(tgId, type, game, ms) {
  await pool.query('INSERT INTO events (tg_id, type, game, ms) VALUES ($1,$2,$3,$4)', [tgId, type, game, ms]);
}

export async function disabledGames() {
  const r = await pool.query('SELECT id FROM games WHERE enabled = false ORDER BY id');
  return r.rows.map((x) => x.id);
}

export async function setGameEnabled(id, enabled) {
  await pool.query(
    `INSERT INTO games (id, enabled) VALUES ($1,$2)
     ON CONFLICT (id) DO UPDATE SET enabled = $2`, [id, enabled]);
}

// Настройки рекламы. Значения по умолчанию — щадящие: реклама не раньше 2 минут,
// не чаще раза в 3 игры и не чаще раза в 3 минуты.
export const AD_DEFAULTS = { enabled: true, every: 3, gapSec: 180, firstSec: 120 };
const AD_LIMITS = { every: [1, 50], gapSec: [0, 3600], firstSec: [0, 3600] };

export async function adSettings() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'ads'");
  return { ...AD_DEFAULTS, ...(r.rows[0]?.value || {}) };
}

/** Проверить и сохранить настройки рекламы. Вернуть сохранённое или null при ошибке. */
export async function setAdSettings(input) {
  const next = await adSettings();
  if ('enabled' in input) {
    if (typeof input.enabled !== 'boolean') return null;
    next.enabled = input.enabled;
  }
  for (const [k, [min, max]] of Object.entries(AD_LIMITS)) {
    if (!(k in input)) continue;
    const v = input[k];
    if (!Number.isInteger(v) || v < min || v > max) return null;
    next[k] = v;
  }
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('ads', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`, [JSON.stringify(next)]);
  return next;
}

export async function stats() {
  const one = async (sql) => (await pool.query(sql)).rows;
  const [[tot], [act], topGames, days, [avg], [rec]] = await Promise.all([
    one(`SELECT count(*)::int AS players,
                count(*) FILTER (WHERE first_seen >= date_trunc('day', now()))::int AS new_today
         FROM players`),
    one(`SELECT count(DISTINCT tg_id) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS dau,
                count(DISTINCT tg_id) FILTER (WHERE created_at >= now() - interval '7 days')::int AS wau,
                count(DISTINCT tg_id) FILTER (WHERE created_at >= now() - interval '30 days')::int AS mau
         FROM events`),
    one(`SELECT game, count(*)::int AS plays, count(DISTINCT tg_id)::int AS players
         FROM events WHERE type = 'play_start' AND created_at >= now() - interval '7 days' AND game IS NOT NULL
         GROUP BY game ORDER BY plays DESC LIMIT 20`),
    one(`SELECT to_char(d, 'DD.MM') AS day, coalesce(c, 0)::int AS users
         FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
         LEFT JOIN (SELECT date_trunc('day', created_at) AS day, count(DISTINCT tg_id) AS c
                    FROM events GROUP BY 1) e ON e.day = d
         ORDER BY d`),
    one(`SELECT coalesce(round(avg(ms) / 1000.0), 0)::int AS avg_sec
         FROM events WHERE type = 'play_end' AND ms > 0 AND created_at >= now() - interval '7 days'`),
    one(`SELECT count(*) FILTER (WHERE type = 'record')::int AS videos,
                count(*) FILTER (WHERE type = 'ad_view')::int AS ads,
                count(*) FILTER (WHERE type = 'ad_view' AND created_at >= date_trunc('day', now()))::int AS ads_today
         FROM events WHERE created_at >= now() - interval '7 days'`),
  ]);
  return { ...tot, ...act, avg_sec: avg.avg_sec, videos_7d: rec.videos, ads_7d: rec.ads, ads_today: rec.ads_today, top_games: topGames, days };
}

// Пак видео за Telegram Stars. Файл хранится в Telegram (file_id), сюда пишем только его id и цену.
export const PACK_DEFAULTS = { fileId: '', price: 50 };

export async function packSettings() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'pack'");
  return { ...PACK_DEFAULTS, ...(r.rows[0]?.value || {}) };
}

export async function setPack(patch) {
  const next = { ...(await packSettings()), ...patch };
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('pack', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`, [JSON.stringify(next)]);
  return next;
}

/** Записать оплату. Повтор того же charge_id не создаёт вторую продажу. */
export async function addSale(chargeId, tgId, item, stars) {
  await pool.query(
    `INSERT INTO sales (charge_id, tg_id, item, stars) VALUES ($1,$2,$3,$4)
     ON CONFLICT (charge_id) DO NOTHING`, [chargeId, tgId, item, stars]);
}

export async function hasBought(tgId, item) {
  const r = await pool.query('SELECT 1 FROM sales WHERE tg_id = $1 AND item = $2 LIMIT 1', [tgId, item]);
  return r.rowCount > 0;
}

export async function salesStats() {
  const r = await pool.query(
    `SELECT count(*)::int AS total, coalesce(sum(stars), 0)::int AS stars,
            count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today
     FROM sales`);
  return r.rows[0];
}
