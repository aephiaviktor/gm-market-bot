'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyOrderFillEvents,
  normalizeLoadedState,
  removeTrackedOrder,
} = require('../dist/bot');

const MINT = 'FeorejFjRRAfusN9Fg3WjEZ1dRCf74o6xwT5vDt3R34J';
const trackedResources = [{ mint: { toBase58: () => MINT } }];

function order(id, remaining, price = 1.25, quantity = remaining) {
  return { id, uiPrice: price, orderQtyRemaining: remaining, orderQty: quantity };
}

test('legacy flat state migrates to the first tracked resource sell side', () => {
  const legacyOrder = { price: 1.25, remaining: 7, quantity: 10 };
  const state = normalizeLoadedState({ openOrders: { 'order-1': legacyOrder } }, trackedResources);

  assert.deepEqual(state, {
    [MINT]: {
      buy: { openOrders: {} },
      sell: { openOrders: { 'order-1': legacyOrder } },
    },
  });
});

test('current state keeps valid sides and repairs malformed side data', () => {
  const state = normalizeLoadedState({
    [MINT]: {
      buy: { openOrders: { 'buy-1': { price: 0.8, remaining: 5 } }, lastWalletBalance: 12 },
      sell: 'malformed',
    },
    ignored: null,
  }, trackedResources);

  assert.deepEqual(state, {
    [MINT]: {
      buy: { openOrders: { 'buy-1': { price: 0.8, remaining: 5 } }, lastWalletBalance: 12 },
      sell: { openOrders: {} },
    },
  });
});

test('fill classification reports partial and full fills while suppressing cancellations', () => {
  const previous = {
    'partial-order': { price: 1.25, remaining: 10, quantity: 10 },
    'filled-order': { price: 1.5, remaining: 4, quantity: 4 },
    'cancelled-order': { price: 2, remaining: 8, quantity: 8 },
  };

  assert.deepEqual(classifyOrderFillEvents(
    previous,
    [order('partial-order', 6, 1.25, 10)],
    new Set(['cancelled-order']),
  ), [
    { kind: 'partial', orderId: 'partial-order', meta: previous['partial-order'], filledDelta: 4, remaining: 6 },
    { kind: 'full', orderId: 'filled-order', meta: previous['filled-order'], remaining: 0 },
  ]);
});

test('an unchanged open order does not produce a fill event', () => {
  const previous = { 'order-1': { price: 1.25, remaining: 10, quantity: 10 } };
  assert.deepEqual(classifyOrderFillEvents(previous, [order('order-1', 10, 1.25, 10)], new Set()), []);
});

test('confirmed cancellation removes the tracked order from durable state', () => {
  const state = {
    [MINT]: {
      buy: {
        openOrders: {
          cancelled: { price: 1.25, remaining: 10, quantity: 10 },
          retained: { price: 1.1, remaining: 5, quantity: 5 },
        },
        lastWalletBalance: 42,
      },
      sell: { openOrders: {} },
    },
  };

  assert.equal(removeTrackedOrder(state, MINT, 'buy', 'cancelled'), true);
  assert.deepEqual(state[MINT].buy, {
    openOrders: { retained: { price: 1.1, remaining: 5, quantity: 5 } },
    lastWalletBalance: 42,
  });
  assert.equal(removeTrackedOrder(state, MINT, 'buy', 'missing'), false);
});

test('buy replacement carries cancellation suppression into post-placement reconciliation', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(source, /placeOrder\(resource, 'buy', targetPrice, targetQuantity, cancelledIds, quoteMint\)/);
  assert.doesNotMatch(source, /placeOrder\(resource, 'buy', targetPrice, targetQuantity, new Set<string>\(\), quoteMint\)/);
});
