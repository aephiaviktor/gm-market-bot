$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP ("gm-market-bot-supervisor-test-" + [guid]::NewGuid().ToString('N'))
$appDir = Join-Path $root 'app'
$runtimeDir = Join-Path $root 'runtime'
$logDir = Join-Path $root 'logs'
$supervisor = Join-Path $PSScriptRoot '..\ops\gm-market-bot-supervisor.ps1'

try {
    New-Item -ItemType Directory -Force -Path $appDir, $runtimeDir, $logDir | Out-Null
    $fakeExecutable = Join-Path $appDir 'GM Market Bot.exe'
    Copy-Item "$env:WINDIR\System32\whoami.exe" $fakeExecutable
    $targetVersion = (Get-Item $fakeExecutable).VersionInfo.ProductVersion

    @{
        targetVersion = $targetVersion
        installDirectory = $appDir
        requestedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content (Join-Path $runtimeDir 'update-restart-requested.json') -Encoding UTF8

    & $supervisor `
        -AppDir $appDir `
        -RuntimeDir $runtimeDir `
        -LogDir $logDir `
        -RestartDelay 1 `
        -MaximumRestarts 1 `
        -UpdateWaitSeconds 10
    if ($LASTEXITCODE -ne 0) { throw "Supervisor exited with $LASTEXITCODE" }

    $marker = Join-Path $runtimeDir 'update-restart-requested.json'
    $log = Get-Content (Join-Path $logDir 'supervisor.log') -Raw
    if (Test-Path $marker) { throw 'Supervisor did not consume the update marker.' }
    if ($log -notmatch 'Updated executable version .* is ready; restarting under supervision') {
        throw 'Supervisor did not perform the supervised update restart.'
    }
    if ($log -notmatch 'Clean exit; supervisor stopping') {
        throw 'Supervisor did not preserve normal clean-exit behavior after the update restart.'
    }

    Write-Output "Windows supervisor update handshake passed for target version $targetVersion"
} finally {
    if (Test-Path $root) { Remove-Item $root -Recurse -Force }
}
