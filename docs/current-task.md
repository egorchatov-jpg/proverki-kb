# Текущая задача / Контекст сессии

> Файл обновляется в конце каждой рабочей сессии с AI.
> AI должен прочитать этот файл в начале работы, чтобы восстановить контекст.

---

## Последнее обновление
- **Дата:** 2026-08-13
- **Сессия:** desc label bright fix + cleanup scripts + check-prod-version.ps1
- **Версия кода:** pkb-v329
- **Статус:** всё закоммичено в master

## Что сделано
1. **Cleanup скриптов:** удалены 4 устаревших одноразовых скрипта (`_bump-build.js`, `_patch-desc-overlay-guard.js`, `_test-v323-settings-concurrency.js`, `_test-v324-settings.js`).
2. **Новый `scripts/check-prod-version.ps1`:** сверка локальных версий с production.
3. **Интерактивное подтверждение в `create-timeweb-env-file.js`:** защита от случайной перегенерации VAPID-ключей.
4. **pkb-v329 — яркая надпись "Описание нарушений":**
   - В окне изменения проведённой проверки с заполненным чек-листом label "Описание нарушений" больше не тускнеет (opacity 0.35).
   - Cell (содержимое) остаётся заблокированным (нет onclick, тусклый), так как desc формируется из чек-листа.
   - Изменены `lockDescCell()` / `unlockDescCell()` — теперь управляют только cell, label управляется отдельно.
   - `APP_VERSION` поднята до `1.04`.

## Что НЕ сделано / следующие шаги
- [ ] Деплой на Timeweb (если готовы выкатывать для пользователей).
- [ ] Обсудить следующую фичу/доработку.

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
