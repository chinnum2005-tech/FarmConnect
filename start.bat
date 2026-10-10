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
    ) else if exist "C:\Python311\python.exe" (
        set "PATH=C:\Python311;C:\Python311\Scripts;%PATH%"
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

REM 6. Hardhat Blockchain Node & Smart Contracts
echo [6/6] Checking Blockchain Node & Services...
netstat -ano -p tcp | findstr "LISTENING" | findstr ":8545" >nul
if errorlevel 1 (
    echo [INFO] Starting Hardhat Local Blockchain Node...
    start "AgroTrace - Hardhat Blockchain" cmd /k "cd /d "%~dp0blockchain" && echo Starting Hardhat node on http://localhost:8545 ... && npx.cmd hardhat node"
    ping 127.0.0.1 -n 6 >nul
) else (
    echo [INFO] Hardhat Node is already active on port 8545.
)

if exist "blockchain\scripts\deploy.js" (
    echo [INFO] Checking Smart Contract deployment to local Hardhat node...
    cd blockchain
    call npx.cmd hardhat run scripts/deploy.js --network localhost >nul 2>nul
    cd ..
)
echo.

echo ==================================================================
echo    STARTING ALL PLATFORM SERVICES IN SEPARATE WINDOWS
echo ==================================================================
echo.

REM 1. Backend API
netstat -ano -p tcp | findstr "LISTENING" | findstr ":3001" >nul
if errorlevel 1 (
    echo [Service 1/3] Starting Backend API Server on Port 3001...
    start "AgroTrace - Backend API" cmd /k "cd /d "%~dp0apps\backend" && echo Starting backend on http://localhost:3001 ... && npm.cmd run dev"
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [INFO] Backend API is already running on port 3001.
)

REM 2. Web Frontend
netstat -ano -p tcp | findstr "LISTENING" | findstr ":5173" >nul
if errorlevel 1 (
    echo [Service 2/3] Starting Web Frontend on Port 5173...
    start "AgroTrace - Web Frontend" cmd /k "cd /d "%~dp0apps\web" && echo Starting frontend on http://localhost:5173 ... && npm.cmd run dev"
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [INFO] Web Frontend is already running on port 5173.
)

REM 3. AI Service
if "%PYTHON_AVAILABLE%" EQU "0" (
    if exist "apps\ml-inference\main.py" (
        netstat -ano -p tcp | findstr "LISTENING" | findstr ":8000" >nul
        if errorlevel 1 (
            echo [Service 3/3] Starting AI Inference Service on Port 8000...
            start "AgroTrace - AI Service" cmd /k "cd /d "%~dp0apps\ml-inference" && echo Starting AI service on http://localhost:8000 ... && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
        ) else (
            echo [INFO] AI Inference Service is already running on port 8000.
        )
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