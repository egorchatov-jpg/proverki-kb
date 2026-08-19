# Текущая задача / Контекст сессии

> Файл обновляется в конце каждой рабочей сессии с AI.
> AI должен прочитать этот файл в начале работы, чтобы восстановить контекст.

---

## Последнее обновление
- **Дата:** 2026-08-19
- **Сессия:** Исправление загрузки фото (pkb-v356)
- **Версия кода:** pkb-v356 (последний закоммиченный в master — pkb-v355, 02cc098)
- **Статус:** НЕ закоммичено (правки в рабочей копии)

## Что сделано
1. **pkb-v356 — исправление загрузки фото:**
   - **Причина ошибки «Not found»:** в `server.js` `/api/photos` монтировался через `app.all('/api/photos', ...)` — Express не передавал подпути (`/upload`, `/list`, `/delete`) в обработчик. Запросы на `/api/photos/upload` возвращали 404.
   - **Исправление `server.js`:** `/api/photos` убран из `API_ROUTES`, добавлен отдельный `app.use('/api/photos', photosHandler)` — теперь подпути корректно передаются в обработчик.
   - **Исправление `api/photos.js`:** регулярки изменены с `^\/api\/photos\/...` на `^\/...` (относительные пути), так как `app.use` убирает mount-префикс из `req.url`.
   - Проверено локально: тестовая загрузка фото возвращает `200 OK` и сохраняет файл.
   - `APP_BUILD` → `pkb-v356`, кэш SW → `pkb-static/api-v356`.
2. **pkb-v355 — единая ширина кнопок в оверлее успеха:**
   - `.success-btn-next` («Следующая проверка»): добавлена фиксированная ширина `calc((100% - 20px) / 3)` и `flex: none` — теперь совпадает с кнопкой «Выйти».
   - `.success-btns`: добавлено `justify-content: center` — обе кнопки выровнены по центру оверлея.
   - `APP_BUILD` → `pkb-v355`, кэш SW → `pkb-static/api-v355`.
2. **pkb-v354 — удаление дублей в паспорте ДТП и проверка всех паспортов:**
   - **Найдены и удалены дубли в `passports/dtp-01.json`:**
     - `ДТП.08.3.2. Сигнальщик не находится на траектории движения ТС/ спецтехники` — удалены 2 лишних дубля (было 3, остался 1).
     - `ДТП.06.2.1. Каждый факт превышения водителем скорости...` — удалён 1 лишний дубль (было 2, остался 1).
   - **Проверены все паспорта (`rv-01`, `elb-01`, `gruz-01`, `gaz-01`, `dtp-01`) на дубли вопросов чек-листов** — скриптом `node` проверен каждый JSON-паспорт, дубли найдены только в `dtp-01.json`.
   - `APP_BUILD` → `pkb-v354`, кэш SW → `pkb-static/api-v354`.
2. **pkb-v353 — локальное хранение фото до сохранения проверки:**
   - **Клиент:**
     - Фото прикрепляются до сохранения проверки — хранятся локально в `cardData._localPhotos` как `{ base64, violationIndex, tempId }`.
     - При открытии `screen-card-photo` показываются и локальные (`data:image/jpeg;base64`), и серверные (`/photos/`) фото.
     - При быстром тапе локальное фото открывается для просмотра через base64.
     - Удаление локального фото — мгновенно из `cardData._localPhotos` и DOM, без серверного запроса.
     - `cancelCard()` / `resetCard()` — очищают `cardData._localPhotos` автоматически (фото теряются при отмене).
   - **Сохранение:**
     - `submitCard()` — после получения `checkId` от сервера (в callback `syncToServer`) локальные фото загружаются на сервер через `uploadLocalPhotos()`.
     - `submitCardEdit()` — при редактировании существующей проверки локальные фото загружаются сразу (так как `checkId` уже есть).
     - После успешной загрузки `cardData._localPhotos` очищается.
     - `_localPhotos` исключается из `toSync` перед добавлением в очередь синхронизации (не попадает в localStorage).
   - `APP_BUILD` → `pkb-v353`, кэш SW → `pkb-static/api-v353`.
2. **pkb-v352 — единая ширина и центрирование кнопок в карточке проверки:**
   - `.card-btn-submit` («Готово»): добавлена фиксированная ширина `calc((100% - 20px) / 3)` и `flex: none` — теперь совпадает с кнопкой «Отмена».
   - `.card-bottom`: добавлено `justify-content: center` — обе кнопки выровнены по центру экрана.
   - `APP_BUILD` → `pkb-v352`, кэш SW → `pkb-static/api-v352`.
2. **pkb-v351 — загрузка фотографий нарушений:**
   - **Сервер:**
     - Новый API `api/photos.js`: endpoints `/api/photos/upload` (POST), `/api/photos/list/:checkId` (GET), `/api/photos/delete/:checkId/:filename` (DELETE).
     - Используется `sharp` для ресайза (max 640px по любой стороне, конвертация в JPEG, quality 85).
     - Файлы сохраняются в папку `photos/` рядом с базой данных (`data/photos` или `/tmp/proverki-kb/photos`).
     - Имя файла: `{checkId}_{index}_{дд.мм.гггг}.jpeg`.
     - Таблица `photos` в SQLite: `id`, `check_id`, `filename`, `violation_index`, `uploaded_at`.
     - `sharp` перенесён из `devDependencies` в `dependencies`.
     - Static serve для `/photos/*` добавлен в `server.js`.
   - **Клиент (`screen-card-photo`):**
     - Кнопка "Прикрепить" открывает `<input type="file" accept="image/*">`.
     - Фото конвертируется в base64 и отправляется на сервер.
     - Загруженные фото отображаются как миниатюры (ширина 1/4 экрана, `aspect-ratio: 1`, центрирование).
     - Миниатюры группируются над той кнопкой "Прикрепить", с которой были загружены (по `violation_index`).
     - Под каждой миниатюрой — порядковый номер фото.
     - **Long-tap** (500ms) — выделение миниатюры + появление красного круглого крестика в правом верхнем углу для удаления.
     - **Быстрый тап** — открытие полноэкранного просмотра (`overlay-photo-viewer`).
     - Фото можно удалить только после подтверждения (`confirm`).
   - `APP_BUILD` → `pkb-v351`, кэш SW → `pkb-static/api-v351`.
2. **pkb-v350 — ширина относительно видимого экрана + закругление фото-кнопок:**
   - **Ширина всех нижних кнопок (`Назад`/`Отмена`/`Выход`):**
     - `calc((100vw - 48px) / 3)` заменён на `calc((100% - 20px) / 3)` — теперь ширина отсчитывается от родительского контейнера (видимый экран приложения), а не от всего окна браузера.
     - На Windows (`is-win`) приложение центрировано (`left: 28.333%; right: 28.333%`), поэтому `100%` родителя = ширина центрального блока (~43vw), и кнопка занимает ровно 1/3 видимой области.
     - На мобильных поведение не изменилось: `(100% - 20px) / 3` ≈ `(100vw - 48px) / 3`.
     - Затронутые классы: `.screen-back-btn`, `.find-bottom-btn`, `.detail-back-btn`, `.card-btn-cancel`, `.corr-btn-cancel`, `.overlay-btn-cancel`, `.success-btn-exit`.
   - **Кнопки "Камера" и "Прикрепить" (`screen-card-photo`):**
     - `border-radius: 10px` → `border-radius: var(--btn-radius)` — теперь закругление совпадает со всеми остальными кнопками в приложении.
   - `APP_BUILD` → `pkb-v350`, кэш SW → `pkb-static/api-v350`.
2. **pkb-v349 — единая ширина нижних серых кнопок (без изменения высоты):**
   - **Исправление v348:**
     - `.menu-btn-cancel` (install-device, bpk-choice) и `.pin-back-btn` (PIN-экран) — **возвращены как были**: `padding: 13px 40px`, без фиксированной ширины. Высота кнопок ввода паролей восстановлена.
     - Остальные кнопки получили только ширину `calc((100vw - 48px) / 3)` без изменения высоты:
       - `.find-bottom-btn` (find, corrective-list, sokb-list) — `flex: 1` → фиксированная ширина, `height: 53px` сохранён.
       - `.detail-back-btn` (подробное окно) — `padding: 0 40px` → `width: ...; padding: 0`, `height: 53px` сохранён.
       - `.card-btn-cancel` (card, card-checklist) — добавлена ширина, высота из `.card-btn` = 53px сохранена.
       - `.corr-btn-cancel` (corrective-edit, sokb-edit) — `flex: 1` → фиксированная ширина, `height: 53px` сохранён.
       - `.overlay-btn-cancel` (все оверлеи) — добавлена ширина, высота из `.overlay-btn` = 53px сохранена.
       - `.success-btn-exit` (success-overlay) — добавлена ширина, высота из `.success-btn` = 53px сохранена.
       - `.screen-back-btn` — базовая ширина `calc((100vw - 48px) / 3)` без изменений, удалены переопределения v347.
   - **Лобби (`screen-proverki-menu`):**
     - Кнопка "Назад" вынесена в `.settings-footer` с классом `.screen-back-btn`.
   - `APP_BUILD` → `pkb-v349`, кэш SW → `pkb-static/api-v349`.
2. **pkb-v347 — унификация высоты и ширины кнопок:**
   - **Высота кнопок "Камера" и "Прикрепить" (`screen-card-photo`):**
     - CSS `.photo-action-btn`: добавлен `height: 53px`, вертикальный padding убран (`padding: 0 12px`) — высота совпадает с кнопкой "Назад" в этом же окне.
   - **Ширина кнопок "Назад" в `screen-find`, `screen-meropr-menu`, `screen-card-photo`:**
     - `#screen-find .find-btn-cancel`: убрана фиксированная ширина, добавлен `padding: 0 40px` — ширина совпадает с `.detail-back-btn` (подробное окно проверки).
     - `#screen-meropr-menu .screen-back-btn` и `#screen-card-photo .screen-back-btn`: `width: auto; padding: 0 40px` — аналогично кнопке "Назад" в детальном окне.
   - `APP_BUILD` → `pkb-v347`, кэш SW → `pkb-static/api-v347`.
2. **pkb-v346 — UI/UX доработки (синхронизация, карточки, оверлеи):**
   - **Лобби — только синхронизированные нарушения:**
     - `renderLobby`: фильтр `&& r.checkId` — в баннерах нарушений отображаются только записи с присвоенным номером проверки.
   - **Список проверок — индикатор несинхронизированной записи:**
     - `renderFindList`: для записей без `checkId` отображается красная иконка облака со стрелкой (Heroicons) в ячейке "Барьер".
   - **Единый вид информационных карточек:**
     - `openSokbEdit` и `openCorrectiveEdit`: блок информации о проверке теперь использует стили `.violation-card` (как в лобби), включая строку `checkId`, метод/барьер, организацию/объект.
     - Стили `.corr-viol-info` упрощены (`background: transparent`).
   - **Карточка проверки — placeholder объекта:**
     - `resetCard` и `openCardForEdit`: значение по умолчанию для объекта изменено с `—` на `Ввести` (логичнее для текстового ввода).
   - **Оверлей описания нарушения:**
     - `rows="7"` для textarea, placeholder убран (соответствует паттерну оверлеев с пустым полем).
   - `APP_BUILD` → `pkb-v346`, кэш SW → `pkb-static/api-v346`.
2. **pkb-v345 — единообразные кнопки "Назад" (как в screen-export):**
   - **screen-find (Проверки):**
     - Добавлен специфичный CSS `#screen-find .find-btn-cancel` — стиль полностью совпадает с `.screen-back-btn` (width: calc((100vw - 48px) / 3), height: 53px, background: var(--gray-btn), font-size: 15px, font-weight: 700, border-radius: var(--btn-radius)).
     - Кнопка остаётся в `.find-bottom` между счётчиками, но имеет фиксированную ширину и точный внешний вид эталонной кнопки.
   - **screen-meropr-menu (Мероприятия):**
     - HTML: кнопка "Назад" вынесена из `.proverki-menu-content` в отдельный `.settings-footer` внизу экрана.
     - Класс кнопки изменён на `.screen-back-btn` — полное совпадение с эталоном.
   - **screen-card-photo (Добавьте фотографии нарушений):**
     - HTML: `.card-bottom` заменён на `.settings-footer`, класс кнопки изменён на `.screen-back-btn`.
     - `.photo-scroll` уже имеет `flex: 1`, поэтому footer корректно прижимается к низу экрана.
   - `APP_BUILD` → `pkb-v345`, кэш SW → `pkb-static/api-v345`.
2. **pkb-v344 — placeholder и цвет текста в ячейках окна внесения проверки:**
   - **"Барьер работоспособен":**
     - HTML placeholder изменён с "Выбрать" на "—" (по умолчанию).
     - `setWorksCellDisplay` разделена логика: `!value` → "—", `'Выбрать'` → "Выбрать" (placeholder).
     - После выбора барьера без чек-листа `syncWorksCellState` вызывает `setWorksCellDisplay('Выбрать')` — кнопка активна для выбора.
   - **"Проверяемая организация" и "Проверяемый объект" — черный текст после ввода:**
     - `openDrumOrg`: теперь удаляет класс `.placeholder` у `val-org` после выбора организации.
     - `openTextOverlay` (`currentTextCallback`): теперь удаляет класс `.placeholder` при непустом значении, добавляет при пустом (исправлено для `val-obj` и других текстовых полей).
   - **"Описание нарушений" — черный текст после ручного ввода (без чек-листа):**
     - `applyDesc`: теперь удаляет класс `.placeholder` при непустом описании, добавляет при пустом.
   - `APP_BUILD` → `pkb-v344`, кэш SW → `pkb-static/api-v344`.
2. **pkb-v343 — кнопка "Добавить фото" и screen фотографий нарушений:**
   - **HTML:** добавлена кнопка `btn-card-photo` под ячейкой "Проверяемый барьер" (рядом с `btn-card-checklist`).
   - **CSS:** добавлены стили `.photo-scroll`, `.photo-body`, `.photo-violation-item`, `.photo-violation-text`, `.photo-btn-row`, `.photo-action-btn` (оранжевая кнопка с иконкой SVG), `.card-btn-gray` (серая капсульная кнопка "Назад").
   - **JS логика кнопки (`updateCardPhotoButton`):**
     - Барьер не выбран — кнопка скрыта.
     - Барьер имеет чек-лист, но он не заполнен — кнопка видима, но тусклая (`.disabled`, `opacity: 0.45`, `pointer-events: none`).
     - Барьер имеет чек-лист и он заполнен — кнопка активна.
     - Барьер не имеет чек-листа — кнопка активна (вместо "Заполнить чек-лист").
   - **Новый screen `screen-card-photo`:**
     - **Вариант 1 (без чек-листа):** заголовок "Добавьте фотографии нарушений", по центру кнопки "Камера" и "Прикрепить" с SVG-иконками (camera, paper-clip из Heroicons), серая капсульная кнопка "Назад".
     - **Вариант 2 (с чек-листом):** заголовок + список текстов нарушений из чек-листа. Под каждым нарушением — кнопки "Камера" и "Прикрепить". Серая кнопка "Назад" внизу.
     - Функции `openCardPhotoScreen()`, `closeCardPhotoScreen()`, `renderCardPhotoScreen()`, `renderCardPhotoSimple()`, `cardPhotoCamera()`, `cardPhotoAttach()`.
   - `screen-card-photo` добавлен в `PULL_OFF`.
   - `updateCardPhotoButton()` вызывается при открытии карточки, смене барьера, применении/отмене чек-листа.
   - `APP_BUILD` → `pkb-v343`, кэш SW → `pkb-static/api-v343`.
2. **pkb-v342 — синий контур полей ввода в оверлеях СОКБ/корректирующих мероприятий:**
   - В CSS добавлены специфичные правила для `#overlay-corr-desc .overlay-textarea` и `#overlay-corr-text .overlay-input`:
     - `border-color: var(--navy)` (вместо `var(--orange)`)
     - При фокусе тоже `border-color: var(--navy)`
   - `APP_BUILD` → `pkb-v342`, кэш SW → `pkb-static/api-v342`.
2. **pkb-v341 — UI-правки в окнах внесения оспаривания в СОКБ и корректирующих мероприятий:**
   - **П.1 — Видимые границы ячеек:**
     - Добавлен `-webkit-appearance: none; appearance: none;` в CSS `.corr-m-desc` и `.corr-m-input` — устраняет iOS-специфичное скрытие границ.
     - Inline textarea/input в `createSokbAttemptEl` и `createCorrMeasureEl` заменены на div'ы с классом `.corr-m-cell`, у которых граница `var(--navy)` видна всегда.
   - **П.2 — Заголовок мероприятия:**
     - В `createCorrMeasureEl` заголовок изменён с `Корректирующее мероприятие №N` на `Описание мероприятия №N`.
   - **П.3 — Оверлеи для редактирования ячеек:**
     - **СОКБ:** ячейка "Обоснование оспаривания" теперь открывает `overlay-corr-desc` с заголовком `Введите обоснование для оспаривания` (синий тон оверлея `#eaf0fb`, белое поле textarea).
     - **Корректирующие мероприятия:** ячейка "Описание мероприятия" открывает `overlay-corr-desc` с заголовком `Опишите мероприятие`.
     - **Корректирующие мероприятия:** ячейка "Ответственный департамент организация" открывает `overlay-corr-text` с заголовком `Введите ответственный департамент организацию` (синий тон оверлея, белое поле input).
     - Применение значений через оверлей обновляет DOM и состояние модели без полной перерисовки списка.
   - `APP_BUILD` → `pkb-v341`, кэш SW → `pkb-static/api-v341`.
2. **pkb-v336 — периодическая проверка push-подписки (раз в неделю):**
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
- [x] Закоммитить pkb-v341–pkb-v355 в master.
- [ ] Закоммитить pkb-v356 в master.
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
