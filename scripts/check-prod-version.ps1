$ProgressPreference = 'SilentlyContinue'
$site = 'https://proverkikb.tw1.ru'

Write-Host "=== Local version (git HEAD / package.json / manifest) ==="
$localVersion = ''
try {
    $package = Get-Content 'c:\Users\egorc\proverki-kb\package.json' -Raw | ConvertFrom-Json
    $localVersion = $package.version
    Write-Host "package.json version: $localVersion"
} catch {}
try {
    $manifest = Get-Content 'c:\Users\egorc\proverki-kb\manifest.json' -Raw | ConvertFrom-Json
    Write-Host "manifest.json version: $($manifest.version)"
    Write-Host "manifest.json version_name: $($manifest.version_name)"
} catch {}
try {
    $head = (git --no-pager log --oneline -1) 2>$null
    Write-Host "git HEAD: $head"
} catch {}

Write-Host ""
Write-Host "=== Production index.html version markers ==="
$r = Invoke-WebRequest -Uri "$site/index.html" -UseBasicParsing
$lines = $r.Content -split "`n"
foreach ($line in $lines) {
    if ($line -match 'var APP_BUILD|var APP_VERSION') {
        Write-Host $line.Trim()
    }
}

Write-Host ""
Write-Host "=== Production /health endpoint ==="
try {
    $h = Invoke-WebRequest -Uri "$site/health" -UseBasicParsing
    Write-Host $h.Content
} catch {
    Write-Host "Health request failed: $_"
}
