@echo off
title Unified Digital Platform for Accessible Public Documentation
echo ================================================================
echo   Unified Digital Platform for Accessible Public Documentation
echo ================================================================
echo.
echo [1/3] Navigating to backend directory...
cd /d "%~dp0backend"

echo [2/3] Checking dependencies & compiling TypeScript...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo Error during build! Please check your Node.js environment.
  pause
  exit /b %ERRORLEVEL%
)

echo [3/3] Starting Unified Backend Server & Panels on Port 3000...
echo.
echo ================================================================
echo   FRONTEND & BACKEND ARE NOW LIVE TOGETHER ON PORT 3000:
echo ================================================================
echo  * Frontend Portal:        http://localhost:3000/
echo  * Frontend Citizen View:  http://localhost:3000/citizen.html
echo  * Frontend Official View: http://localhost:3000/official.html
echo  * Frontend Apply View:    http://localhost:3000/apply.html
echo.
echo  * Backend Panel Gateway:  http://localhost:3000/panel
echo  * Citizen Live Panel:     http://localhost:3000/panel/citizen
echo  * Admin/Officer Panel:    http://localhost:3000/panel/admin
echo  * OpenAPI / Swagger Docs: http://localhost:3000/docs
echo ================================================================
echo.
echo Demo Credentials (Password: Demo@Password123):
echo   Citizen: citizen_demo
echo   Officer: officer_sharma
echo   Admin:   sysadmin_rao
echo.
call npm run start:api
pause
