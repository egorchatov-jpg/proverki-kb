# Локальная разработка

Код — из ветки **`master`** (тот же, что у пользователей).  
Данные локально — из **`proverki-kb-data-dev`**, чтобы не трогать боевую Excel.

| | Код | Excel / настройки |
|---|-----|-------------------|
| **localhost:3000** | `master` на диске | `proverki-kb-data-dev` |
| **kbcheck.webtm.ru** | деплой из `master` | `proverki-kb-data` |

Push в `master` на GitHub **не обновляет** production, пока вы не задеплоите в Timeweb вручную.

## Быстрый старт

```powershell
git checkout master
npm install
npm run setup:dev-data   # один раз: репо proverki-kb-data-dev + .env.local
npm start
```

Откройте http://localhost:3000.

## .env.local

Создаётся скриптом `setup:dev-data` или из `env.local.example`:

- `GITHUB_DATA_REPO=proverki-kb-data-dev`
- `ENABLE_BACKUP_CRON=0`

Секреты (`GITHUB_TOKEN`, VAPID) — из `.env.prod`.

## Перед деплоем для пользователей

1. Проверить доработки на localhost.
2. Закоммитить и `git push origin master`.
3. Ручной деплой в Timeweb (см. [release-workflow.md](./release-workflow.md)).

## Кэш PWA локально

Старая версия UI — DevTools → Application → Unregister service worker, Clear site data, или incognito.

## Повторная инициализация тестовой базы

```powershell
node scripts/setup-dev-data-repo.js --force
```
