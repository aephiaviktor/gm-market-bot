const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Windows updater installs silently and restarts the application', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  assert.match(mainSource, /autoUpdater\.quitAndInstall\(true, true\)/);
  assert.doesNotMatch(mainSource, /autoUpdater\.quitAndInstall\(false, true\)/);
});

test('NSIS package is one-click and has no installation-directory wizard', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.build.nsis.oneClick, true);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, false);
});
