# Подготовка деплоя Проверки КБ на Timeweb Cloud App Platform
# Запуск: .\setup-timeweb.ps1

Write-Host ""
Write-Host "=== Деплой Проверки КБ на Timeweb Cloud ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Timeweb Cloud -> App Platform -> Добавить -> Backend" -ForegroundColor Yellow
Write-Host "   - Репозиторий: GitHub -> proverki-kb (ветка master)"
Write-Host "   - Среда: Node.js 20 или 22"
Write-Host "   - Команда сборки: npm install"
Write-Host "   - Команда запуска: npm start"
Write-Host "   - Порт приложения: 3000 (Timeweb обычно проксирует через PORT)"
Write-Host ""

Write-Host "2. Переменные окружения (Настройки приложения -> Переменные):" -ForegroundColor Yellow
$vars = @(
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_DATA_REPO',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT'
)
foreach ($v in $vars) { Write-Host "   - $v" -ForegroundColor Gray }

$envProd = Join-Path $PSScriptRoot '.env.prod'
if (Test-Path $envProd) {
  Write-Host ""
  Write-Host "   Значения из .env.prod (скопируйте в панель Timeweb):" -ForegroundColor Green
  Get-Content $envProd | Where-Object { $_ -match '^(GITHUB_|VAPID_)' -and $_ -notmatch '^\s*#' } | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
} else {
  Write-Host ""
  Write-Host "   Файл .env.prod не найден — возьмите значения из Vercel (Settings -> Environment Variables)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Домен" -ForegroundColor Yellow
Write-Host "   - Рабочий домен: https://kbcheck.webtm.ru/"
Write-Host "   - Или привязать свой домен (A/CNAME на сервер приложения)"
Write-Host ""

Write-Host "4. После первого деплоя" -ForegroundColor Yellow
Write-Host "   - Откройте https://<ваш-домен>/health — должно быть { ok: true }"
Write-Host "   - Установите PWA заново или очистите кэш на телефонах"
Write-Host "   - Старый URL proverki-kb.vercel.app можно оставить или отключить"
Write-Host ""

Write-Host "5. Ежедневный бэкап Excel" -ForegroundColor Yellow
Write-Host "   - Встроен в server.js (cron 00:00 MSK)"
Write-Host "   - Отключить: ENABLE_BACKUP_CRON=0"
Write-Host ""

Write-Host "Готово. Закоммитьте server.js и запушьте в GitHub — Timeweb подхватит автодеплой." -ForegroundColor Green
Write-Host ""
