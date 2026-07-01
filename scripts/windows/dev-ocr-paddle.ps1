# Start OCR service with real PaddleOCR on Windows (oneDNN disabled by default).
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ocrRoot = Join-Path $repoRoot "ocr-service"

Set-Location $ocrRoot

$env:PDFSAAS_OCR_ENGINE = "paddle"
$env:PDFSAAS_OCR_OCR_VERSION = "PP-OCRv4"
$env:PDFSAAS_OCR_ENABLE_MKLDNN = "0"
$env:FLAGS_enable_pir_api = "0"
$env:FLAGS_use_mkldnn = "0"
$env:FLAGS_use_onednn = "0"

$env:PDFSAAS_OCR_DEFAULT_LANG = "en"

if (-not $env:OCR_SERVICE_PORT) {
  $env:OCR_SERVICE_PORT = "5002"
}

Write-Host "Starting Paddle OCR on http://127.0.0.1:$($env:OCR_SERVICE_PORT) (MKLDNN disabled)" -ForegroundColor Cyan
Write-Host "First run may download models to $env:USERPROFILE\.paddlex\official_models" -ForegroundColor DarkGray

py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port $env:OCR_SERVICE_PORT
