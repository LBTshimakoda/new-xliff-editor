@echo off
echo ======================================
echo XLIFF Editor Frontend Setup
echo ======================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

echo Checking npm installation...
npm --version
echo.

echo Installing dependencies...
echo This may take a few minutes...
echo.

npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Installation failed!
    pause
    exit /b 1
)

echo.
echo ======================================
echo Installation complete!
echo ======================================
echo.
echo To start the development server, run:
echo   npm run dev
echo.
pause