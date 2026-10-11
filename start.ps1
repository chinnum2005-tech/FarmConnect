# AgroTrace Platform Startup Script for PowerShell
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   🌾 AGROTRACE AI - PLATFORM AUTOMATED STARTUP 🌾" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Get-Location

# 1. Verify Environment Files (.env)
Write-Host "[1/6] Verifying Environment Configuration..." -ForegroundColor Yellow
if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}
if (!(Test-Path "apps\backend\.env") -and (Test-Path "apps\backend\.env.example")) {
    Copy-Item "apps\backend\.env.example" "apps\backend\.env"
}
if (!(Test-Path "apps\ml-inference\.env") -and (Test-Path "apps\ml-inference\.env.example")) {
    Copy-Item "apps\ml-inference\.env.example" "apps\ml-inference\.env"
}
if (!(Test-Path "apps\web\.env") -and (Test-Path "apps\web\.env.example")) {
    Copy-Item "apps\web\.env.example" "apps\web\.env"
}
Write-Host "[OK] Environment files verified." -ForegroundColor Green

# 2. Check Prerequisites
Write-Host "[2/6] Checking Prerequisites..." -ForegroundColor Yellow
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (!$nodeCmd) {
    Write-Host "[ERROR] Node.js is not found in PATH!" -ForegroundColor Red
    exit 1
}
$pythonCmd = Get-Command "python" -ErrorAction SilentlyContinue
$pythonAvailable = $null -ne $pythonCmd

# 3. Prisma Client Generation
Write-Host "[3/6] Generating Prisma Client..." -ForegroundColor Yellow
Push-Location "packages\prisma"
try {
    & npx.cmd prisma generate | Out-Null
    Write-Host "[OK] Database client generated." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Prisma Client generation notice (could be locked by active backend)." -ForegroundColor Yellow
}
Pop-Location

# 4. Check Ports & Clean Stale Background Instances
Write-Host "[4/6] Freeing Service Ports & Clearing Stale Background Processes..." -ForegroundColor Yellow
$servicePorts = @(8545, 3001, 5173, 8000)
foreach ($p in $servicePorts) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($conn in $conns) {
                Write-Host "Freeing occupied port $p (PID: $($conn.OwningProcess))..." -ForegroundColor DarkGray
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}
Write-Host "[OK] Service ports (8545, 3001, 5173, 8000) ready for fresh consoles." -ForegroundColor Green

# 5. Smart Contracts & Hardhat Node
Write-Host "[Service 1/4] Starting Hardhat Node on :8545..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\blockchain`" && npx.cmd hardhat node"
Start-Sleep -Seconds 5

Write-Host "[INFO] Deploying Smart Contracts..." -ForegroundColor Cyan
Push-Location "blockchain"
& npx.cmd hardhat run scripts/deploy.js --network localhost
Pop-Location

# 6. Launch Backend API
Write-Host "[Service 2/4] Starting Backend API on :3001..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\backend`" && npm.cmd run dev"
Start-Sleep -Seconds 2

# 7. Launch Web Frontend
Write-Host "[Service 3/4] Starting Web Frontend on :5173..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\web`" && npm.cmd run dev"
Start-Sleep -Seconds 2

# 8. Launch AI ML Service
if ($pythonAvailable) {
    Write-Host "[Service 4/4] Starting AI ML Service on :8000..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\ml-inference`" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   ALL PLATFORM SERVICES STARTED SUCCESSFULLY! 🚀" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   - Web Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "   - Backend API:   http://localhost:3001" -ForegroundColor White
Write-Host "   - AI ML Service: http://localhost:8000" -ForegroundColor White
Write-Host "   - Hardhat Node:  http://localhost:8545" -ForegroundColor White
Write-Host ""
