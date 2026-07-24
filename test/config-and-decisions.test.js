'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBotConfig,
  calculateTargetBuyPrice,
  calculateTargetSellPrice,
  parseAssetRules,
} = require('../dist/bot');

const IRON_ORE = 'Iron Ore:FeorejFjRRAfusN9Fg3WjEZ1dRCf74o6xwT5vDt3R34J';

function order({ owner = 'other-wallet', price, quantity = 100 }) {
  return { owner, uiPrice: price, orderQtyRemaining: quantity };
}

test('strategy rows expand into bounded buy and sell rules', () => {
  const rules = parseAssetRules([{
    asset: IRON_ORE,
    group: 'raw',
    enabled: true,
    minQuantity: '10',
    maxQuantity: '100',
    minBuyPrice: '0.5',
    maxBuyPrice: '0.8',
    minSellPrice: '1.1',
    maxSellPrice: '1.5',
  }]);

  assert.deepEqual(rules.map((rule) => ({
    side: rule.side,
    quantity: rule.quantity,
    limit: rule.limit,
    price: rule.price,
    minPrice: rule.minPrice,
    maxPrice: rule.maxPrice,
  })), [
    { side: 'buy', quantity: 100, limit: 100, price: 0.8, minPrice: 0.5, maxPrice: 0.8 },
    { side: 'sell', quantity: 10, limit: 100, price: 1.1, minPrice: 1.1, maxPrice: 1.5 },
  ]);
});

test('invalid strategy boundaries fail closed', () => {
  assert.throws(() => parseAssetRules([{
    asset: IRON_ORE,
    minQuantity: '20',
    maxQuantity: '10',
    minSellPrice: '1',
  }]), /maxQuantity must be greater than or equal to minQuantity/);

  assert.throws(() => parseAssetRules([{
    asset: IRON_ORE,
    minQuantity: '1',
    maxQuantity: '10',
    minBuyPrice: '2',
    maxBuyPrice: '1',
  }]), /minBuyPrice must be less than or equal to maxBuyPrice/);
});

test('bot config refuses to start without a signing secret', () => {
  assert.throws(() => buildBotConfig({
    AEPHIA_API_KEY: 'test',
    RPC_URL: 'https://rpc.invalid',
    HOT_WALLET_SECRET: '',
    assetRules: [],
  }), /HOT_WALLET_SECRET env variable missing/);
});

test('sell pricing ignores own and undersized orders and respects configured bounds', () => {
  const ownWallet = 'own-wallet';
  const target = calculateTargetSellPrice([
    order({ owner: ownWallet, price: 1.01, quantity: 1000 }),
    order({ price: 1.02, quantity: 2 }),
    order({ price: 1.3, quantity: 100 }),
  ], ownWallet, 1.1, 10, { maxPrice: 1.5 });

  assert.equal(target, 1.29999999);
  assert.equal(calculateTargetSellPrice([], ownWallet, 1.1, 10, { maxPrice: 1.5 }), 1.5);
});

test('buy pricing ignores own and undersized orders and never exceeds the configured maximum', () => {
  const ownWallet = 'own-wallet';
  const target = calculateTargetBuyPrice([
    order({ owner: ownWallet, price: 0.79, quantity: 1000 }),
    order({ price: 0.78, quantity: 2 }),
    order({ price: 0.7, quantity: 100 }),
  ], ownWallet, 0.8, 10, { minPrice: 0.5 });

  assert.equal(target, 0.70000001);
  assert.equal(calculateTargetBuyPrice([order({ price: 2, quantity: 100 })], ownWallet, 0.8, 10, { minPrice: 0.5 }), 0.5);
});
