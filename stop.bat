@echo off
echo ==================================================================
echo    Stopping AgroTrace AI platform services...
echo ==================================================================

REM Terminate processes listening on AgroTrace service ports (8545, 3001, 5173, 8000)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /R /C:":8545 .*LISTENING" /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":8000 .*LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

REM Gracefully terminate service console windows with AgroTrace titles
taskkill /FI "WINDOWTITLE eq AgroTrace - *" /T /F 2>nul

echo [OK] All AgroTrace services stopped successfully.
pause
