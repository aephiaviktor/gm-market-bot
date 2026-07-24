'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
