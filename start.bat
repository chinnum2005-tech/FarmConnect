@echo off
setlocal enabledelayedexpansion

REM ====================================================================
REM AgroTrace AI (FarmConnect) - Complete Automated Startup
REM ====================================================================
title AgroTrace AI - Platform Startup
color 0A

REM Ensure current working directory is always the repository root
cd /d "%~dp0"

echo.
echo ==================================================================
echo    AGROTRACE AI - PLATFORM AUTOMATED STARTUP
echo ==================================================================
echo.

echo [1/6] Verifying Environment Configuration...
if not exist ".env" if exist ".env.example" copy /y .env.example .env >nul
if not exist "apps\backend\.env" if exist "apps\backend\.env.example" copy /y apps\backend\.env.example apps\backend\.env >nul
if not exist "apps\ml-inference\.env" if exist "apps\ml-inference\.env.example" copy /y apps\ml-inference\.env.example apps\ml-inference\.env >nul
if not exist "apps\web\.env" if exist "apps\web\.env.example" copy /y apps\web\.env.example apps\web\.env >nul
echo [OK] Environment files verified.
echo.

REM 2. Check Prerequisites (Node.js & Python)
echo [2/6] Checking System Prerequisites...

REM Refresh PATH from user registry if node is not immediately recognized
where node >nul 2>nul
if errorlevel 1 (
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "PATH=%%B;%PATH%"
)

REM Check well-known install locations for Node.js
where node >nul 2>nul
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    )
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in your PATH!
    echo Please install Node.js v18 or above from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo [OK] Node.js detected: %%v

REM Auto-discover Python if missing from active terminal PATH
where python >nul 2>nul
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python310;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%PATH%"
    ) else if exist "C:\Python311\python.exe" (
        set "PATH=C:\Python311;C:\Python311\Scripts;%PATH%"
    ) else if exist "C:\Python312\python.exe" (
        set "PATH=C:\Python312;C:\Python312\Scripts;%PATH%"
    ) else if exist ".venv\Scripts\python.exe" (
        set "PATH=%~dp0.venv\Scripts;%PATH%"
    )
)

where python >nul 2>nul
if errorlevel 1 (
    set PYTHON_AVAILABLE=1
    echo [WARN] Python not found in PATH. AI yield prediction service will be skipped.
) else (
    set PYTHON_AVAILABLE=0
    echo [OK] Python detected:
    python --version
)
echo.

REM 3. Install Monorepo Node Dependencies
echo [3/6] Checking Node Dependencies...
if exist "node_modules" goto dependencies_ok
echo [INFO] node_modules not found. Installing workspace dependencies...
call npm.cmd install
if errorlevel 1 (
    echo [ERROR] Dependency installation failed!
    pause
    exit /b 1
)
:dependencies_ok
echo [OK] Monorepo dependencies are already installed.
echo.

REM 4. Generate Prisma Client
echo [4/6] Generating Database Client...
if not exist "packages\prisma" (
    echo [WARN] packages\prisma directory not found!
    goto prisma_done
)
echo [INFO] Running Prisma Client generation...
cd packages\prisma & call npx.cmd prisma generate & cd ..\..
if errorlevel 1 (
    echo [ERROR] Prisma Client generation failed!
    echo [HINT] If you get an EPERM error, please close all running backend consoles and try again.
    pause
    exit /b 1
)
echo [OK] Database client generated successfully.
:prisma_done
echo.

REM 5. Install Python Dependencies
echo [5/6] Checking AI Service Python Dependencies...
if "%PYTHON_AVAILABLE%" NEQ "0" (
    echo [SKIP] AI dependencies check skipped [Python not available].
    goto python_deps_done
)
if not exist "apps\ml-inference\requirements.txt" (
    echo [WARN] apps\ml-inference\requirements.txt not found!
    goto python_deps_done
)
echo [INFO] Verifying Python libraries...
python -m pip install -r apps\ml-inference\requirements.txt >nul 2>nul
if errorlevel 1 (
    echo [WARN] Python dependency check failed. AI Service might encounter issues.
) else (
    echo [OK] Python dependencies verified.
)
:python_deps_done
echo.

REM 6. Port Check & Stale Process Cleanup
echo [6/6] Verifying Service Ports & Freeing Stale Background Processes...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /R /C:":8545 .*LISTENING" /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":8000 .*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
echo [OK] Ports 8545, 3001, 5173, 8000 cleared for fresh consoles.
echo.

echo ==================================================================
echo    STARTING ALL PLATFORM SERVICES IN SEPARATE WINDOWS
echo ==================================================================
echo.

REM 1. Hardhat Blockchain Node
echo [Service 1/4] Starting Hardhat Local Blockchain Node on Port 8545...
start "AgroTrace - Hardhat Blockchain" cmd /k "cd /d "%~dp0blockchain" && echo Starting Hardhat node on http://localhost:8545 ... && npx.cmd hardhat node"
ping 127.0.0.1 -n 6 >nul

if exist "blockchain\scripts\deploy.js" (
    echo [INFO] Checking Smart Contract deployment to local Hardhat node...
    cd blockchain
    call npx.cmd hardhat run scripts/deploy.js --network localhost >nul 2>nul
    cd ..
)

REM 2. Backend API
echo [Service 2/4] Starting Backend API Server on Port 3001...
start "AgroTrace - Backend API" cmd /k "cd /d "%~dp0apps\backend" && echo Starting backend on http://localhost:3001 ... && npm.cmd run dev"
ping 127.0.0.1 -n 3 >nul

REM 3. Web Frontend
echo [Service 3/4] Starting Web Frontend on Port 5173...
start "AgroTrace - Web Frontend" cmd /k "cd /d "%~dp0apps\web" && echo Starting frontend on http://localhost:5173 ... && npm.cmd run dev"
ping 127.0.0.1 -n 3 >nul

REM 4. AI Service
if "%PYTHON_AVAILABLE%" EQU "0" (
    if exist "apps\ml-inference\main.py" (
        echo [Service 4/4] Starting AI Inference Service on Port 8000...
        start "AgroTrace - AI Service" cmd /k "cd /d "%~dp0apps\ml-inference" && echo Starting AI service on http://localhost:8000 ... && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
    )
)

echo.
echo ==================================================================
echo    ALL AGROTRACE SERVICES ARE ACTIVE AND RUNNING!
echo ==================================================================
echo.
echo  Access URLs:
echo    - Web Frontend:     http://localhost:5173
echo    - Backend API:      http://localhost:3001
echo    - AI ML Service:    http://localhost:8000
echo    - Hardhat Node:     http://localhost:8545
echo.
echo  Instructions:
echo    - Keep the service terminal windows open while using the app.
echo    - To stop all services at once, run: stop.bat
echo    - To stop any individual service, press Ctrl+C in its respective window.
echo.
pause