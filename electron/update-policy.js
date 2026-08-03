'use strict';

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1;
    if ((left[index] || 0) < (right[index] || 0)) return -1;
  }
  return 0;
}

function normalizeDependencySpecs(packageJson) {
  const sortEntries = (value) => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  return {
    dependencies: sortEntries(packageJson?.dependencies),
    devDependencies: sortEntries(packageJson?.devDependencies),
    optionalDependencies: sortEntries(packageJson?.optionalDependencies),
  };
}

function dependencySpecsChanged(currentPackage, nextPackage) {
  return JSON.stringify(normalizeDependencySpecs(currentPackage))
    !== JSON.stringify(normalizeDependencySpecs(nextPackage));
}

function dependencyInstallRequired(currentPackage, nextPackage, currentLockfile, nextLockfile) {
  return dependencySpecsChanged(currentPackage, nextPackage)
    || String(currentLockfile || '') !== String(nextLockfile || '');
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildWindowsDependencyUpdateScript({ appRoot, parentPid, taskName = 'GM Market Bot' }) {
  const root = quotePowerShellLiteral(appRoot);
  const task = quotePowerShellLiteral(taskName);
  const pid = Number.parseInt(String(parentPid), 10);
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('A positive parent process id is required for the dependency updater.');
  }

  return [
    '$ErrorActionPreference = "Stop"',
    `$appRoot = ${root}`,
    `$parentPid = ${pid}`,
    `$taskName = ${task}`,
    '$logDir = Join-Path $env:LOCALAPPDATA "GMMarketBot\\logs"',
    '$logFile = Join-Path $logDir "updater.log"',
    'New-Item -ItemType Directory -Force -Path $logDir | Out-Null',
    'function Write-UpdateLog([string]$message) {',
    '  Add-Content -Path $logFile -Value ("{0:o} {1}" -f (Get-Date), $message)',
    '}',
    'function Invoke-UpdateCommand([string]$command, [string[]]$arguments) {',
    '  Write-UpdateLog ("Running: {0} {1}" -f $command, ($arguments -join " "))',
    '  & $command @arguments *>> $logFile',
    '  if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }',
    '}',
    'try {',
    '  Write-UpdateLog "Waiting for GM Market Bot to exit"',
    '  Wait-Process -Id $parentPid -ErrorAction SilentlyContinue',
    '  Set-Location $appRoot',
    '  Invoke-UpdateCommand "npm.cmd" @("install", "--no-audit", "--no-fund")',
    '  $electronExe = Join-Path $appRoot "node_modules\\electron\\dist\\electron.exe"',
    '  if (-not (Test-Path $electronExe)) {',
    '    Invoke-UpdateCommand "node.exe" @("node_modules\\electron\\install.js")',
    '  }',
    '  Invoke-UpdateCommand "npm.cmd" @("run", "build")',
    '  Write-UpdateLog "Waiting for scheduled task to become Ready"',
    '  $taskReadyDeadline = [DateTime]::UtcNow.AddSeconds(30)',
    '  while ($true) {',
    '    $taskState = (Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State',
    '    if ($taskState -eq "Ready") { break }',
    '    if ([DateTime]::UtcNow -ge $taskReadyDeadline) {',
    '      throw "Timed out waiting for scheduled task $taskName to become Ready; current state: $taskState"',
    '    }',
    '    Start-Sleep -Milliseconds 250',
    '  }',
    '  Write-UpdateLog "Scheduled task is Ready"',
    '  Write-UpdateLog "Dependency update completed; starting GM Market Bot"',
    '  Invoke-UpdateCommand "schtasks.exe" @("/Run", "/TN", $taskName)',
    '} catch {',
    '  Write-UpdateLog ("Update failed: " + $_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\r\n');
}

function scheduleRelaunch(app, delayMs = 750, schedule = setTimeout) {
  schedule(() => {
    app.relaunch();
    app.exit(0);
  }, delayMs);
}

module.exports = {
  buildWindowsDependencyUpdateScript,
  compareVersions,
  dependencyInstallRequired,
  dependencySpecsChanged,
  normalizeVersion,
  scheduleRelaunch,
};
