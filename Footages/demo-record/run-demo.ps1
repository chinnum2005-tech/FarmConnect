$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Checking frontend..." -ForegroundColor Cyan
try {
  $null = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 5
} catch {
  throw 'Frontend not reachable at http://localhost:5173. Start services first.'
}

Write-Host "Checking backend..." -ForegroundColor Cyan
try {
  $null = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 5
} catch {
  throw 'Backend not reachable at http://localhost:3001. Start services first.'
}

Write-Host "Recording walkthrough (this takes several minutes)..." -ForegroundColor Green
node .\walkthrough.mjs
if ($LASTEXITCODE -ne 0) { throw 'Walkthrough failed' }

Write-Host "Muxing narration audio into final MP4..." -ForegroundColor Green
node .\mux-narration.mjs
if ($LASTEXITCODE -ne 0) { throw 'Mux failed' }

Write-Host "Done." -ForegroundColor Green
Get-ChildItem .\output\*.mp4 | Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName, Length, LastWriteTime
