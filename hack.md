# FogoPulse

**Predict crypto prices. Win in minutes.**

## The Problem

Crypto moves fast. Traditional prediction markets take days or weeks to settle. By then, who cares?

## Our Solution

FogoPulse lets you bet on where crypto is heading in the next **5 minutes**.

Think BTC is about to pump? Go UP. Feeling bearish on ETH? Go DOWN. The oracle checks the price when time's up, and winners take the pot.

Simple as that.

## How It Works

1. **Pick your market** - BTC, ETH, SOL, or FOGO
2. **Choose UP or DOWN** - Where's the price going?
3. **Place your bet** - USDC in, position out
4. **Wait for the countdown** - 5 minutes of anticipation
5. **Oracle settles it** - Pyth price feed decides the outcome
6. **Winners get paid** - Losers fund the winnings

No complicated derivatives. No leverage liquidations. Just pure directional betting with instant settlement.

## Why It's Fair

- **Real oracle data** - Pyth Lazer feeds with cryptographic proof
- **No house edge** - AMM pricing, not a bookmaker
- **Refund on uncertainty** - If the oracle isn't confident, everyone gets their money back

## What We've Built

**Smart Contracts** - Full trading engine deployed on FOGO testnet
- Position entry/exit
- Automated epoch lifecycle
- Oracle-verified settlement
- Fair fee distribution

**Web App** - Clean trading interface
- Real-time price charts
- Live countdown timers
- Instant trade previews
- Wallet integration (Phantom, Nightly, Backpack)

**Automation** - Crank bot keeps epochs running 24/7

## Current Status

**Working:**
- End-to-end trading flow
- 4 live markets
- Automated settlement
- Real-time UI

**Coming Soon:**
- Payout claims UI
- Trade history
- Liquidity provision

## Tech Stack

- FOGO Chain (SVM-compatible)
- Anchor/Rust smart contracts
- Next.js + shadcn/ui frontend
- Pyth Lazer oracles

## Pyth Integration

We use Pyth at every layer:

**Pyth Lazer (On-Chain)**
- Ed25519 signature verification on settlement
- Cryptographic proof that price data is authentic
- Confidence intervals checked before finalizing outcomes

**Pyth Hermes (Frontend)**
- Real-time WebSocket price streaming
- Powers live charts and trade previews
- Sub-10-second price freshness

**Confidence-Aware Settlement**

This is our key innovation. Most prediction markets just take the oracle price and declare a winner. We go further:

> If Pyth's confidence interval is too wide at settlement, the epoch **refunds everyone**.

Why? Because if the oracle says "BTC is $84,000 ± $500" and the decision threshold is at $84,100, we can't fairly say UP or DOWN won. Rather than force a coin-flip outcome, we refund.

**Trust-first. No forced losers on uncertain data.**

---

*Fast markets. Fair settlement. Built on FOGO. Powered by Pyth.*
