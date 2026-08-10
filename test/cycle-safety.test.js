'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateNextCycleDelayMs, runCycleTasksSafely } = require('../dist/bot');

test('slow cycles still wait a full monitoring interval before the next cycle', () => {
  const thirtyMinutes = 30 * 60 * 1000;
  assert.equal(calculateNextCycleDelayMs(thirtyMinutes, 5 * 60 * 1000), thirtyMinutes);
  assert.equal(calculateNextCycleDelayMs(thirtyMinutes, 45 * 60 * 1000), thirtyMinutes);
});

test('a failed asset is recorded and does not stop the next asset', async () => {
  const executed = [];
  const failures = [];
  const outcomes = await runCycleTasksSafely([
    { asset: 'IRON', run: async () => { executed.push('IRON'); throw new Error('incomplete market snapshot'); } },
    { asset: 'COPPER', run: async () => { executed.push('COPPER'); } },
  ], async (asset, error) => failures.push([asset, error.message]));

  assert.deepEqual(executed, ['IRON', 'COPPER']);
  assert.deepEqual(failures, [['IRON', 'incomplete market snapshot']]);
  assert.deepEqual(outcomes, [
    { asset: 'IRON', ok: false, error: 'incomplete market snapshot' },
    { asset: 'COPPER', ok: true },
  ]);
});

test('each configured asset task runs exactly once in deterministic order', async () => {
  const executed = [];
  const outcomes = await runCycleTasksSafely([
    { asset: 'FOOD', run: async () => executed.push('FOOD') },
    { asset: 'FUEL', run: async () => executed.push('FUEL') },
    { asset: 'AMMO', run: async () => executed.push('AMMO') },
  ], async () => assert.fail('failure callback must not run'));

  assert.deepEqual(executed, ['FOOD', 'FUEL', 'AMMO']);
  assert.deepEqual(outcomes, [
    { asset: 'FOOD', ok: true },
    { asset: 'FUEL', ok: true },
    { asset: 'AMMO', ok: true },
  ]);
});
