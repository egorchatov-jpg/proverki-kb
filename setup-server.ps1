# Настройка серверного хранилища и push-уведомлений для Проверки КБ
# Запуск: .\setup-server.ps1 -Token "ваш_github_pat"
param(
  [Parameter(Mandatory=$true)]
  [string]$Token
)

$OWNER     = "egorchatov-jpg"
$DATA_REPO = "proverki-kb-data"
$TEMPLATE  = "C:\Users\egorc\KBBKSSPD\Проверки КБ 2026.xlsx"
$INDEX_HTML = "$PSScriptRoot\index.html"

$headers = @{
  Authorization = "token $Token"
  Accept        = "application/vnd.github.v3+json"
  "User-Agent"  = "proverki-kb-setup"
}

Write-Host ""
Write-Host "=== Настройка серверного хранилища Проверки КБ ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Создать приватный репозиторий ─────────────────────────────────────────
Write-Host "1. Создание репозитория '$DATA_REPO'..." -ForegroundColor Yellow
$body = @{
  name        = $DATA_REPO
  private     = $true
  description = "Данные проверок объектов капитального строительства"
  auto_init   = $false
} | ConvertTo-Json

try {
  $resp = Invoke-RestMethod -Uri "https://api.github.com/user/repos" `
    -Method POST -Headers $headers -ContentType "application/json" -Body $body
  Write-Host "   ✓ Репозиторий создан: $($resp.html_url)" -ForegroundColor Green
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 422) {
    Write-Host "   ℹ Репозиторий уже существует — продолжаем." -ForegroundColor Cyan
  } else {
    Write-Host "   ✗ Ошибка: $($_.Exception.Message)" -ForegroundColor Red; exit 1
  }
}

# ── 2. Загрузить шаблон Excel 2026 ───────────────────────────────────────────
Write-Host ""
Write-Host "2. Загрузка шаблона 'Проверки КБ 2026.xlsx'..." -ForegroundColor Yellow

if (-not (Test-Path $TEMPLATE)) {
  Write-Host "   ✗ Файл не найден: $TEMPLATE" -ForegroundColor Red
  Write-Host "   Пропускаем загрузку шаблона." -ForegroundColor Gray
} else {
  $bytes   = [System.IO.File]::ReadAllBytes($TEMPLATE)
  $b64     = [Convert]::ToBase64String($bytes)
  $fname   = [System.IO.Path]::GetFileName($TEMPLATE)
  $encName = [Uri]::EscapeDataString($fname)

  # Проверим: файл уже есть?
  try {
    $existing = Invoke-RestMethod `
      -Uri "https://api.github.com/repos/$OWNER/$DATA_REPO/contents/$encName" `
      -Headers $headers
    $sha = $existing.sha
    Write-Host "   ℹ Файл уже существует, обновляем..." -ForegroundColor Cyan
  } catch { $sha = $null }

  $putBody = @{ message = "Шаблон: $fname"; content = $b64 }
  if ($sha) { $putBody.sha = $sha }

  try {
    Invoke-RestMethod `
      -Uri "https://api.github.com/repos/$OWNER/$DATA_REPO/contents/$encName" `
      -Method PUT -Headers $headers -ContentType "application/json" `
      -Body ($putBody | ConvertTo-Json) | Out-Null
    Write-Host "   ✓ Файл загружен." -ForegroundColor Green
  } catch {
    Write-Host "   ✗ Ошибка загрузки: $($_.Exception.Message)" -ForegroundColor Red
  }
}

# ── 3. Создать пустой subscriptions.json ─────────────────────────────────────
Write-Host ""
Write-Host "3. Инициализация subscriptions.json..." -ForegroundColor Yellow

$subsContent = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"subscriptions":[]}'))

try {
  $existingSubs = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$OWNER/$DATA_REPO/contents/subscriptions.json" `
    -Headers $headers
  Write-Host "   ℹ subscriptions.json уже существует — пропускаем." -ForegroundColor Cyan
} catch {
  try {
    $subsPut = @{ message = "Init subscriptions.json"; content = $subsContent } | ConvertTo-Json
    Invoke-RestMethod `
      -Uri "https://api.github.com/repos/$OWNER/$DATA_REPO/contents/subscriptions.json" `
      -Method PUT -Headers $headers -ContentType "application/json" -Body $subsPut | Out-Null
    Write-Host "   ✓ subscriptions.json создан." -ForegroundColor Green
  } catch {
    Write-Host "   ✗ Ошибка: $($_.Exception.Message)" -ForegroundColor Red
  }
}

# ── 4. Генерация VAPID-ключей ─────────────────────────────────────────────────
Write-Host ""
Write-Host "4. Генерация VAPID-ключей для push-уведомлений..." -ForegroundColor Yellow

Set-Location $PSScriptRoot

# Установить зависимости локально (нужны для генерации ключей)
Write-Host "   Устанавливаю зависимости (npm install)..." -NoNewline
npm install --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host " ✗" -ForegroundColor Red
  Write-Host "   Убедитесь что Node.js и npm установлены." -ForegroundColor Red
  exit 1
}
Write-Host " ✓" -ForegroundColor Green

$keysJson = node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();process.stdout.write(JSON.stringify(k));"
if ($LASTEXITCODE -ne 0 -or -not $keysJson) {
  Write-Host "   ✗ Не удалось сгенерировать ключи." -ForegroundColor Red; exit 1
}

$keys = $keysJson | ConvertFrom-Json
$VAPID_PUBLIC  = $keys.publicKey
$VAPID_PRIVATE = $keys.privateKey

Write-Host "   ✓ Публичный ключ: $($VAPID_PUBLIC.Substring(0,20))..." -ForegroundColor Green

# Встраиваем публичный ключ в index.html
if (Test-Path $INDEX_HTML) {
  $html = Get-Content $INDEX_HTML -Raw -Encoding UTF8
  $html = $html -replace "var VAPID_PUBLIC_KEY = '__VAPID_PUBLIC_KEY__';", "var VAPID_PUBLIC_KEY = '$VAPID_PUBLIC';"
  $html | Out-File $INDEX_HTML -Encoding utf8 -NoNewline
  Write-Host "   ✓ VAPID_PUBLIC_KEY вставлен в index.html." -ForegroundColor Green
} else {
  Write-Host "   ✗ index.html не найден: $INDEX_HTML" -ForegroundColor Red
}

# ── 5. Установить переменные среды в Vercel ───────────────────────────────────
Write-Host ""
Write-Host "5. Установка переменных среды Vercel..." -ForegroundColor Yellow

$vercelVars = @(
  @{ key = "GITHUB_TOKEN";      value = $Token },
  @{ key = "GITHUB_OWNER";      value = $OWNER },
  @{ key = "GITHUB_DATA_REPO";  value = $DATA_REPO },
  @{ key = "VAPID_PUBLIC_KEY";  value = $VAPID_PUBLIC },
  @{ key = "VAPID_PRIVATE_KEY"; value = $VAPID_PRIVATE },
  @{ key = "VAPID_SUBJECT";     value = "mailto:egorchatov@gmail.com" }
)

foreach ($v in $vercelVars) {
  Write-Host "   $($v.key)..." -NoNewline
  # Vercel env add читает значение из stdin
  $v.value | vercel env add $v.key production 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host " ✓" -ForegroundColor Green
  } else {
    # Пробуем remove + add если уже существует
    vercel env rm $v.key production --yes 2>&1 | Out-Null
    $v.value | vercel env add $v.key production 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host " ✓ (обновлено)" -ForegroundColor Green
    } else {
      Write-Host " ⚠ Установите вручную:" -ForegroundColor Yellow
      Write-Host "     echo '$($v.value)' | vercel env add $($v.key) production" -ForegroundColor Gray
    }
  }
}

# ── Итог ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Готово! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Cyan
Write-Host "  1. git add -A"
Write-Host "  2. git commit -m 'feat: server Excel sync + Web Push notifications'"
Write-Host "  3. git push"
Write-Host "  4. vercel --prod"
Write-Host ""
Write-Host "После деплоя:" -ForegroundColor Gray
Write-Host "  • Каждая проверка записывается в Excel на GitHub" -ForegroundColor Gray
Write-Host "  • При нарушении (барьер не работает) — push-уведомление всем устройствам" -ForegroundColor Gray
Write-Host "  • При открытии приложения данные подтягиваются с сервера" -ForegroundColor Gray
