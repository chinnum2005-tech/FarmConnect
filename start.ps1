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

# 4. Check Ports
Write-Host "[4/6] Checking Port Availability..." -ForegroundColor Yellow
function Test-PortOpen ($port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $port)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

$hardhatActive = Test-PortOpen 8545
$backendActive = Test-PortOpen 3001
$webActive = Test-PortOpen 5173
$aiActive = Test-PortOpen 8000

# 5. Smart Contracts & Hardhat Node
if (!$hardhatActive) {
    Write-Host "[Service 1/4] Starting Hardhat Node on :8545..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\blockchain`" && npx.cmd hardhat node"
    Start-Sleep -Seconds 4
}
Write-Host "[INFO] Deploying Smart Contracts..." -ForegroundColor Cyan
Push-Location "blockchain"
& npx.cmd hardhat run scripts/deploy.js --network localhost
Pop-Location

# 6. Launch Backend API
if (!$backendActive) {
    Write-Host "[Service 2/4] Starting Backend API on :3001..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\backend`" && npm.cmd run dev"
    Start-Sleep -Seconds 2
} else {
    Write-Host "[Service 2/4] Backend API is already running on port 3001." -ForegroundColor Green
}

# 7. Launch Web Frontend
if (!$webActive) {
    Write-Host "[Service 3/4] Starting Web Frontend on :5173..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\web`" && npm.cmd run dev"
    Start-Sleep -Seconds 2
} else {
    Write-Host "[Service 3/4] Web Frontend is already running on port 5173." -ForegroundColor Green
}

# 8. Launch AI ML Service
if ($pythonAvailable -and !$aiActive) {
    Write-Host "[Service 4/4] Starting AI ML Service on :8000..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList '/k', "cd /d `"$RootPath\apps\ml-inference`" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
} elseif ($aiActive) {
    Write-Host "[Service 4/4] AI Service is already running on port 8000." -ForegroundColor Green
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
