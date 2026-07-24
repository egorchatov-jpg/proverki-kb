# Локальная разработка

Код — ветка **`master`**. Данные — **SQLite** (не Excel на GitHub).

| | Код | База данных |
|---|-----|----------------|
| **localhost:3000** | `master` на диске | `data/proverki-dev.db` |
| **kbcheck.webtm.ru** | деплой из `master` | `DATABASE_PATH` на Timeweb (persistent disk) |

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

## Перед деплоем на Timeweb

1. Протестировать на localhost.
2. На сервере один раз: `npm run migrate:from-github` (или скопировать готовый `.db`).
3. Указать `DATABASE_PATH` и `BACKUPS_DIR` на **постоянный диск** Timeweb.
4. Push + ручной деплoy (см. [release-workflow.md](./release-workflow.md)).

## Кэш PWA

DevTools → Application → Clear site data после смены версии.
