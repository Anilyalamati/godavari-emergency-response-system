@echo off
setlocal enabledelayedexpansion
title Godavari Emergency Response Coordination System

cd /d "%~dp0"

echo ======================================================================
echo   Godavari Emergency Response Coordination System
echo   Local Launcher
echo ======================================================================
echo.

:: 1. Verify Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not found in your system PATH.
  echo Please install Node.js version 20.19 or newer - Node 22 LTS recommended
  echo Download from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
echo [OK] Node.js detected: !NODE_VERSION!

:: 2. Verify pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [INFO] pnpm not found in PATH. Checking corepack...
  where corepack >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Neither pnpm nor corepack was found in PATH.
    echo Please install pnpm globally by running: npm install -g pnpm
    echo.
    pause
    exit /b 1
  ) else (
    echo [INFO] Activating pnpm via corepack...
    call corepack enable
    call corepack prepare pnpm@11.25.0 --activate
  )
)

for /f "tokens=*" %%v in ('pnpm -v 2^>nul') do set PNPM_VERSION=%%v
echo [OK] pnpm detected: !PNPM_VERSION!
echo.

:: 3. Check environment configuration files
if not exist "apps\web\.env" (
  echo [INFO] Creating apps\web\.env from .env.example...
  copy "apps\web\.env.example" "apps\web\.env" >nul
)

if not exist "apps\api\.env" (
  echo [INFO] Creating apps\api\.env from .env.example...
  copy "apps\api\.env.example" "apps\api\.env" >nul
)

:: 4. Verify node_modules
if not exist "node_modules" (
  echo [INFO] Installing project dependencies - first-time setup...
  call pnpm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    echo.
    pause
    exit /b 1
  )
)

:: 5. Ensure shared workspace package is compiled
echo [INFO] Compiling shared contracts @godavari/shared...
call pnpm --filter @godavari/shared build
if errorlevel 1 (
  echo [ERROR] Failed to compile shared contracts.
  echo.
  pause
  exit /b 1
)
echo [OK] Shared contracts ready.
echo.

:: 6. Launch options
echo ----------------------------------------------------------------------
echo Select launch mode:
echo   [1] Web Interface Only - Vite dev server with auto-open browser [DEFAULT]
echo   [2] Full Stack - Express API on :4000 + Vite Web on :3000 + auto-open
echo   [3] Production Preview - Production build + Vite preview + auto-open
echo ----------------------------------------------------------------------
echo.

choice /c 123 /t 6 /d 1 /m "Select option (auto-starting [1] in 6s): "
set SELECTION=!errorlevel!

echo.
if "!SELECTION!"=="3" goto launch_preview
if "!SELECTION!"=="2" goto launch_fullstack
goto launch_web

:launch_web
echo [INFO] Starting Vite development server and opening default browser...
echo Notice: Press Ctrl+C in this terminal window to stop the server.
echo.
call pnpm --filter @godavari/web dev -- --open
if errorlevel 1 (
  echo.
  echo [ERROR] Development server stopped with an error.
  echo If port 3000 is occupied, free port 3000 or terminate conflicting processes.
  pause
)
exit /b 0

:launch_fullstack
echo [INFO] Launching Express API server in a companion window...
start "Godavari API Server (:4000)" cmd /k pnpm --filter @godavari/api dev
echo [INFO] Starting Vite web interface and opening default browser...
echo Notice: Press Ctrl+C in this terminal window to stop the web server.
echo.
call pnpm --filter @godavari/web dev -- --open
if errorlevel 1 (
  echo.
  echo [ERROR] Web server stopped with an error.
  pause
)
exit /b 0

:launch_preview
echo [INFO] Building production bundle...
call pnpm --filter @godavari/web build
if errorlevel 1 (
  echo [ERROR] Production build failed.
  pause
  exit /b 1
)
echo [INFO] Starting Vite production preview server and opening browser...
call pnpm --filter @godavari/web preview -- --open
if errorlevel 1 (
  echo [ERROR] Preview server encountered an error.
  pause
)
exit /b 0
