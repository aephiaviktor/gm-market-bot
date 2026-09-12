'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyImmediateBuyFill,
  classifyOrderClosureFromTransactionLogs,
  classifyOrderFillEvents,
  confirmOrderFillEvents,
  normalizeLoadedState,
  reconcileUnconfiguredOrderSide,
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

test('GM transaction logs distinguish cancellations from fills', () => {
  assert.equal(classifyOrderClosureFromTransactionLogs([
    'Program traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg invoke [1]',
    'Program log: Instruction: ProcessCancel',
  ]), 'cancelled');
  assert.equal(classifyOrderClosureFromTransactionLogs([
    'Program traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg invoke [1]',
    'Program log: Instruction: ProcessExchange',
  ]), 'filled');
  assert.equal(classifyOrderClosureFromTransactionLogs(['Program log: unrelated']), 'unknown');
  assert.equal(classifyOrderClosureFromTransactionLogs(null), 'unknown');
});

test('missing orders require authoritative closure classification before recording a full fill', async () => {
  const previous = {
    'still-open': { price: 0.00395, remaining: 8_000_000, quantity: 8_000_000 },
    filled: { price: 0.004, remaining: 5_000_000, quantity: 5_000_000 },
    cancelled: { price: 0.09, remaining: 1_011_579, quantity: 1_011_579 },
    ambiguous: { price: 0.2, remaining: 50, quantity: 50 },
  };
  const candidates = classifyOrderFillEvents(previous, [], new Set());
  const dispositions = { 'still-open': 'open', filled: 'filled', cancelled: 'cancelled', ambiguous: 'unknown' };

  const result = await confirmOrderFillEvents(candidates, async (orderId) => dispositions[orderId]);

  assert.deepEqual(result.events, [
    { kind: 'full', orderId: 'filled', meta: previous.filled, remaining: 0 },
  ]);
  assert.deepEqual([...result.stillOpenOrderIds], ['still-open', 'ambiguous']);
  assert.deepEqual([...result.cancelledOrderIds], ['cancelled']);
  assert.deepEqual([...result.verificationFailedOrderIds], ['ambiguous']);
});

test('failed order-closure verification fails closed and preserves the tracked order', async () => {
  const previous = { uncertain: { price: 0.00395, remaining: 8_000_000, quantity: 8_000_000 } };
  const candidates = classifyOrderFillEvents(previous, [], new Set());

  const result = await confirmOrderFillEvents(candidates, async () => {
    throw new Error('RPC unavailable');
  });

  assert.deepEqual(result.events, []);
  assert.deepEqual([...result.stillOpenOrderIds], ['uncertain']);
  assert.deepEqual([...result.verificationFailedOrderIds], ['uncertain']);
});

test('immediate external buys are partial until the remaining rule target is reached', () => {
  assert.deepEqual(classifyImmediateBuyFill(5_000_000, 1_346_515), {
    event: 'PARTIAL_FILL',
    remaining: 3_653_485,
  });
  assert.deepEqual(classifyImmediateBuyFill(3_653_485, 3_653_485), {
    event: 'FILLED',
    remaining: 0,
  });
});

test('unconfigured order side is reconciled from the chain snapshot without retaining stale orders', () => {
  const state = {
    [MINT]: {
      buy: {
        openOrders: {
          stale: { price: 0.09, remaining: 500_000, quantity: 500_000 },
        },
      },
      sell: { openOrders: {} },
    },
  };

  reconcileUnconfiguredOrderSide(state, MINT, 'buy', []);
  assert.deepEqual(state[MINT].buy.openOrders, {});

  reconcileUnconfiguredOrderSide(state, MINT, 'buy', [order('real-order', 25, 0.08, 30)], '2026-08-10T12:00:00.000Z');
  assert.deepEqual(state[MINT].buy.openOrders, {
    'real-order': {
      price: 0.08,
      remaining: 25,
      quantity: 30,
      updatedAt: '2026-08-10T12:00:00.000Z',
    },
  });
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

test('missing full-fill candidates inspect the closing transaction and retain ambiguous orders', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(source, /inspectOrderClosure[\s\S]{0,500}getAccountInfo\(orderAddress, 'confirmed'\)/);
  assert.match(source, /getSignaturesForAddress\([\s\S]{0,120}\{ limit: 1 \}/);
  assert.match(source, /getTransaction\(closingSignature\.signature[\s\S]{0,250}classifyOrderClosureFromTransactionLogs/);
  assert.match(source, /for \(const orderId of stillOpenOrderIds\)[\s\S]{0,300}nextSideState\.openOrders\[orderId\] = previous/);
});

test('running status uses cycle-reconciled open orders instead of repeating chain scans', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(source, /this\.running && isTracked[\s\S]{0,160}buildOpenOrdersSnapshotFromState/);
  assert.match(source, /getOpenOrdersForPlayerAndAsset\([\s\S]{0,180}resource\.mint/);
});

test('manual cancellation always invalidates the cached status snapshot', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(source, /cancelActiveOrderForRule[\s\S]{0,4500}finally \{[\s\S]{0,300}invalidateStatusSnapshotCache\(\)/);
});

test('recent activity distinguishes partial fills and filters both fill types', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../electron/renderer.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '../electron/renderer.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../src/bot.ts'), 'utf8');
  assert.match(html, /id="recent-activity-filled-only"/);
  assert.match(html, />Only partial and fully filled orders</);
  assert.match(renderer, /entry\?\.event === 'PARTIAL_FILL' \|\| entry\?\.event === 'FILLED'/);
  assert.match(renderer, /activity-badge partial[^\n]*'PARTIAL'/);
  assert.match(renderer, /filledOnly \? 'No partial or fully filled orders' : 'No recent activity'/);
  assert.match(source, /fill\.kind === 'partial'[\s\S]{0,180}event: 'PARTIAL_FILL'/);
});
