# Релиз и деплой «Проверки КБ»

## Подход

| Что | Где |
|-----|-----|
| **Код приложения** | одна ветка **`master`** (тот же код, что у пользователей) |
| **Локальные тесты** | `npm start` на компьютере → http://localhost:3000 |
| **Тестовая Excel локально** | репозиторий `proverki-kb-data-dev` (см. [local-dev.md](./local-dev.md)) |
| **Боевая Excel** | репозиторий `proverki-kb-data` (только на kbcheck.webtm.ru) |
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

---

## Ежедневная работа

```powershell
git checkout master
git pull origin master

# правки в index.html, sw.js, api/ ...

npm start
# тест на http://localhost:3000 (данные из proverki-kb-data-dev)

git add ...
git commit -m "..."
git push origin master
```

Push в GitHub **не обновляет** сайт для пользователей, пока вы не нажмёте деплой в Timeweb.

Подробнее про локальную базу: [local-dev.md](./local-dev.md).

---

## Деплой для пользователей (когда готовы)

1. Протестировано локально на `localhost:3000`.
2. При необходимости подняты `APP_VERSION`, `APP_BUILD`, кэш в `sw.js`.
3. Коммиты запушены в **`master`**.
4. **Timeweb** → App Platform → «Проверки КБ» → **Деплой** → **Запустить деплой** / Redeploy (ветка `master`, последний коммит).
5. Проверка: https://kbcheck.webtm.ru/health → `{ "ok": true }`.
6. В приложении: **Настройки** → нужная **«Версия приложения X.XX»**.
7. Сообщите пользователям: перезапустить PWA или обновить страницу.

---

## Чеклист перед деплоем

- [ ] Локально всё проверено (`npm start`, тестовая Excel)
- [ ] `APP_VERSION` / `APP_BUILD` / `sw.js` обновлены (если менялся UI)
- [ ] `git push origin master`
- [ ] Ручной деплой в Timeweb выполнен
- [ ] `/health` и версия в настройках на production OK

---

## Если что-то пошло не так

- **Откат кода:** в Timeweb выбрать предыдущий деплой или `git revert` + push + новый деплой.
- **Откат данных:** Настройки → «Резервные копии базы данных» (только Excel на production).
