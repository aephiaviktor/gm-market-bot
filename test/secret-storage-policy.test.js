'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SENSITIVE_CONFIG_KEYS,
  mergeSensitiveConfig,
  redactConfigForRenderer,
  splitSensitiveConfig,
} = require('../electron/secret-storage-policy');

const REDACTED = '••••••••';

test('sensitive settings are split from renderer-safe settings', () => {
  const source = {
    AEPHIA_API_KEY: 'aephia-secret',
    HOT_WALLET_SECRET: '[1,2,3]',
    RPC_URL: 'https://rpc.example/?api-key=rpc-secret',
    CHECK_INTERVAL_MINUTES: '5',
  };

  const { publicConfig, sensitiveConfig } = splitSensitiveConfig(source);

  assert.deepEqual(sensitiveConfig, {
    AEPHIA_API_KEY: 'aephia-secret',
    HOT_WALLET_SECRET: '[1,2,3]',
    RPC_URL: 'https://rpc.example/?api-key=rpc-secret',
  });
  assert.deepEqual(publicConfig, { CHECK_INTERVAL_MINUTES: '5' });
  assert.deepEqual(SENSITIVE_CONFIG_KEYS, [
    'AEPHIA_API_KEY',
    'RPC_URL',
    'RPC_URL_FALLBACK',
    'HOT_WALLET_SECRET',
  ]);
});

test('renderer receives only configured placeholders, never stored secrets', () => {
  const redacted = redactConfigForRenderer({
    AEPHIA_API_KEY: 'aephia-secret',
    HOT_WALLET_SECRET: '[1,2,3]',
    RPC_URL: '',
    CHECK_INTERVAL_MINUTES: '5',
  });

  assert.deepEqual(redacted, {
    AEPHIA_API_KEY: REDACTED,
    HOT_WALLET_SECRET: REDACTED,
    RPC_URL: '',
    CHECK_INTERVAL_MINUTES: '5',
  });
  assert.equal(JSON.stringify(redacted).includes('aephia-secret'), false);
  assert.equal(JSON.stringify(redacted).includes('[1,2,3]'), false);
});

test('blank or redacted sensitive submissions preserve stored values', () => {
  const stored = {
    AEPHIA_API_KEY: 'old-aephia',
    HOT_WALLET_SECRET: 'old-wallet',
    RPC_URL: 'old-rpc',
  };

  assert.deepEqual(mergeSensitiveConfig(stored, {
    AEPHIA_API_KEY: REDACTED,
    HOT_WALLET_SECRET: '',
    RPC_URL: 'new-rpc',
  }), {
    AEPHIA_API_KEY: 'old-aephia',
    HOT_WALLET_SECRET: 'old-wallet',
    RPC_URL: 'new-rpc',
    RPC_URL_FALLBACK: '',
  });
});
