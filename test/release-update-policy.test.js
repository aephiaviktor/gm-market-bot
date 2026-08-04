'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { determineReleaseAction } = require('../electron/release-update-policy');

test('older installed versions update to the latest official release', () => {
  assert.equal(determineReleaseAction('0.3.32', '0.3.33').action, 'update');
});

test('local prerelease patches restore while the previous official release is latest', () => {
  assert.equal(determineReleaseAction('0.3.33-local.2', '0.3.32').action, 'restore');
});

test('local prerelease patches update normally when their stable release is published', () => {
  assert.equal(determineReleaseAction('0.3.33-local.2', '0.3.33').action, 'update');
});

test('SLYA-style local versions sort between adjacent official versions', () => {
  assert.equal(determineReleaseAction('0.7.35-239.local.1', '0.7.35-239').action, 'restore');
  assert.equal(determineReleaseAction('0.7.35-239.local.1', '0.7.35-240').action, 'update');
});

test('matching official versions need no action', () => {
  assert.equal(determineReleaseAction('v0.3.32', '0.3.32').action, 'none');
});
