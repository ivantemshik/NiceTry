@echo off
echo ========================================
echo   NiceTry - Local Development Server
echo ========================================
echo.

REM Проверка наличия node_modules
if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call npm install
    echo.
) else (
    echo [SKIP] Dependencies already installed
    echo.
)

echo [2/2] Starting Next.js development server...
echo.
echo Server will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

call npm run dev
