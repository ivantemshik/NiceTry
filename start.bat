@echo off
echo ========================================
echo   NiceTry - Local Development Server
echo ========================================
echo.

REM [1/4] Останавливаем старые next-серверы.
REM ПРИЧИНА: несколько 'next dev'/'next start' на одной папке .next затирают
REM сборку друг друга -> CSS отдаётся 404, страница без стилей. Перед стартом
REM гарантируем, что запущен ровно ОДИН сервер.
echo [1/4] Stopping any old Next.js servers...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'next' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM [2/4] Чистим кэш сборки на случай, если он повреждён прошлым запуском.
echo [2/4] Clearing build cache (.next)...
if exist ".next" rmdir /s /q ".next"
echo.

REM [3/4] Зависимости.
if not exist "node_modules\" (
    echo [3/4] Installing dependencies...
    call npm install
    echo.
) else (
    echo [3/4] Dependencies already installed
    echo.
)

echo [4/4] Starting Next.js development server...
echo.
echo Server will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

call npm run dev
