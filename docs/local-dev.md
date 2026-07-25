# Локальная разработка

Код — ветка **`master`**. Данные — **SQLite** (не Excel на GitHub).

| | Код | База данных |
|---|-----|----------------|
| **localhost:3000** | `master` на диске | `data/proverki-dev.db` |
| **kbcheck.webtm.ru** | деплой из `master` | SQLite в `/tmp` + синхронизация с GitHub |

Excel пользователи получают **только через «Выгрузить проверки КБ»** — по годам, когда в базе есть записи за этот год.

## Быстрый старт

```powershell
git checkout master
npm install
npm run migrate:from-github-dev
npm start
```

Откройте http://localhost:3000.

## Обновить локальную базу из production (архив на GitHub)

```powershell
npm run sync:dev-from-prod
npm start
```

Скрипт читает Excel + settings + checklists с GitHub и пересобирает SQLite.

## Production: хранение данных на Timeweb

У Timeweb App Platform **нет постоянного диска** — при каждом деплое контейнер создаётся заново.

Решение в проекте:

- **`database/proverki.db`** и **`backups/`** в репозитории `proverki-kb-data` на GitHub;
- при старте сервер **скачивает** базу и бэкапы;
- после изменений — **загружает** обратно (с задержкой ~20 с для записей, сразу для бэкапов).

На Timeweb в `.env` должны быть:

```
ENABLE_GITHUB_PERSIST=1
GITHUB_TOKEN=...
GITHUB_DATA_REPO=proverki-kb-data
DATABASE_PATH=/tmp/proverki-kb/proverki.db
BACKUPS_DIR=/tmp/proverki-kb/backups
```

Сгенерировать файл для загрузки в панель: `node scripts/create-timeweb-env-file.js`

Проверка после деплоя: https://kbcheck.webtm.ru/health → `"githubPersist": true`.

## Кэш PWA

DevTools → Application → Clear site data после смены версии.
