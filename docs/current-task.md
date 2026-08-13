# Текущая задача / Контекст сессии

> Файл обновляется в конце каждой рабочей сессии с AI.
> AI должен прочитать этот файл в начале работы, чтобы восстановить контекст.

---

## Последнее обновление
- **Дата:** 2026-08-13
- **Сессия:** desc label bright fix + cleanup scripts + check-prod-version.ps1
- **Версия кода:** pkb-v330
- **Статус:** закоммичено в master

## Что сделано
1. **pkb-v330 — яркие labels + просроченные даты красным:**
   - Удалён CSS `.field-label.dimmed { opacity: 0.35; }` — теперь ВСЕ `.field-label` (надписи) в окнах внесения/изменения проверок остаются яркими всегда.
   - Убран `class="dimmed"` с `lbl-desc` в HTML.
   - Добавлена функция `formatCorrectiveDetail()` — в подробном окне проверки просроченные даты выполнения мероприятий (`Выполнить до: dd.mm.yyyy`) подсвечиваются красным (`<span class="overdue-date">`).
   - Добавлен CSS `.overdue-date { color: var(--red); }`.
   - `APP_VERSION` поднята до `1.05`, `APP_BUILD` → `pkb-v330`, кэш SW обновлён.
2. **Предыдущие изменения (pkb-v329):**
   - Cleanup скриптов, `check-prod-version.ps1`, интерактивное подтверждение VAPID.
   - Яркая надпись "Описание нарушений" в окне изменения (edit mode).

## Что НЕ сделано / следующие шаги
- [ ] Запустить сервер (`npm start`) и проверить визуально:
  - Окно внесения проверки — label "Описание нарушений" яркий, cell тусклый.
  - Окно изменения проверки — все labels яркие, cells тусклые где положено.
  - Подробное окно — просроченные даты в корректирующих мероприятиях красные.
- [ ] Закоммитить изменения.
- [ ] Деплой на Timeweb.

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
