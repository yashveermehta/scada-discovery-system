@echo off
echo ===================================================
echo 🛠️  Setting up SCADA Discovery System
echo ===================================================

echo.
echo [1/3] Creating virtual environment...
python -m venv venv
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create venv. Make sure Python is installed.
    pause
    exit /b
)

echo.
echo [2/3] Activating virtual environment...
call venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to activate venv.
    pause
    exit /b
)

echo.
echo [3/3] Installing dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b
)

echo.
echo ===================================================
echo ✅ Setup complete!
echo You can now run 'run_app.bat' to start the system.
echo ===================================================
pause
