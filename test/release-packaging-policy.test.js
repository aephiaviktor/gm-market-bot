const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Windows updater pins NSIS to the running install directory and delegates restart to the supervisor', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  assert.match(mainSource, /const installDirectory = getPackagedInstallDirectory\(process\.execPath\)/);
  assert.match(mainSource, /autoUpdater\.installDirectory = installDirectory/);
  assert.match(mainSource, /writeUpdateRestartRequest\(/);
  assert.match(mainSource, /autoUpdater\.quitAndInstall\(true, false\)/);
  assert.doesNotMatch(mainSource, /autoUpdater\.quitAndInstall\(true, true\)/);
});

test('canonical supervisor consumes the update marker and waits for the target executable version', () => {
  const supervisorSource = fs.readFileSync(path.join(__dirname, '../ops/gm-market-bot-supervisor.ps1'), 'utf8');
  assert.match(supervisorSource, /update-restart-requested\.json/);
  assert.match(supervisorSource, /Test-TargetVersion/);
  assert.match(supervisorSource, /target\.Revision -ge 0/);
  assert.match(supervisorSource, /Remove-Item/);
  assert.match(supervisorSource, /continue/);

  const workflowSource = fs.readFileSync(path.join(__dirname, '../.github/workflows/windows-release.yml'), 'utf8');
  assert.match(workflowSource, /test\/windows-supervisor-handshake\.ps1/);
});

test('tag workflow creates one draft before uploading the complete Windows asset set', () => {
  const workflowSource = fs.readFileSync(path.join(__dirname, '../.github/workflows/windows-release.yml'), 'utf8');
  const createIndex = workflowSource.indexOf('gh release create');
  const uploadIndex = workflowSource.indexOf('gh release upload');

  assert.doesNotMatch(workflowSource, /npm run release:win/);
  assert.match(workflowSource, /npm run dist:win/);
  assert.ok(createIndex >= 0, 'workflow must create the draft release explicitly');
  assert.ok(uploadIndex > createIndex, 'workflow must create the draft before uploading assets');
  assert.match(workflowSource, /--verify-tag/);
  assert.match(workflowSource, /Move-Item .*GM Market Bot Setup \$version\.exe.*GM-Market-Bot-Setup-\$version\.exe/);
  assert.match(workflowSource, /Move-Item .*GM Market Bot Setup \$version\.exe\.blockmap.*GM-Market-Bot-Setup-\$version\.exe\.blockmap/);
  assert.match(workflowSource, /release\/GM-Market-Bot-Setup-\$version\.exe/);
  assert.match(workflowSource, /release\/GM-Market-Bot-Setup-\$version\.exe\.blockmap/);
  assert.match(workflowSource, /latest\.yml/);
});

test('NSIS package is one-click and has no installation-directory wizard', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.build.nsis.oneClick, true);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, false);
});
