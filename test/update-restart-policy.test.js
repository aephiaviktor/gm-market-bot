const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  buildUpdateRestartRequest,
  consumeSatisfiedUpdateRestartRequest,
  getPackagedInstallDirectory,
  getUpdateRestartRequestPath,
  writeUpdateRestartRequest,
} = require('../electron/update-restart-policy');

test('packaged install directory is the directory containing the running executable', () => {
  assert.equal(
    getPackagedInstallDirectory('C:\\Apps\\gm-market-bot\\GM Market Bot.exe'),
    path.win32.join('C:\\Apps', 'gm-market-bot'),
  );
});

test('update restart marker lives in persistent runtime data and records the target', () => {
  const runtimeDir = path.join('C:\\Users\\Viktor\\AppData\\Local', 'GMMarketBot', 'data');
  assert.equal(
    getUpdateRestartRequestPath(runtimeDir),
    path.join(runtimeDir, 'update-restart-requested.json'),
  );
  assert.deepEqual(
    buildUpdateRestartRequest({
      targetVersion: '0.3.37',
      installDirectory: 'C:\\Apps\\gm-market-bot',
      requestedAt: '2026-08-04T18:40:00.000Z',
    }),
    {
      targetVersion: '0.3.37',
      installDirectory: 'C:\\Apps\\gm-market-bot',
      requestedAt: '2026-08-04T18:40:00.000Z',
    },
  );
});

test('the updated app consumes only its own satisfied restart marker', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-update-restart-'));
  const installDirectory = path.join(runtimeDir, 'app');
  const requestPath = writeUpdateRestartRequest({
    runtimeDir,
    targetVersion: '0.3.43',
    installDirectory,
  });

  assert.equal(consumeSatisfiedUpdateRestartRequest({
    runtimeDir,
    currentVersion: '0.3.42',
    installDirectory,
  }), false);
  assert.equal(fs.existsSync(requestPath), true);

  assert.equal(consumeSatisfiedUpdateRestartRequest({
    runtimeDir,
    currentVersion: '0.3.43',
    installDirectory,
  }), true);
  assert.equal(fs.existsSync(requestPath), false);
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});
