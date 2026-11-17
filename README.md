# kotazname

Сайт-визитка [kot_az](https://github.com/kotazzz): ссылки на соцсети, блок «обо мне», проекты, музыкальный плеер, анонимные сообщения, сократитель ссылок, счётчик посетителей и админка с входом по passkey (без паролей). Фон — дитер из [React Bits](https://reactbits.dev/backgrounds/dither). Языки: русский и английский.

## Архитектура

- `src/` — фронтенд (React + Vite): главная `/`, QR на весь экран `/qr`, админка `/admin`.
- `server/` — бэкенд (Fastify, Node 24): API `/api/*`, статика из `dist`, короткие ссылки `/<slug>`.
  - `auth.js` — WebAuthn passkey (регистрация по одноразовому токену, сессии в sqlite);
  - `messages.js` — анонимные сообщения: PoW вместо капчи, файлы до 100 МБ, антиспам-лимиты;
  - `links.js`, `stats.js`, `about.js`, `projects.js` — сократитель, счётчик, «обо мне», проекты;
  - `integrations.js` — Steam presence и график GitHub (серверный кэш);
  - `music.js` — потоковая музыка со случайной выдачей.
- Данные (sqlite, загрузки, музыка) — в `data/`, в репозиторий не входят.

## Запуск

Нужен Node.js 24+.

```bash
npm install
npm run dev        # фронтенд на :5173 с прокси /api
node server/index.js  # бэкенд на :8787
```

Тесты: `npm test`. Сборка: `npm run build` (готовые файлы в `dist`).

## Продакшн

Docker (`Dockerfile`, `docker-compose.yml`): контейнер за Caddy, данные в `./data`.
Первичная настройка админки: токен из `ADMIN_SETUP_TOKEN` (или из логов контейнера)
на странице `/admin`, затем регистрация passkey. RP ID привязан к `kotaz.name`,
поэтому первый вход — только по HTTPS на основном домене.
