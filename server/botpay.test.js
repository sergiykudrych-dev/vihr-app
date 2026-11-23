// Проверка оплаты пака без сети и базы: node botpay.test.js
import { startBot } from './bot.js';
let fails = 0; const ok = (n, c) => { console.log(c ? 'ok  ' : 'FAIL', n); if (!c) fails++; };
const calls = []; const fetchFn = async (url, o) => { calls.push({ m: url.split('/').pop(), b: JSON.parse(o.body) }); return { json: async () => ({ ok: true, result: [] }) }; };
const st = { pack: { fileId: '', price: 50 }, sales: [] };
const db = {
  packSettings: async () => ({ ...st.pack }), setPack: async (p) => (st.pack = { ...st.pack, ...p }),
  addSale: async (c, u, i, s) => { if (!st.sales.find((x) => x.c === c)) st.sales.push({ c, u, i, s }); },
  hasBought: async (u, i) => st.sales.some((x) => x.u === u && x.i === i),
  salesStats: async () => ({ total: st.sales.length, stars: st.sales.reduce((a, x) => a + x.s, 0), today: st.sales.length }),
  stats: async () => ({ players: 1, new_today: 0, dau: 1, wau: 1, mau: 1, avg_sec: 1, videos_7d: 0, ads_today: 0, ads_7d: 0, top_games: [] }),
};
const bot = startBot({ token: 'T', webAppUrl: 'https://x', adminIds: [1], db, fetchFn, poll: false });
const user = { id: 42, first_name: 'P', language_code: 'ru' };
const last = (m) => calls.filter((c) => c.m === m).pop();

await bot.handleUpdate({ message: { chat: { id: 42 }, from: user, text: '/pack' } });
ok('без файла: «скоро»', /скоро/.test(last('sendMessage').b.text));
await bot.handleUpdate({ message: { chat: { id: 42 }, from: user, text: '/setpack', document: { file_id: 'F' } } });
ok('не админ не может загрузить файл', st.pack.fileId === '');
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, caption: '/setpack', document: { file_id: 'FILE1', file_name: 'pack.zip' } } });
ok('админ загрузил файл', st.pack.fileId === 'FILE1');
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/setpack' } });
ok('/setpack без файла: подсказка', /zip/.test(last('sendMessage').b.text) && st.pack.fileId === 'FILE1');
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, document: { file_id: 'FILE2', file_name: 'spinly_pack_50.zip' } } });
ok('zip без подписи от админа сохранён', st.pack.fileId === 'FILE2');
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/setpack', reply_to_message: { document: { file_id: 'FILE3', file_name: 'x.rar' } } } });
ok('ответ /setpack на файл', st.pack.fileId === 'FILE3');
await bot.handleUpdate({ message: { chat: { id: 42 }, from: { id: 42 }, document: { file_id: 'EVIL', file_name: 'a.zip' } } });
ok('zip от обычного юзера игнор', st.pack.fileId === 'FILE3');
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, caption: '/setpack', document: { file_id: 'FILE1', file_name: 'pack.zip' } } });
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/setprice 75' } });
ok('админ поменял цену', st.pack.price === 75);
await bot.handleUpdate({ callback_query: { id: 'cb', data: 'pack', from: user, message: { chat: { id: 42 } } } });
const inv = last('sendInvoice');
ok('счёт в XTR на 75', inv && inv.b.currency === 'XTR' && inv.b.prices[0].amount === 75 && inv.b.payload === 'pack50-v1');
await bot.handleUpdate({ pre_checkout_query: { id: 'q1', from: user, currency: 'XTR', total_amount: 75, invoice_payload: 'pack50-v1' } });
ok('pre_checkout ok', last('answerPreCheckoutQuery').b.ok === true);
await bot.handleUpdate({ pre_checkout_query: { id: 'q2', from: user, currency: 'XTR', total_amount: 50, invoice_payload: 'pack50-v1' } });
ok('старая цена отклонена', last('answerPreCheckoutQuery').b.ok === false);
const pay = { message: { chat: { id: 42 }, from: user, successful_payment: { currency: 'XTR', total_amount: 75, invoice_payload: 'pack50-v1', telegram_payment_charge_id: 'ch1' } } };
await bot.handleUpdate(pay); await bot.handleUpdate(pay);
ok('файл отправлен покупателю', last('sendDocument').b.document === 'FILE1' && last('sendDocument').b.chat_id === 42);
ok('продажа записана один раз', st.sales.length === 1);
ok('админ получил уведомление', calls.some((c) => c.m === 'sendMessage' && c.b.chat_id === 1 && /Продажа пака: 75/.test(c.b.text)));
await bot.handleUpdate({ message: { chat: { id: 42 }, from: user, text: '/pack' } });
ok('повторный /pack — файл без нового счёта', last('sendDocument').b.caption.includes('уже купили'));
await bot.handleUpdate({ message: { chat: { id: 7 }, from: { id: 7, language_code: 'en' }, text: '/mypack' } });
ok('без покупки /mypack предлагает /pack', /\/pack/.test(last('sendMessage').b.text));
await bot.handleUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/stats' } });
ok('в статистике есть продажи', /Продаж пака: 1/.test(last('sendMessage').b.text));
await bot.handleUpdate({ message: { chat: { id: 9 }, from: { id: 9, language_code: 'ru' }, text: '/start' } });
ok('/start: кнопки Play и Пак', JSON.stringify(last('sendMessage').b.reply_markup).includes('callback_data":"pack'));
console.log(fails ? `\n${fails} FAIL` : '\nвсё ок'); process.exit(fails ? 1 : 0);
