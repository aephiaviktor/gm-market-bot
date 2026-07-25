'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isTrustedIpcEvent,
  validateAssetList,
  validateAssetsPayload,
  validateCancelOrderPayload,
  validateSettingsPayload,
} = require('../electron/ipc-security-policy');

const editableKeys = ['RPC_URL', 'HOT_WALLET_SECRET', 'CHECK_INTERVAL_MINUTES'];

test('IPC trusts only the main frame of the active application webContents', () => {
  const mainFrame = {};
  const webContents = { mainFrame };
  assert.equal(isTrustedIpcEvent({ sender: webContents, senderFrame: mainFrame }, webContents), true);
  assert.equal(isTrustedIpcEvent({ sender: webContents, senderFrame: {} }, webContents), false);
  assert.equal(isTrustedIpcEvent({ sender: {}, senderFrame: mainFrame }, webContents), false);
  assert.equal(isTrustedIpcEvent({}, webContents), false);
});

test('settings IPC accepts bounded known config and asset-rule fields', () => {
  const payload = {
    config: { RPC_URL: 'https://rpc.example', CHECK_INTERVAL_MINUTES: '5' },
    assetRules: [{ asset: 'Iron Ore', side: 'sell', enabled: true, minQuantity: '1' }],
  };
  assert.deepEqual(validateSettingsPayload(payload, editableKeys), payload);
});

test('settings IPC rejects unknown fields, oversized values, and oversized arrays', () => {
  assert.throws(
    () => validateSettingsPayload({ config: { UNKNOWN: 'x' } }, editableKeys),
    /Unknown settings field: UNKNOWN/,
  );
  assert.throws(
    () => validateSettingsPayload({ config: { RPC_URL: 'x'.repeat(4097) } }, editableKeys),
    /RPC_URL is too long/,
  );
  assert.throws(
    () => validateSettingsPayload({ config: {}, assetRules: Array.from({ length: 251 }, () => ({})) }, editableKeys),
    /assetRules exceeds 250 entries/,
  );
  assert.throws(
    () => validateSettingsPayload({ config: {}, surprise: true }, editableKeys),
    /Unknown settings payload field: surprise/,
  );
});

test('cancel-order IPC requires an exact asset and side', () => {
  assert.deepEqual(validateCancelOrderPayload({ asset: 'Iron Ore', side: 'buy' }), {
    asset: 'Iron Ore',
    side: 'buy',
  });
  assert.throws(() => validateCancelOrderPayload({ asset: '', side: 'buy' }), /asset is required/);
  assert.throws(() => validateCancelOrderPayload({ asset: 'Iron', side: 'hold' }), /side must be buy or sell/);
  assert.throws(() => validateCancelOrderPayload({ asset: 'Iron', side: 'sell', extra: 1 }), /Unknown cancel-order field: extra/);
});

test('rerun-assets IPC accepts only a bounded string array', () => {
  assert.deepEqual(validateAssetList([' Iron Ore ', 'Copper']), ['Iron Ore', 'Copper']);
  assert.throws(() => validateAssetList('Iron Ore'), /assets must be an array/);
  assert.throws(() => validateAssetList(Array.from({ length: 251 }, () => 'Iron')), /assets exceeds 250 entries/);
  assert.throws(() => validateAssetList(['x'.repeat(129)]), /asset is too long/);
  assert.deepEqual(validateAssetsPayload({ assets: ['Iron'] }), { assets: ['Iron'] });
  assert.throws(() => validateAssetsPayload({ assets: [], extra: true }), /Unknown assets payload field: extra/);
});

test('renderer CSP permits only packaged scripts and styles', () => {
  const html = fs.readFileSync(path.join(__dirname, '../electron/renderer.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'; script-src 'self'; style-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /script-src[^;]*'unsafe-inline'/);
});

test('renderer builds dynamic content without innerHTML injection sinks', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../electron/renderer.js'), 'utf8');
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
  assert.match(renderer, /\.textContent\s*=/);
});

test('application window blocks renderer navigation and new windows', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /on\('will-navigate', \(event\) => event\.preventDefault\(\)\)/);
});
