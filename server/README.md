# Сервер Вихря

Небольшой сервер на Node.js + Postgres. Он хранит статистику, выключает игры и отвечает в Telegram-боте.

## Запуск на Railway

1. Railway → New Project → Deploy from GitHub repo → выбрать `vihr-app`.
2. В настройках сервиса: Settings → Root Directory → `server`.
3. В проекте: New → Database → Add PostgreSQL.
4. В сервисе с кодом: Variables → добавить:
   - `BOT_TOKEN` — токен бота из BotFather (секрет)
   - `DATABASE_URL` — `${{Postgres.DATABASE_URL}}` (ссылка на базу)
   - `ADMIN_IDS` — `615166297` (Telegram ID админов через запятую)
   - `WEBAPP_URL` — `https://sergiykudrych-dev.github.io/vihr-app/`
5. Settings → Networking → Generate Domain. Адрес вида `https://xxx.up.railway.app` вписать в `src/config.js` (`API_URL`).

Проверка: открыть `https://xxx.up.railway.app/health` — должно быть `{"ok":true}`.

## Что умеет

| Адрес | Кто может | Что делает |
|---|---|---|
| `GET /health` | все | проверка, что сервер жив |
| `GET /api/config` | все | список выключенных игр |
| `POST /api/hello` | игрок Telegram | регистрирует игрока |
| `POST /api/event` | игрок Telegram | события статистики |
| `POST /api/admin/stats` | админ | статистика |
| `POST /api/admin/game` | админ | включить или выключить игру |

Каждый запрос подписан Telegram (`initData`). Сервер проверяет подпись токеном бота, поэтому подделать игрока или админа нельзя.

Бот: `/start` открывает игру, `/stats` (только админу) присылает цифры.

## Пак видео за звёзды

Бот продаёт пак «50 залипашек» за Telegram Stars (валюта `XTR`, провайдер не нужен).

- Покупатель: кнопка «🎁 Пак: 50 видео» под `/start`, команда `/pack` или ссылка `t.me/<бот>?start=pack`. После оплаты бот сразу присылает файл. Потерял — `/mypack`.
- Админ: отправить боту архив **документом** с подписью `/setpack` — бот запомнит файл (хранится в Telegram, размер до 2 ГБ). Цена: `/setprice 50`. Продажи видны в `/stats`, о каждой продаже приходит сообщение.
- Продажи пишутся в таблицу `sales`; повтор одного платежа не считается дважды.

Проверка без сети и базы: `node botpay.test.js`.

## Тест

```
DATABASE_URL=postgres://... node test.js
```
