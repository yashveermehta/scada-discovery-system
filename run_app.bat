@echo off
echo ===================================================
echo 🚀 Starting SCADA Discovery System
echo ===================================================

REM Check if venv exists
if not exist "venv" (
    echo [ERROR] Virtual environment 'venv' not found.
    echo Please set up the project first:
    echo   1. python -m venv venv
    echo   2. venv\Scripts\activate
    echo   3. pip install -r requirements.txt
    pause
    exit /b
)

echo.
echo [1/3] Activating virtual environment...
call venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b
)

echo.
echo [2/3] Starting Backend API Server...
start "SCADA Backend (Port 5000)" cmd /k "venv\Scripts\activate && python backend/api/app.py"

echo.
echo [3/3] Starting Frontend React App...
cd frontend-react
start "SCADA Frontend (Port 5173)" cmd /k "npm run dev"
cd ..

REM Wait for servers to initialize
timeout /t 5 /nobreak > nul

echo.
echo [INFO] Opening Application...
start http://localhost:5173

echo.
echo ===================================================
echo ✅ System is running!
echo    - Frontend: http://localhost:5173
echo    - Backend: http://localhost:5000
echo.
echo To stop the system, close the command windows.
echo ===================================================
pause
