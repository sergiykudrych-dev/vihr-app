// Проверка сервера: node test.js (нужен DATABASE_URL тестовой базы)
import { createHmac } from 'node:crypto';
process.env.VIHR_NO_START = '1';
process.env.BOT_TOKEN = '123:TEST';
process.env.ADMIN_IDS = '615166297';
process.env.ALLOWED_ORIGIN = 'https://example.test';
const { createServer } = await import('./index.js');
const { migrate, pool } = await import('./db.js');

function sign(user, token = '123:TEST', age = 0) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - age), query_id: 'q', user: JSON.stringify(user) });
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}
let fails = 0;
const ok = (name, cond) => { console.log(cond ? 'ok  ' : 'FAIL', name); if (!cond) fails++; };

await migrate();
await pool.query('TRUNCATE players, events, games');
const srv = createServer().listen(0);
const base = `http://localhost:${srv.address().port}`;
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const admin = sign({ id: 615166297, first_name: 'A' });
const player = sign({ id: 42, first_name: 'P', username: 'p' });

let r = await post('/api/hello', { initData: player });
let j = await r.json();
ok('игрок: hello 200, не админ', r.status === 200 && j.isAdmin === false);
r = await post('/api/hello', { initData: admin });
ok('админ: isAdmin', (await r.json()).isAdmin === true);
r = await post('/api/hello', { initData: player.replace('hash=', 'hash=0') });
ok('битая подпись → 401', r.status === 401);
r = await post('/api/hello', { initData: sign({ id: 42, first_name: 'P' }, '999:OTHER') });
ok('чужой токен → 401', r.status === 401);
r = await post('/api/hello', { initData: sign({ id: 42, first_name: 'P' }, '123:TEST', 3 * 86400) });
ok('старая подпись → 401', r.status === 401);
r = await post('/api/hello', {});
ok('без initData → 401', r.status === 401);

r = await post('/api/event', { initData: player, type: 'play_start', game: 'vortex' });
ok('событие play_start', r.status === 200);
await post('/api/event', { initData: player, type: 'play_end', game: 'vortex', ms: 42000 });
await post('/api/event', { initData: player, type: 'record', game: 'vortex' });
r = await post('/api/event', { initData: player, type: 'hack', game: 'vortex' });
ok('неизвестный тип → 400', r.status === 400);

r = await post('/api/admin/stats', { initData: player });
ok('игрок не видит админку → 403', r.status === 403);
r = await post('/api/admin/game', { initData: player, id: 'vortex', enabled: false });
ok('игрок не выключит игру → 403', r.status === 403);
r = await post('/api/admin/stats', { initData: admin });
j = await r.json();
ok('админ видит статистику', r.status === 200 && j.players === 2 && j.avg_sec === 42 && j.top_games[0]?.game === 'vortex' && j.days.length === 14);
r = await post('/api/admin/game', { initData: admin, id: 'tunnel', enabled: false });
j = await r.json();
ok('админ выключает игру', j.disabled.length === 1 && j.disabled[0] === 'tunnel');
r = await fetch(base + '/api/config');
ok('публичный список выключенных', (await r.json()).disabled[0] === 'tunnel');
r = await post('/api/admin/game', { initData: admin, id: 'tunnel', enabled: true });
ok('админ включает обратно', (await r.json()).disabled.length === 0);
r = await post('/api/admin/game', { initData: admin, id: '../x', enabled: false });
ok('плохой id → 400', r.status === 400);

let last;
for (let i = 0; i < 125; i++) last = await post('/api/event', { initData: player, type: 'open' });
ok('лимит 120/мин → 429', last.status === 429);

srv.close(); await pool.end();
console.log(fails ? `\nПровалено: ${fails}` : '\nВсё прошло');
process.exit(fails ? 1 : 0);
