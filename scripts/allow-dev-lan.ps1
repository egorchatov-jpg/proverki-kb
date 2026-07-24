# Allow iPhone/other devices on LAN to reach npm start (port 3000).
# Run PowerShell AS ADMINISTRATOR once:
#   Set-ExecutionPolicy -Scope Process Bypass -Force; .\scripts\allow-dev-lan.ps1

$ruleName = 'Proverki KB dev 3000'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Green
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
  Write-Host "Created firewall rule: $ruleName" -ForegroundColor Green
}

Write-Host ""
node (Join-Path $PSScriptRoot 'dev-lan-url.js')
