# GM Market Bot

GM Market Bot is an Electron desktop app for automating selected Star Atlas Galactic Marketplace orders.

The bot is intended for Aephia members. Startup is protected by Aephia API token validation. Without a valid Aephia API token, the normal app flow will not start the bot.

## What It Does

- Manages buy and sell rules for selected marketplace assets.
- Supports raw materials, components, crew packs, ships, and ship parts.
- Reads current market orders and wallet balances.
- Places, cancels, and replaces orders when configured rules require it.
- Uses configurable RPC request and transaction submission rate limits.
- Shows wallet balances, open orders, inventory, recent activity, and rule health in the desktop UI.

## Security Model

The app stores secrets in local settings, not in the repository.

Sensitive values include:

- Aephia API key
- RPC URL
- hot wallet secret

Never commit local settings, runtime logs, wallet secrets, or `.env` files.

The repository intentionally ignores:

- `node_modules/`
- `dist/`
- `analysis/`
- `.env`
- `.env.*`
- logs and local editor/OS files

## Requirements

- Node.js
- npm
- A Solana RPC endpoint
- A hot wallet secret with funds/assets needed for the configured orders
- A valid Aephia API token

## Install

```bash
npm install
```

## Run The Desktop App

```bash
npm run start:electron
```

For development, this command builds the TypeScript source first and then starts Electron.

## Build

```bash
npm run build
```

## Typecheck

```bash
npm run typecheck
```

## Settings Fields

Configure the bot from the app's Settings screen.

Sensitive fields:

- `Aephia API Key`: required to validate access and load the managed asset registry.
- `RPC URL`: primary Solana RPC endpoint.
- `Hot Wallet Secret`: wallet secret used for signing marketplace transactions.

Operational fields:

- `Requests / sec`: general RPC request limit. Helius free plan is limited to 10 requests/sec.
- `sendTransaction / sec`: transaction submission limit. Helius free plan is limited to 1 tx/sec.
- `Chain status refresh interval minutes`: how often the app refreshes expensive chain-backed status data.
- `Cycle Interval Minutes`: how often the trading cycle runs.
- `Relevant Sell Order %`: minimum relevant competing sell order size as a percentage of configured sell quantity.
- `Relevant Buy Order %`: minimum relevant competing buy order size as a percentage of configured buy quantity.

## Asset Rules

Each asset rule defines:

- Asset
- Side: buy or sell
- Quantity
- Limit
- Price

For sell rules, quantity is the minimum sell size.

For sell rules, limit caps the active sell order quantity. Leave it blank to keep selling the full available wallet balance.

For buy rules, quantity is the maximum single active buy order size.

For buy rules, limit caps target inventory. The bot sizes the active buy order so current inventory plus the active buy order does not exceed the limit. Leave it blank to use the quantity as before.

The bot only fetches status/open-order data for assets with configured rules when asset-rule mode is used.

## Runtime Data

Runtime files are written under `analysis/` and are intentionally not committed.

These files may include:

- bot state
- order logs
- Electron stderr logs

Keep this folder local.

## Versioning

The app version is stored in `package.json` and displayed in the UI.

Current initial GitHub release baseline:

```text
v0.1.17
```

## Notes

This bot can place real marketplace transactions. Use a dedicated hot wallet and configure rules carefully.
