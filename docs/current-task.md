# Текущая задача / Контекст сессии

> Файл обновляется в конце каждой рабочей сессии с AI.
> AI должен прочитать этот файл в начале работы, чтобы восстановить контекст.

---

## Последнее обновление
- **Дата:** 2026-08-16
- **Сессия:** Push: периодическая проверка подписки раз в неделю (pkb-v336)
- **Версия кода:** pkb-v336 (последний закоммиченный в master — pkb-v331)
- **Статус:** НЕ закоммичено (правки в рабочей копии)

## Что сделано
1. **pkb-v336 — периодическая проверка push-подписки (раз в неделю):**
   - Добавлены константы `PUSH_SUB_CHECK_KEY` и `PUSH_SUB_CHECK_INTERVAL_MS` (7 дней) в `index.html`
   - Добавлена функция `checkPushSubscriptionWeekly(reg)`:
     - Проверяет время последней проверки в `localStorage`
     - Если прошла неделя — получает текущую подписку через `pushManager.getSubscription()`
     - Если подписки нет — вызывает `subscribeToPush(reg)` для пересоздания
     - Если подписка есть — переотправляет её на сервер через `sendSubscriptionToServer()`
     - Обновляет timestamp последней проверки
   - Функция вызывается:
     - После регистрации Service Worker (`registerSW()`)
     - При возврате приложения на передний план (`visibilitychange`)
   - `APP_BUILD` → `pkb-v336`, кэш SW → `pkb-static/api-v336`.
2. **pkb-v335 — нежирный красный "Просрочено":**
   - Убран `font-weight: 600` из CSS `.find-table td.corr-status-overdue` — теперь "Просрочено" в списке корректирующих мероприятий отображается красным, но не жирным.
   - `APP_BUILD` → `pkb-v335`, кэш SW → `pkb-static/api-v335`.
3. **pkb-v334 — нежирный красный "Нет":**
   - Убран `font-weight: 700` из CSS `.field-val-works-no` и `.detail-val-works-no`, а также из inline-стиля в JS (`setWorksCellDisplay`).
   - `APP_BUILD` → `pkb-v334`.
4. **pkb-v333 — push-уведомления + оверлей обновления + UI:**
   - **Обработка клика по push-уведомлению (`sw.js`):**
     - При клике SW отправляет `NOTIFICATION_CLICK` всем клиентам (вкладкам/PWA)
     - Если приложение открыто — получает сообщение, чистит API-кэш, загружает свежие данные и переходит на лобби
     - Если закрыто — открывается URL с `?nc=1`
   - **Обработка `?nc=1` в `index.html`:**
     - Удаляется сохранённый экран из `sessionStorage`
     - Переход на лобби (`goLobby()`)
     - Обновление списков (`refreshActiveRecordLists()`)
     - Параметр `nc=1` убирается из URL через `history.replaceState()`
   - **Убран `requireInteraction` из push-уведомлений** — теперь уведомления можно смахнуть, не требуют обязательного взаимодействия
   - **Исправлено повторное появление оверлея "Обновить приложение":**
     - Добавлен sessionStorage флаг `pkb-update-done` после применения обновления
     - `evaluateAppUpdate()` проверяет флаг и пропускает показ оверлея в той же сессии
   - `APP_VERSION` → `1.07`, `APP_BUILD` → `pkb-v333`, кэш SW → `pkb-static/api-v333`
5. **pkb-v332 — безопасные правки по аудиту (без изменения контрактов API):**
   - **Защита статики (`server.js`):** добавлен deny-list перед `express.static(ROOT)` — блокируются `*.env*`, `*.db/-wal/-shm`, `scripts/`, `docs/`, `node_modules/`, `data/backups|snapshots/` (HTTP 403). Публичные ассеты (иконки, манифест, паспорта, снипшоты) продолжают раздаваться.
   - **Удалены дефолтные PIN (1111/3333/2222):**
     - `lib/settings-store.js`: `EMPTY_SETTINGS.passwords` → `{admin:null, inspector:null, orgs:{}}`, `usedPasswords` → `[]`.
     - `index.html`: `getDefaultPasswords()` → `{admin:null, inspector:null, orgs:{}}`, `getDefaultUsedPasswords()` → `[2003]`, `ensureOrgPasswords`/`renderPasswordsScreen` больше не подставляют `2222`.
     - Из дефолтов остался только суперпользователь `2003`; вся остальная авторизация — из сохранённых паролей в «Управление паролями».
     - Защитые `isDefaultAdminPin`/`isDefaultInspectorPin` оставлены как «запрет слабых пин-кодов» при записи.
   - **`PUSH_MIN_RECORDS` (`lib/github-persist.js`):** порог минимального числа записей для пуша на GitHub настраивается через env (дефолт `50`), поведение по умолчанию не изменилось.
   - `APP_VERSION` → `1.06`, `APP_BUILD` → `pkb-v332`, кэш SW → `pkb-static/api-v332`.
6. **Предыдущие изменения (pkb-v331):** fix overdue-date highlighting for completed corrective measures.

## Что НЕ сделано / следующие шаги
- [ ] Закоммитить pkb-v332, pkb-v333, pkb-v334, pkb-v335, pkb-v336 в master.
- [ ] Деплой на Timeweb.
- [ ] (Отложено по решению) Серверная авторизация на мутирующие API, перенос суперпользователя на сервер, CORS-`*`, rate-limiting — меняют контракт клиента, риск поломок.

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
