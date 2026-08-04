const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  buildUpdateRestartRequest,
  getPackagedInstallDirectory,
  getUpdateRestartRequestPath,
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
