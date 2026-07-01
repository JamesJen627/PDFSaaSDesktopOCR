#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure Gradle wrapper distribution is present (helps on slow or blocked networks).

.DESCRIPTION
  Official Gradle download often times out on slow links. This script tries several
  mirrors, then places the zip where gradlew expects it under %USERPROFILE%\.gradle\wrapper\dists.

  After success, run: .\gradlew.bat :stirling-pdf:bootRun
#>
param(
    [string]$GradleVersion = "9.6.0",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-GradleDistHash {
    param([string]$Url)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Url)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($bytes)
    } finally {
        $sha256.Dispose()
    }
    return ([BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
}

function Get-GradleDistDir {
    param([string]$Version, [string]$Url)
    $name = "gradle-$Version-bin"
    $hash = Get-GradleDistHash -Url $Url
    return Join-Path $env:USERPROFILE ".gradle\wrapper\dists\$name\$hash"
}

function Test-GradleInstalled {
    param([string]$DistDir, [string]$Version)
    $gradleHome = Join-Path $DistDir "gradle-$Version"
    return (Test-Path (Join-Path $gradleHome "bin\gradle.bat"))
}

$officialUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
$mirrorUrls = @(
    $officialUrl
    "https://repo.huaweicloud.com/gradle/gradle-$GradleVersion-bin.zip"
    "https://mirrors.cloud.tencent.com/gradle/gradle-$GradleVersion-bin.zip"
)

$distDir = Get-GradleDistDir -Version $GradleVersion -Url $officialUrl
$zipPath = Join-Path $distDir "gradle-$GradleVersion-bin.zip"

if ((Test-GradleInstalled -DistDir $distDir -Version $GradleVersion) -and -not $Force) {
    Write-Host "Gradle $GradleVersion wrapper dist already installed: $distDir"
    exit 0
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if ((Test-Path $zipPath) -and -not $Force) {
    Write-Host "Zip already present: $zipPath"
} else {
    $downloaded = $false
    foreach ($url in $mirrorUrls) {
        Write-Host "Downloading Gradle $GradleVersion from $url ..."
        try {
            # BITS is more reliable than Invoke-WebRequest on some Windows networks.
            Start-BitsTransfer -Source $url -Destination $zipPath -ErrorAction Stop
            if ((Test-Path $zipPath) -and ((Get-Item $zipPath).Length -gt 1MB)) {
                $downloaded = $true
                Write-Host "Download OK: $zipPath"
                break
            }
        } catch {
            Write-Warning "Failed: $($_.Exception.Message)"
            if (Test-Path $zipPath) {
                Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if (-not $downloaded) {
        Write-Error @"
Could not download Gradle $GradleVersion from any mirror.

Manual steps:
  1. Download gradle-$GradleVersion-bin.zip in a browser (official or mirror).
  2. Save to: $zipPath
  3. Re-run this script or: .\gradlew.bat :stirling-pdf:bootRun
"@
    }
}

if (-not (Test-GradleInstalled -DistDir $distDir -Version $GradleVersion)) {
    Write-Host "Extracting Gradle ..."
    Expand-Archive -Path $zipPath -DestinationPath $distDir -Force
}

if (Test-GradleInstalled -DistDir $distDir -Version $GradleVersion) {
    Write-Host "Gradle $GradleVersion ready. Run: .\gradlew.bat :stirling-pdf:bootRun"
    exit 0
}

Write-Error "Gradle extraction failed. Check $distDir"
