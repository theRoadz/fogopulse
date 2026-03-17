import {
  calculateNetAmountLamports,
  calculateWalletCapRemaining,
  calculateSideCapRemaining,
  getCapStatus,
} from './cap-utils'

describe('cap-utils', () => {
  describe('calculateNetAmountLamports', () => {
    it('calculates net amount with ceiling division fee', () => {
      // 100 USDC = 100_000_000 lamports
      // fee = (100_000_000 * 180 + 9999) / 10000 = 1_800_000
      // net = 100_000_000 - 1_800_000 = 98_200_000
      const net = calculateNetAmountLamports(100_000_000n)
      expect(net).toBe(98_200_000n)
    })

    it('uses ceiling division for small amounts', () => {
      // 1 lamport: fee = (1 * 180 + 9999) / 10000 = 10179 / 10000 = 1
      // net = 1 - 1 = 0
      const net = calculateNetAmountLamports(1n)
      expect(net).toBe(0n)
    })

    it('handles zero amount', () => {
      expect(calculateNetAmountLamports(0n)).toBe(0n)
    })
  })

  describe('calculateWalletCapRemaining', () => {
    // Mirrors Rust test: test_wallet_cap_first_trade
    it('returns max for first trade (pool_total == 0)', () => {
      const remaining = calculateWalletCapRemaining(0n, 1_000_000n, 0n, 500)
      expect(remaining).toBe(BigInt(Number.MAX_SAFE_INTEGER))
    })

    // Mirrors Rust test: test_wallet_cap_within_limit
    it('returns positive remaining when within limit', () => {
      // 50 USDC position in 1000 USDC pool with 5% cap (max 50 USDC)
      // existing=0, new=50_000_000, pool=1_000_000_000
      // max_allowed = 1_000_000_000 * 500 / 10000 = 50_000_000
      // remaining = 50_000_000 - 50_000_000 = 0 (exactly at limit)
      const remaining = calculateWalletCapRemaining(
        0n,
        50_000_000n,
        1_000_000_000n,
        500
      )
      expect(remaining).toBe(0n)
    })

    // Mirrors Rust test: test_wallet_cap_exceeds_limit
    it('returns negative when cap exceeded', () => {
      // 60 USDC position in 1000 USDC pool with 5% cap (max 50)
      // remaining = 50_000_000 - 60_000_000 = -10_000_000
      const remaining = calculateWalletCapRemaining(
        0n,
        60_000_000n,
        1_000_000_000n,
        500
      )
      expect(remaining).toBe(-10_000_000n)
    })

    it('accounts for existing position', () => {
      // Existing 30 USDC + new 10 USDC in 1000 USDC pool with 5% cap (max 50)
      // remaining = 50_000_000 - (30_000_000 + 10_000_000) = 10_000_000
      const remaining = calculateWalletCapRemaining(
        30_000_000n,
        10_000_000n,
        1_000_000_000n,
        500
      )
      expect(remaining).toBe(10_000_000n)
    })

    it('handles existing position that already exceeds cap with new trade', () => {
      // Existing 45 USDC + new 10 USDC in 1000 USDC pool with 5% cap (max 50)
      // remaining = 50_000_000 - 55_000_000 = -5_000_000
      const remaining = calculateWalletCapRemaining(
        45_000_000n,
        10_000_000n,
        1_000_000_000n,
        500
      )
      expect(remaining).toBe(-5_000_000n)
    })
  })

  describe('calculateSideCapRemaining', () => {
    // Mirrors Rust test: test_side_cap_first_trade
    it('returns max for first trade (pool_total == 0)', () => {
      const remaining = calculateSideCapRemaining(1_000_000n, 0n, 3000)
      expect(remaining).toBe(BigInt(Number.MAX_SAFE_INTEGER))
    })

    // Mirrors Rust test: test_side_cap_balanced_pool
    it('returns positive for balanced pool', () => {
      // 500 USDC on one side in 1000 USDC pool with 30% deviation cap
      // balanced = 500, maxDev = 150, maxAllowed = 650
      // remaining = 650_000_000 - 500_000_000 = 150_000_000
      const remaining = calculateSideCapRemaining(
        500_000_000n,
        1_000_000_000n,
        3000
      )
      expect(remaining).toBe(150_000_000n)
    })

    // Mirrors Rust test: test_side_cap_within_deviation
    it('returns positive when within deviation limit', () => {
      // 600 USDC on side, 1000 USDC total, 30% cap
      // balanced = 500, maxDev = 150, maxAllowed = 650
      // remaining = 650_000_000 - 600_000_000 = 50_000_000
      const remaining = calculateSideCapRemaining(
        600_000_000n,
        1_000_000_000n,
        3000
      )
      expect(remaining).toBe(50_000_000n)
    })

    // Mirrors Rust test: test_side_cap_exceeds_deviation
    it('returns negative when exceeds deviation', () => {
      // 700 USDC on side, 1000 USDC total, 30% cap
      // balanced = 500, maxDev = 150, maxAllowed = 650
      // remaining = 650_000_000 - 700_000_000 = -50_000_000
      const remaining = calculateSideCapRemaining(
        700_000_000n,
        1_000_000_000n,
        3000
      )
      expect(remaining).toBe(-50_000_000n)
    })

    // Mirrors Rust test: test_side_cap_exactly_at_limit
    it('returns zero at exact limit', () => {
      // 650 USDC on side, 1000 USDC total, 30% cap
      // remaining = 650_000_000 - 650_000_000 = 0
      const remaining = calculateSideCapRemaining(
        650_000_000n,
        1_000_000_000n,
        3000
      )
      expect(remaining).toBe(0n)
    })

    // Mirrors Rust test: test_side_cap_just_over_limit
    it('returns -1 when just over limit', () => {
      // 650_000_001 on side, 1000 USDC total, 30% cap
      // remaining = 650_000_000 - 650_000_001 = -1
      const remaining = calculateSideCapRemaining(
        650_000_001n,
        1_000_000_000n,
        3000
      )
      expect(remaining).toBe(-1n)
    })
  })

  describe('getCapStatus', () => {
    const defaultParams = {
      existingPositionLamports: 0n,
      grossAmountLamports: 10_000_000n, // 10 USDC
      yesReserves: 500_000_000n, // 500 USDC
      noReserves: 500_000_000n, // 500 USDC
      direction: 'up' as const,
    }

    it('returns ok status for small trade in balanced pool', () => {
      const status = getCapStatus(defaultParams)

      expect(status.walletCap.level).toBe('ok')
      expect(status.sideCap.level).toBe('ok')
      expect(status.hasWarning).toBe(false)
      expect(status.hasError).toBe(false)
    })

    it('returns warning when approaching wallet cap (>80%)', () => {
      // 5% of 1000 USDC = 50 USDC max wallet cap
      // Trade 45 USDC (gross) → net ≈ 44.19 USDC → 88.4% used → warning
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 45_000_000n,
      })

      expect(status.walletCap.level).toBe('warning')
      expect(status.hasWarning).toBe(true)
      expect(status.hasError).toBe(false)
    })

    it('returns exceeded when wallet cap is exceeded', () => {
      // Trade 52 USDC gross → net ≈ 51.06 → exceeds 50 USDC wallet cap
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 52_000_000n,
      })

      expect(status.walletCap.level).toBe('exceeded')
      expect(status.hasError).toBe(true)
    })

    it('returns exceeded when side cap is exceeded', () => {
      // Imbalanced pool: 640 yes, 360 no. Total = 1000
      // Side cap: balanced=500, maxDev=150, maxAllowed=650
      // UP trade adds to yesReserves. After: 640 + net → > 650
      // Need: net > 10 USDC to exceed
      const status = getCapStatus({
        ...defaultParams,
        yesReserves: 640_000_000n,
        noReserves: 360_000_000n,
        grossAmountLamports: 15_000_000n, // net ≈ 14.73 → 640+14.73 = 654.73 > 650
        direction: 'up',
      })

      expect(status.sideCap.level).toBe('exceeded')
      expect(status.hasError).toBe(true)
    })

    it('shows both warnings when both caps triggered', () => {
      // Small pool: 100 yes, 100 no = 200 total
      // Wallet cap: 5% of 200 = 10 USDC max
      // Side cap: balanced=100, maxDev=30, maxAllowed=130
      // Trade 9 USDC gross → net ≈ 8.838 → wallet: 88.4% used → warning
      // Side after: 100 + 8.838 = 108.838 → 83.7% of 130 → warning
      const status = getCapStatus({
        ...defaultParams,
        yesReserves: 100_000_000n,
        noReserves: 100_000_000n,
        grossAmountLamports: 9_000_000n,
        direction: 'up',
      })

      expect(status.walletCap.level).toBe('warning')
      expect(status.sideCap.level).toBe('warning')
      expect(status.hasWarning).toBe(true)
      expect(status.mostRestrictive).toBe('wallet')
    })

    it('highlights most restrictive cap', () => {
      // Wallet cap should be more restrictive with small pool
      const status = getCapStatus({
        ...defaultParams,
        yesReserves: 100_000_000n,
        noReserves: 100_000_000n,
        grossAmountLamports: 5_000_000n,
      })

      // Wallet max = 5% of 200 = 10 USDC, net≈4.91 → remaining ≈ 5.09
      // Side max = 100+30=130, after trade ≈ 104.91 → remaining ≈ 25.09
      expect(status.mostRestrictive).toBe('wallet')
    })

    it('handles first trade edge case (zero pool)', () => {
      const status = getCapStatus({
        ...defaultParams,
        yesReserves: 0n,
        noReserves: 0n,
        grossAmountLamports: 100_000_000n,
      })

      expect(status.walletCap.level).toBe('ok')
      expect(status.sideCap.level).toBe('ok')
      expect(status.hasWarning).toBe(false)
    })

    it('accounts for existing position in wallet cap', () => {
      // Existing 40 USDC + new 9 USDC gross (net ≈ 8.838)
      // Wallet cap: 5% of 1000 = 50. Used: 40 + 8.838 = 48.838 → 97.7% → warning
      const status = getCapStatus({
        ...defaultParams,
        existingPositionLamports: 40_000_000n,
        grossAmountLamports: 9_000_000n,
      })

      expect(status.walletCap.level).toBe('warning')
      expect(status.walletCap.usedPercent).toBeGreaterThan(80)
    })

    it('uses pool-specific cap BPS when provided', () => {
      // With custom 10% wallet cap: max = 100 USDC on 1000 pool
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 90_000_000n, // net ≈ 88.38 → 88.4% of 100
        walletCapBps: 1000, // 10%
      })

      expect(status.walletCap.level).toBe('warning')
    })

    it('returns remaining capacity in USDC lamports', () => {
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 10_000_000n,
      })

      // Wallet: max=50_000_000, net≈9_820_000, remaining≈40_180_000
      expect(status.walletCap.remainingLamports).toBeGreaterThan(0n)
      // Side: max=650_000_000, after=500_000_000+9_820_000=509_820_000, remaining≈140_180_000
      expect(status.sideCap.remainingLamports).toBeGreaterThan(0n)
    })

    it('clamps remaining to 0 when exceeded', () => {
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 55_000_000n, // exceeds wallet cap
      })

      expect(status.walletCap.level).toBe('exceeded')
      expect(status.walletCap.remainingLamports).toBe(0n)
    })

    it('clamps usedPercent to 100 when cap exceeded', () => {
      const status = getCapStatus({
        ...defaultParams,
        grossAmountLamports: 55_000_000n, // exceeds wallet cap
      })

      expect(status.walletCap.level).toBe('exceeded')
      expect(status.walletCap.usedPercent).toBe(100)
    })
  })
})
