#Requires -Version 5.1
<#
.SYNOPSIS
  Stop the Java backend listening on port 8080 (releases H2 database lock).
#>
param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

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

$listenerPids = Get-ListenerPids -ListenPort $Port
if ($listenerPids.Count -eq 0) {
    Write-Host "No process listening on port $Port."
    exit 0
}

foreach ($procId in $listenerPids) {
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        Write-Host "Stopping PID $procId ($($proc.ProcessName)) on port $Port ..."
        Stop-Process -Id $procId -Force
    } catch {
        Write-Warning "Could not stop PID ${procId}: $($_.Exception.Message)"
    }
}

Start-Sleep -Seconds 2
$remaining = Get-ListenerPids -ListenPort $Port
if ($remaining.Count -gt 0) {
    Write-Error "Port $Port still in use by: $($remaining -join ', ')"
}

Write-Host "Port $Port is free. H2 lock released — you can run dev-backend.ps1 now."
