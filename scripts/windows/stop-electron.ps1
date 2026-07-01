#Requires -Version 5.1
<#
.SYNOPSIS
  Stop Electron dev (Vite renderer on :5174 and related Electron processes).
#>
param(
    [int]$RendererPort = 5174
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$electronDist = Join-Path $repoRoot "frontend\electron\node_modules\electron\dist"

function Get-ListenerPids {
    param([int]$ListenPort)
    $pids = @()
    netstat -ano | Select-String ":$ListenPort\s" | ForEach-Object {
        $line = $_.Line.Trim()
        if ($line -match 'LISTENING\s+(\d+)\s*$') {
            $pids += [int]$Matches[1]
        }
    }
    return $pids | Sort-Object -Unique
}

$stopped = @()

foreach ($procId in (Get-ListenerPids -ListenPort $RendererPort)) {
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        Write-Host "Stopping PID $procId ($($proc.ProcessName)) on port $RendererPort ..."
        Stop-Process -Id $procId -Force
        $stopped += $procId
    } catch {
        Write-Warning "Could not stop PID ${procId}: $($_.Exception.Message)"
    }
}

Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Path -and $_.Path.StartsWith($electronDist, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "Stopping Electron PID $($_.Id) ..."
        Stop-Process -Id $_.Id -Force
        $stopped += $_.Id
    }
}

Start-Sleep -Seconds 1
$remaining = Get-ListenerPids -ListenPort $RendererPort
if ($remaining.Count -gt 0) {
    Write-Error "Port $RendererPort still in use by: $($remaining -join ', ')"
}

if ($stopped.Count -eq 0) {
    Write-Host "No Electron dev processes found (port $RendererPort is free)."
} else {
    Write-Host "Electron dev stopped. Port $RendererPort is free — run dev-electron.ps1 now."
}
