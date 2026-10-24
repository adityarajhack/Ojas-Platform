Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Unified Digital Platform for Accessible Public Documentation  " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$backendDir = Join-Path $PSScriptRoot "backend"
Set-Location $backendDir

Write-Host "[1/2] Compiling backend TypeScript..." -ForegroundColor Yellow
npm run build

Write-Host "`n[2/2] Launching Unified Fastify Server (Frontend + Backend on Port 3000)..." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  FRONTEND & BACKEND ARE NOW LIVE TOGETHER ON PORT 3000:        " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  * Frontend Portal:        http://localhost:3000/" -ForegroundColor White
Write-Host "  * Frontend Citizen View:  http://localhost:3000/citizen.html" -ForegroundColor White
Write-Host "  * Frontend Official View: http://localhost:3000/official.html" -ForegroundColor White
Write-Host "  * Frontend Apply View:    http://localhost:3000/apply.html" -ForegroundColor White
Write-Host ""
Write-Host "  * Backend Panel Gateway:  http://localhost:3000/panel" -ForegroundColor Yellow
Write-Host "  * Citizen Live Panel:     http://localhost:3000/panel/citizen" -ForegroundColor Yellow
Write-Host "  * Admin/Officer Panel:    http://localhost:3000/panel/admin" -ForegroundColor Yellow
Write-Host "  * OpenAPI / Swagger Docs: http://localhost:3000/docs" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Demo Credentials (Password: Demo@Password123):" -ForegroundColor Gray
Write-Host "  - citizen_demo" -ForegroundColor Gray
Write-Host "  - officer_sharma" -ForegroundColor Gray
Write-Host "  - sysadmin_rao" -ForegroundColor Gray
Write-Host ""

npm run start:api
