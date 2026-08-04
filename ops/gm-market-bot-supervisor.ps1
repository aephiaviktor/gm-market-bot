param(
    [string]$AppDir = "C:\Apps\gm-market-bot",
    [string]$RuntimeDir = (Join-Path $env:LOCALAPPDATA "GMMarketBot\data"),
    [string]$LogDir = (Join-Path $env:LOCALAPPDATA "GMMarketBot\logs"),
    [int]$RestartDelay = 60,
    [int]$MaximumRestarts = 10,
    [int]$UpdateWaitSeconds = 300
)

$ErrorActionPreference = "Stop"
$executable = Join-Path $AppDir "GM Market Bot.exe"
$restartCount = 0
$updateRestartRequest = Join-Path $RuntimeDir "update-restart-requested.json"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "supervisor.log"

function Write-Log {
    param([string]$Message)
    Add-Content -Path $logFile -Value ("{0:o} {1}" -f (Get-Date), $Message)
}

function Wait-ForUpdatedExecutable {
    param([string]$TargetVersion)
    $deadline = (Get-Date).AddSeconds($UpdateWaitSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $executable) {
            try {
                $installedVersion = (Get-Item $executable).VersionInfo.ProductVersion
                if (-not $TargetVersion -or ([version]$installedVersion -eq [version]$TargetVersion)) {
                    return $true
                }
            } catch {
                Write-Log "Updated executable is not ready yet: $($_.Exception.Message)"
            }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

while ($true) {
    if (-not (Test-Path $executable)) { Write-Log "Packaged executable missing: $executable"; exit 2 }
    Write-Log "Starting packaged GM Market Bot"
    $process = Start-Process -FilePath $executable -WorkingDirectory $AppDir -PassThru
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    Write-Log "Packaged app exited with code $exitCode"

    if ($exitCode -eq 0 -and (Test-Path $updateRestartRequest)) {
        try {
            $request = Get-Content $updateRestartRequest -Raw | ConvertFrom-Json
            $targetVersion = [string]$request.targetVersion
            Write-Log "Update restart requested for version $targetVersion; waiting for replacement executable."
            if (-not (Wait-ForUpdatedExecutable -TargetVersion $targetVersion)) {
                Write-Log "Timed out waiting for updated executable version $targetVersion."
                exit 3
            }
            Remove-Item $updateRestartRequest -Force
            $restartCount = 0
            Write-Log "Updated executable version $targetVersion is ready; restarting under supervision."
            continue
        } catch {
            Write-Log "Update restart request failed: $($_.Exception.Message)"
            exit 4
        }
    }

    if ($exitCode -eq 0) { Write-Log "Clean exit; supervisor stopping."; exit 0 }
    $restartCount++
    if ($restartCount -gt $MaximumRestarts) { Write-Log "Restart limit reached."; exit 1 }
    Write-Log "Crash detected; restart $restartCount/$MaximumRestarts in $RestartDelay seconds."
    Start-Sleep -Seconds $RestartDelay
}
