#Requires -Version 5.1
<#
.SYNOPSIS
  Test OCR endpoints (Python direct or Java proxy).

.PARAMETER Target
  python = http://127.0.0.1:5002 (ocr-service)
  java   = http://127.0.0.1:8080/api/v1/ocr (backend proxy; default)

.PARAMETER ImagePath
  Optional PNG/JPG for POST /process test.
#>
param(
    [ValidateSet("python", "java")]
    [string]$Target = "java",
    [string]$ImagePath = "",
    [string]$BackendBase = "http://127.0.0.1:8080",
    [string]$OcrBase = "http://127.0.0.1:5002"
)

$ErrorActionPreference = "Stop"

function Invoke-HealthCheck {
    param([string]$Url)
    Write-Host "GET $Url"
    # Use curl.exe — PowerShell's curl is Invoke-WebRequest and rejects -X / -F.
    # Join lines: -notmatch on an array returns non-matching elements, not $true/$false.
    $lines = & curl.exe -sS -w "`nHTTP_STATUS:%{http_code}" $Url
    $output = ($lines | Out-String).TrimEnd()
    Write-Host $output
    if ($output -notmatch 'HTTP_STATUS:2\d\d(\s|$)') {
        throw "Health check failed for $Url (is the service running?)"
    }
}

function Invoke-OcrProcess {
    param(
        [string]$Url,
        [string]$ImagePath
    )
    if (-not (Test-Path $ImagePath)) {
        throw "Image not found: $ImagePath"
    }
    $resolved = (Resolve-Path -LiteralPath $ImagePath).Path -replace '\\', '/'
    Write-Host "POST $Url"
    Write-Host "  file: $resolved"
    $lines = & curl.exe -sS -w "`nHTTP_STATUS:%{http_code}" -X POST $Url `
        -F "file=@$resolved" `
        -F "page_index=1" `
        -F "mode=balanced" `
        -F "lang=ch"
    $output = ($lines | Out-String).TrimEnd()
    Write-Host $output
    if ($output -match 'HTTP_STATUS:422') {
        throw "OCR process failed: Python did not receive the file field (422). Restart backend after code changes."
    }
    if ($output -match 'HTTP_STATUS:400' -and $output -match 'Invalid HTTP request') {
        throw "OCR process failed: malformed proxy request (400). Restart backend and ensure OCR service is on port 5002."
    }
    if ($output -notmatch 'HTTP_STATUS:2\d\d(\s|$)' -and $output -notmatch 'HTTP_STATUS:503(\s|$)') {
        throw "OCR process failed for $Url"
    }
    if ($output -match 'HTTP_STATUS:503') {
        Write-Host "Proxy OK - upstream PaddleOCR returned 503 (engine issue, not multipart)." -ForegroundColor Yellow
    }
}

switch ($Target) {
    "python" {
        Invoke-HealthCheck "$OcrBase/health"
        if ($ImagePath) {
            Invoke-OcrProcess "$OcrBase/api/ocr/process" $ImagePath
        }
    }
    "java" {
        Invoke-HealthCheck "$BackendBase/api/v1/ocr/health"
        if ($ImagePath) {
            Invoke-OcrProcess "$BackendBase/api/v1/ocr/process" $ImagePath
        }
    }
}

Write-Host "Done."
