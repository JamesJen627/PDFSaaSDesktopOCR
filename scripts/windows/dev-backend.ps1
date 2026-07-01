#Requires -Version 5.1
<#
.SYNOPSIS
  Start Stirling Java backend (port 8080) for OCR proxy testing.

.PARAMETER Port
  HTTP port (default 8080).

.PARAMETER RequireLogin
  When set, keeps security.enableLogin=true (API calls need JWT). Default: off for local OCR dev.

.PARAMETER SkipGradleCheck
  Skip ensure-gradle.ps1 preflight.
#>
param(
    [int]$Port = 8080,
    [switch]$RequireLogin,
    [switch]$SkipGradleCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Test-JavaHome {
    param([string]$JavaHomePath)
    return $JavaHomePath -and (Test-Path (Join-Path $JavaHomePath "bin\java.exe"))
}

function Get-JavaVersionMajor {
    param([string]$JavaHomePath)
    $javaExe = Join-Path $JavaHomePath "bin\java.exe"
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & $javaExe -version 2>&1 | Out-String
    $ErrorActionPreference = $saved
    if ($output -match 'version "(\d+)') {
        return [int]$Matches[1]
    }
    return 0
}

function Find-JavaHome {
    $seen = @{}

    function Add-Candidate {
        param(
            [string]$JavaHomePath,
            [switch]$AllowAndroidJbr
        )
        if (-not (Test-JavaHome $JavaHomePath)) { return }
        if ($JavaHomePath -match "Android Studio\\jbr" -and -not $AllowAndroidJbr) { return }
        $seen[$JavaHomePath] = Get-JavaVersionMajor $JavaHomePath
    }

    # Gradle toolchain auto-download (from a prior successful build)
    $gradleJdkRoot = Join-Path $env:USERPROFILE ".gradle\jdks"
    if (Test-Path $gradleJdkRoot) {
        Get-ChildItem -Path $gradleJdkRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Add-Candidate $_.FullName }
    }

    if (Test-JavaHome $env:JAVA_HOME) {
        Add-Candidate $env:JAVA_HOME
    }

    $patterns = @(
        "C:\Program Files\Eclipse Adoptium\jdk-25*",
        "C:\Program Files\Microsoft\jdk-25*",
        "C:\Program Files\Java\jdk-25*",
        "C:\Program Files\Amazon Corretto\jdk25*",
        "C:\Program Files\Eclipse Adoptium\jdk-21*",
        "C:\Program Files\Microsoft\jdk-21*",
        "C:\Program Files\Java\jdk-21*",
        "C:\Program Files\Amazon Corretto\jdk21*"
    )

    foreach ($pattern in $patterns) {
        Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Add-Candidate $_.FullName }
    }

    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) {
        Add-Candidate (Split-Path (Split-Path $javaCmd.Source -Parent) -Parent)
    }

    # Last resort: Android Studio bundled JBR (Gradle may still use its own JDK 25 toolchain)
    if (Test-JavaHome $env:JAVA_HOME) {
        Add-Candidate $env:JAVA_HOME -AllowAndroidJbr
    }
    Add-Candidate "C:\Program Files\Android\Android Studio\jbr" -AllowAndroidJbr

    if ($seen.Count -eq 0) {
        return $null
    }

    return ($seen.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
}

$javaHome = Find-JavaHome
if (-not $javaHome) {
    Write-Error @"
Java (JDK 25 recommended) not found.

Install one of:
  - Eclipse Temurin JDK 25: https://adoptium.net/
  - Microsoft Build of OpenJDK 25

Then either:
  - Add JAVA_HOME and %JAVA_HOME%\bin to PATH, or
  - Run a Gradle build once (it may download JDK 25 to %USERPROFILE%\.gradle\jdks), or
  - Re-run this script (it searches Gradle cache + common install paths).

Verify: java -version
"@
}

$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;" + $env:Path

Write-Host "Using JAVA_HOME=$javaHome"
if ($javaHome -match "Android Studio\\jbr") {
    Write-Host "Note: using Android Studio JBR. For best results install Temurin JDK 25 or rely on Gradle cached JDK under %USERPROFILE%\.gradle\jdks" -ForegroundColor Yellow
}
$saved = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& java -version 2>&1 | ForEach-Object { Write-Host $_ }
$ErrorActionPreference = $saved

if (-not $SkipGradleCheck) {
    $ensureGradle = Join-Path $PSScriptRoot "ensure-gradle.ps1"
    if (Test-Path $ensureGradle) {
        & $ensureGradle
    }
}

Set-Location $repoRoot
$env:SERVER_PORT = "$Port"
$env:OCR_SERVICE_URL = if ($env:OCR_SERVICE_URL) { $env:OCR_SERVICE_URL } else { "http://127.0.0.1:5002" }

$stopScript = Join-Path $PSScriptRoot "stop-backend.ps1"
if (Test-Path $stopScript) {
    Write-Host "Checking for an existing backend on port $Port ..."
    & $stopScript -Port $Port
}

if ($RequireLogin) {
    $env:SECURITY_ENABLELOGIN = "true"
} else {
    $env:SECURITY_ENABLELOGIN = "false"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " PDFSaaS Backend (bootRun)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " URL:        http://127.0.0.1:$Port"
Write-Host " OCR proxy:  $env:OCR_SERVICE_URL"
if ($RequireLogin) {
    Write-Host " Login:      required (admin/stirling)"
} else {
    Write-Host " Login:      disabled (local dev)"
}
Write-Host ""
Write-Host " Notes:" -ForegroundColor Yellow
Write-Host " - When you see 'Stirling-PDF Started', the server is ready."
Write-Host " - Keep this window open. Press Ctrl+C to stop."
Write-Host " - Open another PowerShell window to run tests."
Write-Host " - Test: .\scripts\windows\test-ocr-proxy.ps1 -Target java -ImagePath D:\page.png"
Write-Host ""

$startedBannerPrinted = $false

function Write-ServerReadyBanner {
    if ($script:startedBannerPrinted) { return }
    $script:startedBannerPrinted = $true
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Server is RUNNING" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " URL:    http://127.0.0.1:$Port"
    Write-Host " Health: curl.exe http://127.0.0.1:$Port/api/v1/ocr/health"
    Write-Host ""
    Write-Host " No new log lines below is normal (server is waiting for requests)."
    Write-Host " This is NOT frozen. Press Ctrl+C to stop."
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
}

# --console=plain avoids Gradle bootRun progress bar stuck at ~97%.
& .\gradlew.bat --console=plain :stirling-pdf:bootRun 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line
    if ($line -match 'Stirling-PDF Started\.') {
        Write-ServerReadyBanner
    }
}
