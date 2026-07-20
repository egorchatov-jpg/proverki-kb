# Релиз и деплой «Проверки КБ»

## Две ветки

| Ветка | Назначение | Когда обновляется |
|-------|------------|-------------------|
| **develop** | Ежедневная разработка | Каждый ваш push |
| **master** | Production (пользователи) | Только когда вы запускаете релиз |

Production-сайт: **https://kbcheck.webtm.ru/**  
Репозиторий приложения: `proverki-kb`  
База данных (Excel): `proverki-kb-data` (общая для всех пользователей).

**Версия для пользователей:** `APP_VERSION` в `index.html` (например `1.01`), показывается в Настройках.  
После `npm run release` скрипт автоматически поднимает `APP_VERSION` на `develop` для следующего релиза (`1.01` → `1.02`).

---

## Однократная настройка Timeweb (важно)

Чтобы push в `master` **не деплоил** приложение автоматически:

1. **Timeweb Cloud** → **App Platform** → приложение «Проверки КБ».
2. **Настройки** → раздел про Git / деплой.
3. **Отключите** «Автоматический деплой при push» / **Auto deploy** (формулировка зависит от панели).
4. Оставьте привязку к репозиторию и ветке **master** — деплой будет **вручную** из панели.

После этого только вы решаете, когда пользователи получат новую версию.

---

## Ежедневная работа (develop)

```powershell
git checkout develop
# ... правки, коммиты ...
git push origin develop
```

Push в `develop` **не трогает** production и пользователей.

---

## Пакетный релиз (когда сами решите)

```powershell
git checkout develop
git push origin develop          # всё готово на develop
node scripts/release-prod.js     # merge develop → master, push master
```

Просмотр без изменений:

```powershell
node scripts/release-prod.js --dry-run
```

### После скрипта — деплой в Timeweb вручную

1. Timeweb → App Platform → «Проверки КБ» → **Деплой**.
2. **Запустить деплой** / Redeploy из ветки **master** (последний коммит).
3. Проверка: https://kbcheck.webtm.ru/health → `{ "ok": true }`.
4. Сообщите пользователям: закрыть и открыть приложение (или обновить страницу).

---

## Локальная разработка (тестовая база)

Подробно: [local-dev.md](./local-dev.md).

```bash
npm run setup:dev-data   # proverki-kb-data-dev + .env.local
npm start                # http://localhost:3000
```

## Опционально: dev-сервер на Timeweb

Для тестов без риска для боевой Excel-базы:

- Второе приложение Timeweb (например `dev.kbcheck.webtm.ru`).
- Автодеплой из ветки **develop**.
- Отдельный репозиторий данных: `GITHUB_DATA_REPO=proverki-kb-data-dev`.

---

## Чеклист перед релизом

- [ ] Протестировано локально или на dev
- [ ] `node scripts/release-prod.js --dry-run` — список коммитов OK
- [ ] `node scripts/release-prod.js` — master обновлён
- [ ] Ручной деплой в Timeweb выполнен
- [ ] `/health` отвечает
- [ ] На телефоне подтянулась новая версия (APP_BUILD в настройках / консоли)

---

## Если что-то пошло не так

- **Откат кода:** в Timeweb выбрать деплой предыдущего коммита `master` или `git revert` + новый релиз.
- **Откат данных:** Настройки → «Резервные копии базы данных» (только Excel).
