# Текущая задача / Контекст сессии

> Файл обновляется в конце каждой рабочей сессии с AI.
> AI должен прочитать этот файл в начале работы, чтобы восстановить контекст.

---

## Последнее обновление
- **Дата:** 2026-08-13
- **Сессия:** cleanup scripts + check-prod-version.ps1
- **Версия кода:** pkb-v328
- **Статус:** незакоммиченные изменения в рабочей директории

## Что сделано
1. Удалены 4 устаревших одноразовых скрипта:
   - `scripts/_bump-build.js`
   - `scripts/_patch-desc-overlay-guard.js`
   - `scripts/_test-v323-settings-concurrency.js`
   - `scripts/_test-v324-settings.js`
2. Доработан `scripts/create-timeweb-env-file.js`:
   - Добавлено интерактивное подтверждение перед генерацией новых VAPID-ключей (защита от случайного сброса push-подписок на проде).
3. Создан `scripts/check-prod-version.ps1`:
   - Сверка локальных версий (package.json, manifest.json, git HEAD) с production (`proverkikb.tw1.ru`).

## Что НЕ сделано / следующие шаги
- [ ] Закоммитить текущие изменения (cleanup скриптов + новые файлы).
- [ ] Обсудить с пользователем следующую фичу или направление доработки.
- [ ] При необходимости — бамп версии (`APP_BUILD` / `APP_VERSION` / `sw.js`) и деплой.

## Полезные ссылки
- Production: https://proverkikb.tw1.ru/
- База: SQLite + GitHub (`proverki-kb-data`)
- Деплой: ручной через Timeweb App Platform
- Локальный запуск: `npm start` → http://localhost:3000

## Архитектура (кратко)
- **Frontend:** `index.html` (SPA, vanilla JS), `sw.js` (PWA кэш)
- **Backend:** Node.js + Express, API в `api/`
- **База:** SQLite (`lib/db.js`)
- **Синхронизация:** GitHub (`lib/github-persist.js`)
- **Push-уведомления:** web-push, VAPID ключи в `index.html` + `.env`
