@echo off
title WhatsApp MCP — Setup
color 0A

echo.
echo  ================================
echo   WhatsApp MCP — One-Click Setup
echo  ================================
echo.

:: ── Check Node.js is installed ────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed.
  echo.
  echo  Please download and install Node.js LTS from:
  echo  https://nodejs.org
  echo.
  echo  After installing, run this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js %NODE_VER% found.
echo.

:: ── Install dependencies ───────────────────────────────────────────────────────
echo  Installing dependencies (this may take 1-2 minutes)...
echo.
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  [ERROR] npm install failed.
  echo  Try running this file as Administrator (right-click ^> Run as administrator)
  echo.
  pause
  exit /b 1
)

echo.
echo  Dependencies installed successfully.
echo.

:: ── Configure Claude Desktop ───────────────────────────────────────────────────
echo  Configuring Claude Desktop...
echo.
node setup.mjs
if %errorlevel% neq 0 (
  echo.
  echo  [ERROR] Setup failed. See message above.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================
echo   Setup Complete!
echo  ================================
echo.
echo  Next steps:
echo  1. Quit Claude Desktop completely (system tray ^> right-click ^> Quit)
echo  2. Reopen Claude Desktop
echo  3. Your browser will open at http://localhost:3000
echo  4. Scan the QR code with WhatsApp on your phone
echo.
pause
