'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  migrateLegacyRuntimeData,
  resolveRuntimeDataDir,
} = require('../electron/runtime-data-policy');

test('runtime data lives outside replaceable application files', () => {
  assert.equal(
    resolveRuntimeDataDir({ localAppData: 'C:\\Users\\Viktor\\AppData\\Local' }),
    path.join('C:\\Users\\Viktor\\AppData\\Local', 'GMMarketBot', 'data'),
  );
});

test('legacy runtime files are copied once without overwriting persistent data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gm-runtime-data-'));
  const legacyDir = path.join(root, 'app', 'analysis');
  const targetDir = path.join(root, 'persistent');
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(path.join(legacyDir, 'bot-state.json'), '{"legacy":true}');
  await fs.writeFile(path.join(legacyDir, 'orders-log.jsonl'), 'legacy-log\n');
  await fs.writeFile(path.join(legacyDir, 'ignored.txt'), 'do not migrate');

  const first = await migrateLegacyRuntimeData({ legacyDir, targetDir });
  assert.deepEqual(first.copied.sort(), ['bot-state.json', 'orders-log.jsonl']);
  assert.equal(await fs.readFile(path.join(targetDir, 'bot-state.json'), 'utf8'), '{"legacy":true}');
  await assert.rejects(fs.access(path.join(targetDir, 'ignored.txt')));

  await fs.writeFile(path.join(targetDir, 'bot-state.json'), '{"persistent":true}');
  const second = await migrateLegacyRuntimeData({ legacyDir, targetDir });
  assert.deepEqual(second.copied, []);
  assert.equal(await fs.readFile(path.join(targetDir, 'bot-state.json'), 'utf8'), '{"persistent":true}');
});
