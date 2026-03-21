Set-Location "C:\Users\Workbook Pro\Documents\HTML Project #1"

Write-Host "Stopping old Node processes..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Starting local server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command cd 'C:\Users\Workbook Pro\Documents\HTML Project #1'; npm start"

Write-Host "Adding changed files..." -ForegroundColor Cyan
git add .

Write-Host "Committing updates..." -ForegroundColor Cyan
git commit -m "Update Global Cloud site"

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "Done. Railway should redeploy automatically from GitHub." -ForegroundColor Green
