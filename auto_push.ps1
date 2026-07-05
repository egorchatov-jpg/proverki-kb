$repoPath = "C:\Users\egorc\proverki-kb"
Set-Location $repoPath

$status = git status --porcelain
if ($status) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    git add -A
    git commit -m "Auto-save: $timestamp"
    git push
    Write-Host "GitHub: changes pushed at $timestamp" -ForegroundColor Green
} else {
    Write-Host "GitHub: no changes to push." -ForegroundColor Yellow
}
