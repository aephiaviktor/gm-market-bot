'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  callRpcWithFallback,
  callRpcWithRateLimitRetry,
  getRpcLimiterBucketName,
  isRpcLimiterLockContentionError,
  isRpcRateLimitError,
  RpcRequestRateLimiter,
} = require('../dist/bot');
function createLimiterSpy() {
  const calls = [];
  return {
    calls,
    async wait(...args) { calls.push(args); },
  };
}

test('transaction submission alone uses the shared transaction bucket', () => {
  assert.equal(getRpcLimiterBucketName('sendRawTransaction'), 'tx:shared');
  for (const method of ['getLatestBlockhash', 'confirmTransaction', 'getAccountInfo', 'getSlot']) {
    assert.equal(getRpcLimiterBucketName(method), 'rpc:shared');
  }
});

test('RPC retry classification recognizes rate limits without swallowing unrelated failures', () => {
  assert.equal(isRpcRateLimitError(new Error('HTTP 429 Too Many Requests')), true);
  assert.equal(isRpcRateLimitError({ code: -32005, message: 'rate limit exceeded' }), true);
  assert.equal(isRpcRateLimitError(new Error('blockhash not found')), false);
  assert.equal(isRpcRateLimitError(new Error('transaction simulation failed')), false);
});

test('RPC failover runs only after primary failure and returns the fallback result', async () => {
  const calls = [];
  const value = await callRpcWithFallback(
    async () => {
      calls.push('primary');
      throw new Error('primary unavailable');
    },
    async () => {
      calls.push('fallback');
      return 'fallback-result';
    },
  );

  assert.equal(value, 'fallback-result');
  assert.deepEqual(calls, ['primary', 'fallback']);
});

test('RPC failover is skipped when primary succeeds and preserves fallback failure', async () => {
  let fallbackCalls = 0;
  assert.equal(await callRpcWithFallback(
    async () => 'primary-result',
    async () => { fallbackCalls += 1; return 'fallback-result'; },
  ), 'primary-result');
  assert.equal(fallbackCalls, 0);

  await assert.rejects(() => callRpcWithFallback(
    async () => { throw new Error('primary unavailable'); },
    async () => { throw new Error('fallback unavailable'); },
  ), /fallback unavailable/);
});

test('shared limiter serializes concurrent waits and retries transient lock contention', async () => {
  let activeWaits = 0;
  let maxActiveWaits = 0;
  let attempts = 0;
  const sharedLimiter = {
    async wait() {
      attempts += 1;
      activeWaits += 1;
      maxActiveWaits = Math.max(maxActiveWaits, activeWaits);
      await new Promise((resolve) => setImmediate(resolve));
      activeWaits -= 1;
      if (attempts === 1) {
        const error = new Error('Lock file is already being held');
        error.code = 'ELOCKED';
        throw error;
      }
      return { provider: 'main' };
    },
  };
  const limiter = new RpcRequestRateLimiter(
    () => 1000,
    { info() {}, warn() {}, error() {} },
    () => true,
    'GM Market Bot',
    'default',
    { sharedLimiter, lockRetryDelaysMs: [0], sleepFn: async () => {} },
  );

  const results = await Promise.all([
    limiter.waitForProvider('orders-a'),
    limiter.waitForProvider('orders-b'),
  ]);

  assert.equal(maxActiveWaits, 1);
  assert.equal(attempts, 3);
  assert.deepEqual(results, [{ provider: 'main' }, { provider: 'main' }]);
});

test('shared limiter lock classification is narrow', () => {
  const locked = new Error('Lock file is already being held');
  locked.code = 'ELOCKED';
  assert.equal(isRpcLimiterLockContentionError(locked), true);
  assert.equal(isRpcLimiterLockContentionError(new Error('RPC timeout')), false);
});

test('RPC retries a rate limit with the same bucket and does not retry unrelated failures', async () => {
  const limiter = createLimiterSpy();
  const warnings = [];
  let attempts = 0;
  const value = await callRpcWithRateLimitRetry(
    'send',
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('HTTP 429 Too Many Requests');
      return 'ok';
    },
    limiter,
    { info() {}, warn(message) { warnings.push(message); }, error() {} },
    'tx:shared',
    'sendRawTransaction',
    { retryDelaysMs: [0], sleepFn: async () => {} },
  );

  assert.equal(value, 'ok');
  assert.equal(attempts, 2);
  assert.deepEqual(limiter.calls.map((call) => call.slice(1)), [
    ['tx:shared', 'sendRawTransaction'],
    ['tx:shared', 'sendRawTransaction'],
  ]);
  assert.equal(warnings.length, 1);

  let unrelatedAttempts = 0;
  await assert.rejects(() => callRpcWithRateLimitRetry(
    'read',
    async () => {
      unrelatedAttempts += 1;
      throw new Error('account not found');
    },
    createLimiterSpy(),
    { info() {}, warn() {}, error() {} },
    'rpc:shared',
    'getAccountInfo',
    { retryDelaysMs: [0], sleepFn: async () => {} },
  ), /account not found/);
  assert.equal(unrelatedAttempts, 1);
});
