'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enqueueKeyedSerializedTask,
  enqueueSerializedTask,
  getRuleExecutionPolicy,
} = require('../dist/bot');

test('disabled rules cancel every existing order and forbid replacement', () => {
  const orders = [{ id: 'order-a' }, { id: 'order-b' }];
  assert.deepEqual(getRuleExecutionPolicy({ enabled: false }, orders), {
    cancelOrderIds: ['order-a', 'order-b'],
    shouldPlaceOrder: false,
  });
});

test('enabled rules preserve orders and permit normal placement decisions', () => {
  assert.deepEqual(getRuleExecutionPolicy({ enabled: true }, [{ id: 'order-a' }]), {
    cancelOrderIds: [],
    shouldPlaceOrder: true,
  });
});

test('serialized transaction tasks never overlap', async () => {
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = enqueueSerializedTask(Promise.resolve(), async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
    return 'first-result';
  });
  const second = enqueueSerializedTask(first.nextTail, async () => {
    events.push('second:start');
    events.push('second:end');
    return 'second-result';
  });

  await Promise.resolve();
  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  assert.equal(await first.result, 'first-result');
  assert.equal(await second.result, 'second-result');
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('serialized transaction queue recovers after a failed task', async () => {
  const first = enqueueSerializedTask(Promise.resolve(), async () => {
    throw new Error('submission failed');
  });
  const second = enqueueSerializedTask(first.nextTail, async () => 'recovered');

  await assert.rejects(first.result, /submission failed/);
  assert.equal(await second.result, 'recovered');
});

test('scheduled and rerun work for the same asset cannot overlap', async () => {
  const queues = new Map();
  const events = [];
  let releaseScheduled;
  const scheduledGate = new Promise((resolve) => { releaseScheduled = resolve; });

  const scheduled = enqueueKeyedSerializedTask(queues, 'electronics', async () => {
    events.push('scheduled:start');
    await scheduledGate;
    events.push('scheduled:end');
  });
  const rerun = enqueueKeyedSerializedTask(queues, 'electronics', async () => {
    events.push('rerun:start');
    events.push('rerun:end');
  });

  await Promise.resolve();
  assert.deepEqual(events, ['scheduled:start']);
  releaseScheduled();
  await scheduled.result;
  await rerun.result;
  assert.deepEqual(events, ['scheduled:start', 'scheduled:end', 'rerun:start', 'rerun:end']);
});

test('every asset-rule group entry point uses the keyed reconciliation queue', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(
    source,
    /async processAssetRuleGroup\(group: GroupedAssetRules\)[\s\S]{0,500}enqueueKeyedSerializedTask\([\s\S]{0,300}processAssetRuleGroupUnlocked\(group\)/,
  );
});

test('multiple buy rules are reconciled independently while duplicate sells remain blocked', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');

  assert.match(source, /private async processBuyRules\(/);
  assert.match(source, /if \(buyRules\.length > 1\) \{\s*await this\.processBuyRules\(/);
  assert.doesNotMatch(source, /SKIP_DUPLICATE_BUY_RULES/);
  assert.match(source, /SKIP_DUPLICATE_SELL_RULES/);
});
