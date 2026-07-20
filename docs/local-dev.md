# Локальная разработка (безопасная тестовая база)

Production (`kbcheck.webtm.ru`) читает Excel из репозитория **`proverki-kb-data`**.  
Локально на `http://localhost:3000` нужно использовать отдельную базу **`proverki-kb-data-dev`**, чтобы тесты (удаление, purge, миграции) не затрагивали боевые данные.

## Быстрый старт

```bash
npm install
npm run setup:dev-data   # создаёт GitHub-репо и .env.local
npm start
```

Откройте http://localhost:3000 — приложение подключится к тестовой Excel.

## Что создаёт setup:dev-data

| Файл в proverki-kb-data-dev | Содержимое |
|-----------------------------|------------|
| `Проверки КБ 2026.xlsx` | Пустая таблица с актуальными заголовками |
| `settings.json` | Синтетические организации, методы, барьеры; PIN 3333/1111 |
| `checklists.json` | Пустой `{ "items": {} }` |
| `README.md` | Описание назначения репозитория |

Скрипт также пишет **`.env.local`**:

- `GITHUB_DATA_REPO=proverki-kb-data-dev`
- `ENABLE_BACKUP_CRON=0` (ночной бэкап не нужен локально)

Секреты (`GITHUB_TOKEN`, VAPID) берутся из `.env.prod`, если он есть.

## Переменные окружения

| Переменная | Production | Local dev |
|------------|------------|-----------|
| `GITHUB_DATA_REPO` | `proverki-kb-data` | `proverki-kb-data-dev` |
| `ENABLE_BACKUP_CRON` | `1` | `0` |

Шаблон: `env.local.example` → скопировать в `.env.local`.

## Повторная инициализация

Перезаписать файлы в dev-репо (осторожно — удалит тестовые записи в Excel):

```bash
node scripts/setup-dev-data-repo.js --force
```

## Кэш PWA локально

Если видите старую версию UI — в DevTools → Application: Unregister service worker, Clear site data, или incognito.

## Связь с release-workflow

Production деплоится вручную из `master` ([release-workflow.md](./release-workflow.md)).  
Ветка `develop` и localhost всегда могут указывать на `proverki-kb-data-dev`.
