# Релиз и деплой «Проверки КБ»

## Подход

| Что | Где |
|-----|-----|
| **Код приложения** | одна ветка **`master`** (тот же код, что у пользователей) |
| **Локальные тесты** | `npm start` на компьютере → http://localhost:3000 |
| **Локальная база** | SQLite `data/proverki-dev.db` (`npm run sync:dev-from-prod` — импорт из архива GitHub) |
| **Боевая база** | SQLite + синхронизация с GitHub (`proverki-kb-data/database/proverki.db`) |
| **Резервные копии** | `proverki-kb-data/backups/` на GitHub |
| **Архив Excel на GitHub** | `proverki-kb-data` — для одноразовой миграции, если SQLite ещё нет |
| **Обновление для пользователей** | push в `master` + **ручной деплой** в Timeweb |

Отдельная ветка `develop`, стенды Timeweb и второе приложение **не нужны**.

Production: **https://kbcheck.webtm.ru/**  
Репозиторий: `egorchatov-jpg/proverki-kb`, ветка **`master`**.

**Версия для пользователей:** `APP_VERSION` в `index.html` (например `1.01`), показывается в Настройках.  
Перед деплоем для пользователей поднимите `APP_VERSION` и `APP_BUILD` / кэш в `sw.js`.

---

## Timeweb (один раз)

Чтобы push в `master` **не деплоил** приложение сам:

1. **Timeweb Cloud** → **App Platform** → приложение «Проверки КБ» (`kbcheck.webtm.ru`).
2. **Настройки** → Git: репозиторий `proverki-kb`, ветка **`master`**.
3. **Отключите** автодеплой при push.
4. **Не создавайте стенды** для production — деплой только из основного приложения.

### Переменные окружения

Timeweb App Platform не сохраняет файлы между деплоями. В `.env` приложения:

```
ENABLE_GITHUB_PERSIST=1
GITHUB_TOKEN=<token с доступом к proverki-kb-data>
GITHUB_OWNER=egorchatov-jpg
GITHUB_DATA_REPO=proverki-kb-data
DATABASE_PATH=/tmp/proverki-kb/proverki.db
BACKUPS_DIR=/tmp/proverki-kb/backups
```

Сгенерировать файл: `node scripts/create-timeweb-env-file.js` → загрузить `.env.timeweb-upload` в панель.

---

## Ежедневная работа

```powershell
git checkout master
git pull origin master

# правки в index.html, sw.js, api/ ...

npm start
# тест на http://localhost:3000 (SQLite data/proverki-dev.db)

git add ...
git commit -m "..."
git push origin master
```

Push в GitHub **не обновляет** сайт для пользователей, пока вы не нажмёте деплой в Timeweb.

Подробнее про локальную базу: [local-dev.md](./local-dev.md).

---

## Деплой для пользователей (когда готовы)

1. Протестировано локально на `localhost:3000`.
2. В Timeweb `.env`: `ENABLE_GITHUB_PERSIST=1` и `GITHUB_TOKEN` (см. выше).
3. При необходимости подняты `APP_VERSION`, `APP_BUILD`, кэш в `sw.js`.
4. Коммиты запушены в **`master`**.
5. **Timeweb** → App Platform → «Проверки КБ» → **Деплой** → **Запустить деплой** / Redeploy (ветка `master`, последний коммит).
6. Проверка: https://kbcheck.webtm.ru/health → `{ "ok": true, "githubPersist": true, "database": "proverki.db" }`.
7. В приложении: **Настройки** → нужная **«Версия приложения X.XX»**.
8. Сообщите пользователям: перезапустить PWA или обновить страницу.

---

## Чеклист перед деплоем

- [ ] Локально всё проверено (`npm start`, SQLite dev-база)
- [ ] `APP_VERSION` / `APP_BUILD` / `sw.js` обновлены (если менялся UI)
- [ ] `git push origin master`
- [ ] Ручной деплой в Timeweb выполнен
- [ ] `/health` (`githubPersist: true`) и версия в настройках на production OK

---

## Если что-то пошло не так

- **Откат кода:** в Timeweb выбрать предыдущий деплой или `git revert` + push + новый деплой.
- **Откат данных:** Настройки → «Резервные копии базы данных» (SQLite-снимки на GitHub).
