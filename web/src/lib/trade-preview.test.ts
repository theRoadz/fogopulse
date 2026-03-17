import {
  calculateShares,
  calculateEntryPrice,
  calculateFee,
  calculateSlippage,
  estimateSettlementPayout,
  calculateProbabilityImpact,
  getReservesForDirection,
  calculatePositionPnL,
  calculateSellReturn,
} from './trade-preview'

describe('trade-preview calculations', () => {
  describe('calculateShares', () => {
    it('returns 1:1 shares when same reserves is zero (first trade on side)', () => {
      // First trade on UP side, no existing yesReserves
      const shares = calculateShares(100_000_000n, 0n, 500_000_000n)
      expect(shares).toBe(100_000_000n)
    })

    it('returns 1:1 shares for completely empty pool', () => {
      // Empty pool - both reserves are 0
      const shares = calculateShares(100_000_000n, 0n, 0n)
      expect(shares).toBe(100_000_000n)
    })

    it('applies CPMM formula correctly', () => {
      // 100 USDC buy with 500 same reserves, 300 opposite reserves
      // shares = 100 * 300 / 500 = 60
      const shares = calculateShares(100_000_000n, 500_000_000n, 300_000_000n)
      expect(shares).toBe(60_000_000n)
    })

    it('handles large numbers correctly', () => {
      // 1000 USDC with 10M same, 5M opposite
      // shares = 1000 * 5M / 10M = 500
      const shares = calculateShares(
        1_000_000_000n, // 1000 USDC
        10_000_000_000_000n, // 10M USDC
        5_000_000_000_000n // 5M USDC
      )
      expect(shares).toBe(500_000_000n) // 500 USDC worth of shares
    })

    it('returns more shares when opposite > same (favorable pricing)', () => {
      // 100 USDC with 200 same, 800 opposite
      // shares = 100 * 800 / 200 = 400
      const shares = calculateShares(100_000_000n, 200_000_000n, 800_000_000n)
      expect(shares).toBe(400_000_000n)
    })

    it('returns fewer shares when same > opposite (unfavorable pricing)', () => {
      // 100 USDC with 800 same, 200 opposite
      // shares = 100 * 200 / 800 = 25
      const shares = calculateShares(100_000_000n, 800_000_000n, 200_000_000n)
      expect(shares).toBe(25_000_000n)
    })
  })

  describe('calculateEntryPrice', () => {
    it('calculates price correctly for 1:1 ratio', () => {
      // 100 USDC for 100 shares = $1 per share
      const price = calculateEntryPrice(100_000_000n, 100_000_000n)
      expect(price).toBeCloseTo(1.0)
    })

    it('calculates price correctly for better ratio', () => {
      // 100 USDC for 200 shares = $0.50 per share
      const price = calculateEntryPrice(100_000_000n, 200_000_000n)
      expect(price).toBeCloseTo(0.5)
    })

    it('calculates price correctly for worse ratio', () => {
      // 100 USDC for 50 shares = $2 per share
      const price = calculateEntryPrice(100_000_000n, 50_000_000n)
      expect(price).toBeCloseTo(2.0)
    })

    it('throws error for zero shares', () => {
      expect(() => calculateEntryPrice(100_000_000n, 0n)).toThrow(
        'Cannot calculate entry price with zero shares'
      )
    })
  })

  describe('calculateFee', () => {
    it('calculates 1.8% fee correctly', () => {
      // $100 trade at 180 BPS = $1.80 fee
      const fee = calculateFee(100, 180)
      expect(fee).toBeCloseTo(1.8)
    })

    it('calculates default fee (180 BPS)', () => {
      const fee = calculateFee(100)
      expect(fee).toBeCloseTo(1.8)
    })

    it('handles zero amount', () => {
      const fee = calculateFee(0)
      expect(fee).toBe(0)
    })

    it('handles different fee rates', () => {
      // $100 at 100 BPS (1%) = $1.00
      expect(calculateFee(100, 100)).toBeCloseTo(1.0)

      // $100 at 250 BPS (2.5%) = $2.50
      expect(calculateFee(100, 250)).toBeCloseTo(2.5)
    })
  })

  describe('calculateSlippage', () => {
    it('returns 0 for first trade on side', () => {
      // When sameReserves is 0, slippage is undefined/0
      const slippage = calculateSlippage(100_000_000n, 100_000_000n, 0n, 0n)
      expect(slippage).toBe(0)
    })

    it('returns 0 when zero shares', () => {
      const slippage = calculateSlippage(100_000_000n, 0n, 500_000_000n, 300_000_000n)
      expect(slippage).toBe(0)
    })

    it('calculates slippage for small trade (minimal impact)', () => {
      // Small trade: 1 USDC with 1000 same, 1000 opposite
      // Fair price = 1000/1000 = 1.0
      // shares = 1 * 1000 / 1000 = 1
      // Actual price = 1 / 1 = 1.0
      // Slippage = (1.0 - 1.0) / 1.0 = 0%
      const shares = calculateShares(1_000_000n, 1_000_000_000n, 1_000_000_000n)
      const slippage = calculateSlippage(
        1_000_000n,
        shares,
        1_000_000_000n,
        1_000_000_000n
      )
      expect(slippage).toBeCloseTo(0, 1)
    })

    it('calculates positive slippage for large trade', () => {
      // 100 USDC with 500 same, 300 opposite
      // Fair price = 300/500 = 0.6 USDC per share
      // shares = 100 * 300 / 500 = 60
      // Actual price = 100/60 = 1.667 USDC per share
      // Slippage = (1.667 - 0.6) / 0.6 * 100 = 177.78%
      const shares = calculateShares(100_000_000n, 500_000_000n, 300_000_000n)
      const slippage = calculateSlippage(
        100_000_000n,
        shares,
        500_000_000n,
        300_000_000n
      )
      expect(slippage).toBeCloseTo(177.78, 1)
    })
  })

  describe('estimateSettlementPayout', () => {
    it('estimates ~2x payout in balanced pool (wins opposite side)', () => {
      // 100 USDC UP bet, balanced pool (500 yes, 500 no)
      // winnerTotal = 500 + 100 = 600, loserTotal = 500
      // payout = 100 + (100 * 500) / 600 = 100 + 83.33 = 183.33
      const payout = estimateSettlementPayout(
        100_000_000n,
        'up',
        500_000_000n,
        500_000_000n
      )
      expect(payout).toBeCloseTo(183.33, 1)
    })

    it('estimates higher payout when loser side is larger', () => {
      // 100 USDC UP bet, skewed pool (200 yes, 800 no)
      // winnerTotal = 200 + 100 = 300, loserTotal = 800
      // payout = 100 + (100 * 800) / 300 = 100 + 266.67 = 366.67
      const payout = estimateSettlementPayout(
        100_000_000n,
        'up',
        200_000_000n,
        800_000_000n
      )
      expect(payout).toBeCloseTo(366.67, 0)
    })

    it('estimates lower payout when winner side is larger', () => {
      // 100 USDC UP bet, skewed pool (800 yes, 200 no)
      // winnerTotal = 800 + 100 = 900, loserTotal = 200
      // payout = 100 + (100 * 200) / 900 = 100 + 22.22 = 122.22
      const payout = estimateSettlementPayout(
        100_000_000n,
        'up',
        800_000_000n,
        200_000_000n
      )
      expect(payout).toBeCloseTo(122.22, 0)
    })

    it('returns position amount when opposite reserves is zero (no losers)', () => {
      // 100 USDC UP bet, no opposite reserves
      // winnerTotal = 500 + 100 = 600, loserTotal = 0
      // payout = 100 + (100 * 0) / 600 = 100
      const payout = estimateSettlementPayout(
        100_000_000n,
        'up',
        500_000_000n,
        0n
      )
      expect(payout).toBe(100)
    })

    it('handles zero net amount', () => {
      const payout = estimateSettlementPayout(
        0n,
        'up',
        500_000_000n,
        500_000_000n
      )
      expect(payout).toBe(0)
    })

    it('handles DOWN direction correctly', () => {
      // 100 USDC DOWN bet, pool (500 yes, 500 no)
      // For DOWN: same = noReserves, opposite = yesReserves
      // winnerTotal = 500 + 100 = 600, loserTotal = 500
      // payout = 100 + (100 * 500) / 600 = 183.33
      const payout = estimateSettlementPayout(
        100_000_000n,
        'down',
        500_000_000n,
        500_000_000n
      )
      expect(payout).toBeCloseTo(183.33, 1)
    })
  })

  describe('calculateProbabilityImpact', () => {
    it('calculates 50/50 for empty pool', () => {
      const impact = calculateProbabilityImpact(100_000_000n, 'up', 0n, 0n)
      expect(impact.currentPUp).toBe(50)
      expect(impact.currentPDown).toBe(50)
    })

    it('calculates current probabilities correctly', () => {
      // 300 yes, 700 no
      // pUp = 700 / 1000 = 70%
      const impact = calculateProbabilityImpact(
        100_000_000n,
        'up',
        300_000_000n,
        700_000_000n
      )
      expect(impact.currentPUp).toBe(70)
      expect(impact.currentPDown).toBe(30)
    })

    it('calculates UP trade impact correctly', () => {
      // 500 yes, 500 no (50/50)
      // UP trade of 100 -> new: 600 yes, 500 no
      // new pUp = 500 / 1100 = 45.45%
      const impact = calculateProbabilityImpact(
        100_000_000n,
        'up',
        500_000_000n,
        500_000_000n
      )
      expect(impact.currentPUp).toBe(50)
      expect(impact.currentPDown).toBe(50)
      // After UP trade: newYes = 600, newNo = 500, total = 1100
      // newPUp = 500/1100 * 100 = 45
      expect(impact.newPUp).toBe(45)
      expect(impact.newPDown).toBe(55)
    })

    it('calculates DOWN trade impact correctly', () => {
      // 500 yes, 500 no (50/50)
      // DOWN trade of 100 -> new: 500 yes, 600 no
      // new pUp = 600 / 1100 = 54.54%
      const impact = calculateProbabilityImpact(
        100_000_000n,
        'down',
        500_000_000n,
        500_000_000n
      )
      expect(impact.currentPUp).toBe(50)
      expect(impact.currentPDown).toBe(50)
      // After DOWN trade: newYes = 500, newNo = 600, total = 1100
      // newPUp = 600/1100 * 100 = 54
      expect(impact.newPUp).toBe(54)
      expect(impact.newPDown).toBe(46)
    })
  })

  describe('getReservesForDirection', () => {
    it('returns correct reserves for UP direction', () => {
      const [same, opposite] = getReservesForDirection(
        'up',
        500_000_000n,
        300_000_000n
      )
      // UP -> yesReserves is same, noReserves is opposite
      expect(same).toBe(500_000_000n)
      expect(opposite).toBe(300_000_000n)
    })

    it('returns correct reserves for DOWN direction', () => {
      const [same, opposite] = getReservesForDirection(
        'down',
        500_000_000n,
        300_000_000n
      )
      // DOWN -> noReserves is same, yesReserves is opposite
      expect(same).toBe(300_000_000n)
      expect(opposite).toBe(500_000_000n)
    })
  })

  describe('calculatePositionPnL', () => {
    it('returns ~0 PnL for just-entered position in balanced pool (50/50 reserves)', () => {
      // Buy 100 USDC in balanced pool: shares = 100 * 500 / 500 = 100
      // Current value = 100 * 500 / 500 = 100 → PnL = 0
      const result = calculatePositionPnL(
        100_000_000n, // shares
        100_000_000n, // entryAmount
        'up',
        500_000_000n, // yesReserves (same for UP)
        500_000_000n  // noReserves (opposite for UP)
      )
      expect(result.currentValue).toBe(100_000_000n)
      expect(result.pnlAmount).toBe(0n)
      expect(result.pnlPercent).toBeCloseTo(0)
    })

    it('returns positive PnL for favorable pool shift (UP position, noReserves decreased)', () => {
      // UP position: same = yesReserves, opposite = noReserves
      // currentValue = shares * sameReserves / oppositeReserves
      // 100 shares, yesReserves = 600, noReserves = 400
      // currentValue = 100 * 600 / 400 = 150
      // pnlAmount = 150 - 100 = 50
      // pnlPercent = 50 / 100 * 100 = 50%
      const result = calculatePositionPnL(
        100_000_000n, // shares
        100_000_000n, // entryAmount
        'up',
        600_000_000n, // yesReserves
        400_000_000n  // noReserves
      )
      expect(result.currentValue).toBe(150_000_000n)
      expect(result.pnlAmount).toBe(50_000_000n)
      expect(result.pnlPercent).toBeCloseTo(50)
    })

    it('returns negative PnL for unfavorable pool shift', () => {
      // UP position: same = yesReserves, opposite = noReserves
      // 100 shares, yesReserves = 400, noReserves = 600
      // currentValue = 100 * 400 / 600 = 66.666... → truncated to 66
      // pnlAmount = 66 - 100 = -34
      const result = calculatePositionPnL(
        100_000_000n,
        100_000_000n,
        'up',
        400_000_000n,
        600_000_000n
      )
      expect(result.currentValue).toBe(66_666_666n) // BigInt truncation
      expect(result.pnlAmount).toBe(66_666_666n - 100_000_000n)
      expect(result.pnlPercent).toBeLessThan(0)
    })

    it('returns zeros for zero shares (sold position)', () => {
      const result = calculatePositionPnL(
        0n,
        100_000_000n,
        'up',
        500_000_000n,
        500_000_000n
      )
      expect(result.currentValue).toBe(0n)
      expect(result.pnlAmount).toBe(0n)
      expect(result.pnlPercent).toBe(0)
    })

    it('returns -100% PnL when oppositeReserves is zero (no liquidity)', () => {
      const result = calculatePositionPnL(
        100_000_000n,
        100_000_000n,
        'up',
        500_000_000n,
        0n // no opposite reserves
      )
      expect(result.currentValue).toBe(0n)
      expect(result.pnlAmount).toBe(-100_000_000n)
      expect(result.pnlPercent).toBe(-100)
    })

    it('returns 0% when entryAmount is zero (edge case)', () => {
      const result = calculatePositionPnL(
        100_000_000n,
        0n, // zero entry amount
        'up',
        500_000_000n,
        500_000_000n
      )
      expect(result.pnlPercent).toBe(0)
    })

    it('handles DOWN direction correctly', () => {
      // DOWN position: same = noReserves, opposite = yesReserves
      // 100 shares, yesReserves = 400, noReserves = 600
      // currentValue = 100 * 600 / 400 = 150
      const result = calculatePositionPnL(
        100_000_000n,
        100_000_000n,
        'down',
        400_000_000n, // yesReserves (opposite for DOWN)
        600_000_000n  // noReserves (same for DOWN)
      )
      expect(result.currentValue).toBe(150_000_000n)
      expect(result.pnlAmount).toBe(50_000_000n)
      expect(result.pnlPercent).toBeCloseTo(50)
    })
  })

  describe('fractional amounts', () => {
    it('handles fractional USDC amounts correctly (10.505 USDC)', () => {
      // 10.505 USDC = 10_505_000 lamports (floor truncates 0.0005)
      // This is intentional - we use Math.floor in the hook
      const amount = 10_505_000n
      const shares = calculateShares(amount, 500_000_000n, 500_000_000n)
      // 1:1 in balanced pool
      expect(shares).toBe(10_505_000n)
    })

    it('handles very small fractional amounts', () => {
      // 0.000001 USDC = 1 lamport (minimum unit)
      const amount = 1n
      const shares = calculateShares(amount, 1_000_000_000n, 1_000_000_000n)
      // 1:1 in balanced pool
      expect(shares).toBe(1n)
    })
  })

  describe('BigInt overflow protection', () => {
    it('handles very large reserves without overflow', () => {
      // Reserves exceeding Number.MAX_SAFE_INTEGER (2^53 - 1)
      const hugeReserves = BigInt(Number.MAX_SAFE_INTEGER) * 10n
      const amount = 100_000_000n // 100 USDC

      // This should not throw - calculateSlippage handles scaling
      const shares = calculateShares(amount, hugeReserves, hugeReserves)
      const slippage = calculateSlippage(amount, shares, hugeReserves, hugeReserves)

      expect(typeof slippage).toBe('number')
      expect(Number.isFinite(slippage)).toBe(true)
      // With balanced huge reserves, slippage should be near 0
      expect(slippage).toBeCloseTo(0, 1)
    })
  })

  describe('calculateSellReturn', () => {
    it('calculates basic sell return matching inverse CPMM formula', () => {
      // 100 shares, entry 100 USDC, balanced pool (500 yes, 500 no), UP direction
      // gross = 100 * 500 / 500 = 100
      // fee = ceiling(100 * 180 / 10000) = ceiling(1.8) = 2 (in lamports: ceiling(18_000_000 * ... ))
      const result = calculateSellReturn(
        100_000_000n, // shares
        100_000_000n, // entryAmount
        'up',
        500_000_000n, // yesReserves
        500_000_000n  // noReserves
      )

      // gross = 100_000_000
      expect(result.gross).toBe(100_000_000n)

      // fee = ceiling(100_000_000 * 180 / 10000) = ceiling(1_800_000) = 1_800_000
      // (100_000_000 * 180 + 9999) / 10000 = (18_000_000_000 + 9999) / 10000 = 1_800_000
      expect(result.fee).toBe(1_800_000n)

      // net = 100_000_000 - 1_800_000 = 98_200_000
      expect(result.net).toBe(98_200_000n)

      // realizedPnl = 98_200_000 - 100_000_000 = -1_800_000 (loss due to fees)
      expect(result.realizedPnl).toBe(-1_800_000n)
    })

    it('fee split sums to total fee', () => {
      const result = calculateSellReturn(
        200_000_000n,
        150_000_000n,
        'up',
        600_000_000n,
        400_000_000n
      )

      const { lpFee, treasuryFee, insuranceFee } = result.feeSplit
      expect(lpFee + treasuryFee + insuranceFee).toBe(result.fee)
    })

    it('calculates positive realized PnL correctly', () => {
      // 100 shares, entry 80 USDC, favorable reserves (yesReserves > noReserves for UP)
      // gross = 100 * 600 / 400 = 150
      const result = calculateSellReturn(
        100_000_000n,
        80_000_000n,
        'up',
        600_000_000n,
        400_000_000n
      )

      expect(result.gross).toBe(150_000_000n)
      expect(result.net).toBeGreaterThan(80_000_000n) // net > entry
      expect(result.realizedPnl).toBeGreaterThan(0n)
      expect(result.realizedPnlPercent).toBeGreaterThan(0)
    })

    it('calculates negative realized PnL correctly', () => {
      // 100 shares, entry 100 USDC, unfavorable reserves
      // gross = 100 * 400 / 600 = 66.67 → 66_666_666 after truncation
      const result = calculateSellReturn(
        100_000_000n,
        100_000_000n,
        'up',
        400_000_000n,
        600_000_000n
      )

      expect(result.net).toBeLessThan(100_000_000n) // net < entry
      expect(result.realizedPnl).toBeLessThan(0n)
      expect(result.realizedPnlPercent).toBeLessThan(0)
    })

    it('returns 1:1 refund (matching on-chain) when oppositeReserves is 0', () => {
      // On-chain calculate_refund returns shares when opposite_reserves == 0
      const result = calculateSellReturn(
        100_000_000n, // shares
        100_000_000n, // entryAmount
        'up',
        500_000_000n,
        0n
      )

      // gross = shares (1:1 refund, matching on-chain)
      expect(result.gross).toBe(100_000_000n)
      // fee = ceiling(100_000_000 * 180 / 10000) = 1_800_000
      expect(result.fee).toBe(1_800_000n)
      // net = gross - fee
      expect(result.net).toBe(98_200_000n)
      // fee split sums to total fee
      expect(result.feeSplit.lpFee + result.feeSplit.treasuryFee + result.feeSplit.insuranceFee).toBe(result.fee)
      // realizedPnl = net - entry = 98_200_000 - 100_000_000 = -1_800_000
      expect(result.realizedPnl).toBe(-1_800_000n)
      expect(result.priceImpact).toBe(0)
    })

    it('returns realizedPnlPercent 0 when entryAmount is 0', () => {
      const result = calculateSellReturn(
        100_000_000n,
        0n, // zero entry amount
        'up',
        500_000_000n,
        500_000_000n
      )

      expect(result.realizedPnlPercent).toBe(0)
    })

    it('calculates non-negative price impact', () => {
      const result = calculateSellReturn(
        100_000_000n,
        100_000_000n,
        'up',
        500_000_000n,
        500_000_000n
      )

      expect(result.priceImpact).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(result.priceImpact)).toBe(true)
    })

    it('uses ceiling division for fee (matches on-chain)', () => {
      // Choose values that would differ between floor and ceiling division
      // gross = 100_000_001n → fee = ceiling(100_000_001 * 180 / 10000)
      // floor: 18_000_000_180 / 10000 = 1_800_000 (with floor)
      // ceiling: (18_000_000_180 + 9999) / 10000 = 18_000_010_179 / 10000 = 1_800_001
      // To get gross = 100_000_001, need specific reserves
      // Let's use: shares=100_000_001, yesRes=500_000_000, noRes=500_000_000 → gross = 100_000_001
      const result = calculateSellReturn(
        100_000_001n,
        100_000_000n,
        'up',
        500_000_000n,
        500_000_000n
      )

      // Verify ceiling division: (100_000_001 * 180 + 9999) / 10000
      const expectedFee = (100_000_001n * 180n + 9999n) / 10000n
      expect(result.fee).toBe(expectedFee)
    })

    it('handles DOWN direction correctly', () => {
      // DOWN: same = noReserves, opposite = yesReserves
      // gross = 100 * 600 / 400 = 150
      const result = calculateSellReturn(
        100_000_000n,
        100_000_000n,
        'down',
        400_000_000n, // yesReserves (opposite for DOWN)
        600_000_000n  // noReserves (same for DOWN)
      )

      expect(result.gross).toBe(150_000_000n)
      expect(result.realizedPnl).toBeGreaterThan(0n)
    })
  })
})
