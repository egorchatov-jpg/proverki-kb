# Готовит файл .env для загрузки в Timeweb (кнопка «Загрузить из файлa»)
# Запуск: .\scripts\prepare-timeweb-env.ps1
# Результат: timeweb-upload.env — переименуйте в .env перед загрузкой

$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root '.env.prod'
$out = Join-Path $root 'timeweb-upload.env'

$keys = @(
  'DATABASE_PATH',
  'BACKUPS_DIR',
  'ENABLE_GITHUB_PERSIST',
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_DATA_REPO',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT'
)

if (-not (Test-Path $src)) {
  Write-Host "Файл .env.prod не найден: $src" -ForegroundColor Red
  Write-Host "Скопируйте переменные вручную из Vercel -> Settings -> Environment Variables"
  exit 1
}

$lines = Get-Content $src -Encoding UTF8
$found = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $parts = $line -split '=', 2
  $k = $parts[0].Trim()
  $v = $parts[1].Trim().Trim('"')
  if ($keys -contains $k) { $found[$k] = $v }
}

$missing = $keys | Where-Object { -not $found.ContainsKey($_) }
if ($missing.Count) {
  Write-Host "В .env.prod не хватает:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "  - $_" }
}

$outLines = @()
foreach ($k in $keys) {
  if ($found.ContainsKey($k)) { $outLines += "$k=$($found[$k])" }
}
$outLines += 'ENABLE_BACKUP_CRON=1'
if (-not $found.ContainsKey('ENABLE_GITHUB_PERSIST')) {
  $outLines += 'ENABLE_GITHUB_PERSIST=1'
}
if (-not $found.ContainsKey('DATABASE_PATH')) {
  $outLines += 'DATABASE_PATH=/tmp/proverki-kb/proverki.db'
}
if (-not $found.ContainsKey('BACKUPS_DIR')) {
  $outLines += 'BACKUPS_DIR=/tmp/proverki-kb/backups'
}

Set-Content -Path $out -Value ($outLines -join "`n") -Encoding UTF8 -NoNewline
Write-Host ""
Write-Host "Готово: $out" -ForegroundColor Green
Write-Host "1. Переименуйте файл в .env (Timeweb принимает только это имя)"
Write-Host "2. В Timeweb -> Переменные -> Загрузить из файла"
Write-Host "3. Не коммитьте .env в git!"
Write-Host ""
