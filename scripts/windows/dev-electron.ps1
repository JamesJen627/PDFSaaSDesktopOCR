#Requires -Version 5.1
<#
.SYNOPSIS
  Start Electron dev (renderer + main) with external Backend/OCR for Phase 3B.

.NOTES
  Rebuilds preload/main on every run so new IPC methods (e.g. pickAndProcessOcr) are available.
#>
param(
    [string]$BackendUrl = "http://127.0.0.1:8080",
    [string]$OcrUrl = "http://127.0.0.1:5002"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$electronDir = Join-Path $repoRoot "frontend\electron"

Set-Location $electronDir

Write-Host "Building Electron main + preload (required after IPC changes)..."
npm run build:main
npm run build:preload

$env:ELECTRON_USE_EXTERNAL_BACKEND = $BackendUrl
$env:ELECTRON_USE_EXTERNAL_OCR = $OcrUrl

Write-Host ""
Write-Host "Backend: $BackendUrl"
Write-Host "OCR:     $OcrUrl"
Write-Host "Starting npm run dev (Vite :5174 + Electron)..."
Write-Host "If port 5174 is in use, run: .\scripts\windows\stop-electron.ps1"
Write-Host ""

npm run dev
