@echo off
REM XLIFF Editor Backend Runner Script

echo ======================================
echo XLIFF Editor Backend
echo ======================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Virtual environment not found. Creating...
    python -m venv venv
    echo Virtual environment created.
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt
echo Dependencies installed.
echo.

python workflow_engine.py
REM main.py

pause