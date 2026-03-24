/**
 * Settle Epoch Rebalancing Regression Test (Story 7.29)
 *
 * Offline math verification that the settle_epoch rebalancing logic
 * preserves total reserves when pending withdrawals exist.
 *
 * Story 7.29 fixed a CRITICAL bug where the old rebalancing code:
 *   1. Computed reserved_usdc = pending_shares * total_reserves / total_shares
 *   2. Subtracted it: available_for_epoch = total_reserves - reserved_usdc
 *   3. Rebalanced only available_for_epoch into yes/no reserves
 *   4. NEVER wrote reserved_usdc back — funds vanished
 *
 * The fix removes reservation logic entirely, rebalancing full total_reserves
 * to 50:50. This is safe because process_withdrawal calculates payouts from
 * total reserves post-settlement and requires active_epoch == None.
 *
 * Run from WSL:
 *   cd /mnt/d/dev/fogopulse/anchor
 *   npx tsx tests/settle-epoch-rebalance-regression.test.ts
 */

// =============================================================================
// TYPES
// =============================================================================

interface PoolState {
  yesReserves: bigint
  noReserves: bigint
  totalLpShares: bigint
  pendingWithdrawalShares: bigint
}

interface RebalanceResult {
  yesReserves: bigint
  noReserves: bigint
  totalAfter: bigint
}

interface TestResult {
  name: string
  passed: boolean
  error?: string
  details?: Record<string, string>
}

// =============================================================================
// REBALANCING IMPLEMENTATIONS
// =============================================================================

/**
 * BUGGY rebalancing (before Story 7.29 fix)
 * Reproduces the exact logic from settle_epoch.rs lines 280-301 (old code)
 */
function buggyRebalance(pool: PoolState): RebalanceResult {
  const totalReserves = pool.yesReserves + pool.noReserves

  // Bug: compute reserved_usdc and subtract it
  let reservedUsdc = 0n
  if (pool.totalLpShares > 0n && pool.pendingWithdrawalShares > 0n) {
    reservedUsdc =
      (pool.pendingWithdrawalShares * totalReserves) / pool.totalLpShares
  }

  // Bug: only rebalance the remainder — reservedUsdc vanishes
  const availableForEpoch = totalReserves - reservedUsdc
  const balancedAmount = availableForEpoch / 2n
  const remainder = availableForEpoch % 2n

  const yesReserves = balancedAmount + remainder
  const noReserves = balancedAmount

  return {
    yesReserves,
    noReserves,
    totalAfter: yesReserves + noReserves,
  }
}

/**
 * FIXED rebalancing (after Story 7.29 fix)
 * Reproduces the exact logic from settle_epoch.rs lines 280-289 (new code)
 */
function fixedRebalance(pool: PoolState): RebalanceResult {
  const totalReserves = pool.yesReserves + pool.noReserves

  // Fix: rebalance full total_reserves, no reservation
  const balancedAmount = totalReserves / 2n
  const remainder = totalReserves % 2n

  const yesReserves = balancedAmount + remainder
  const noReserves = balancedAmount

  return {
    yesReserves,
    noReserves,
    totalAfter: yesReserves + noReserves,
  }
}

/**
 * Calculate withdrawal payout (matches process_withdrawal.rs lines 150-162)
 */
function calculateWithdrawalPayout(
  pendingShares: bigint,
  yesReserves: bigint,
  noReserves: bigint,
  totalShares: bigint
): bigint {
  const poolValue = yesReserves + noReserves
  return (pendingShares * poolValue) / totalShares
}

/**
 * Calculate remaining LP share value
 */
function calculateShareValue(
  shares: bigint,
  yesReserves: bigint,
  noReserves: bigint,
  totalShares: bigint
): bigint {
  const poolValue = yesReserves + noReserves
  return (shares * poolValue) / totalShares
}

// =============================================================================
// TEST SCENARIOS (from Story 7.29 specification)
// =============================================================================

function testScenarioA(): TestResult {
  const name =
    'Scenario A: 50% pending, no trades (exact reproduction from story)'

  // Wallet A deposits 10,000 USDC, Wallet B deposits 10,000 USDC
  // Wallet B requests withdrawal during epoch (pending = 10B shares)
  // No trades occur — reserves stay balanced
  const pool: PoolState = {
    yesReserves: 10_000_000_000n, // 10,000 USDC (6 decimals)
    noReserves: 10_000_000_000n,
    totalLpShares: 20_000_000_000n, // 20B shares
    pendingWithdrawalShares: 10_000_000_000n, // 10B pending (Wallet B)
  }

  const totalBefore = pool.yesReserves + pool.noReserves // 20,000 USDC

  // Verify buggy version loses funds
  const buggy = buggyRebalance(pool)
  const buggyLoss = totalBefore - buggy.totalAfter

  if (buggyLoss === 0n) {
    return { name, passed: false, error: 'Buggy rebalance should lose funds but did not' }
  }

  // Verify fixed version preserves funds
  const fixed = fixedRebalance(pool)

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Fixed rebalance lost funds: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  // Verify withdrawal payout is correct after fix
  const withdrawalPayout = calculateWithdrawalPayout(
    pool.pendingWithdrawalShares,
    fixed.yesReserves,
    fixed.noReserves,
    pool.totalLpShares
  )

  if (withdrawalPayout !== 10_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Withdrawal payout wrong: expected 10000000000, got ${withdrawalPayout}`,
    }
  }

  // Verify remaining LP value is correct
  const remainingShares = pool.totalLpShares - pool.pendingWithdrawalShares
  const remainingValue = calculateShareValue(
    remainingShares,
    fixed.yesReserves - withdrawalPayout / 2n,
    fixed.noReserves - withdrawalPayout / 2n,
    pool.totalLpShares - pool.pendingWithdrawalShares
  )

  if (remainingValue !== 10_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Remaining LP value wrong: expected 10000000000, got ${remainingValue}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      buggyLoss: `${buggyLoss} (${Number(buggyLoss) / 1_000_000} USDC vanished)`,
      fixedTotal: fixed.totalAfter.toString(),
      withdrawalPayout: `${withdrawalPayout} (${Number(withdrawalPayout) / 1_000_000} USDC)`,
      remainingLpValue: `${remainingValue} (${Number(remainingValue) / 1_000_000} USDC)`,
    },
  }
}

function testScenarioB(): TestResult {
  const name = 'Scenario B: 25% pending, trades happened'

  // Trades shifted reserves to yes=15,000, no=5,000
  // 25% of shares pending withdrawal
  const pool: PoolState = {
    yesReserves: 15_000_000_000n,
    noReserves: 5_000_000_000n,
    totalLpShares: 20_000_000_000n,
    pendingWithdrawalShares: 5_000_000_000n, // 25%
  }

  const totalBefore = pool.yesReserves + pool.noReserves // 20,000 USDC

  // Verify buggy version loses funds
  const buggy = buggyRebalance(pool)
  const buggyLoss = totalBefore - buggy.totalAfter

  if (buggyLoss === 0n) {
    return { name, passed: false, error: 'Buggy rebalance should lose funds' }
  }

  // Verify fixed version preserves funds
  const fixed = fixedRebalance(pool)

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Fixed rebalance lost funds: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  // Verify withdrawal payout: (5B * 20,000) / 20B = 5,000
  const withdrawalPayout = calculateWithdrawalPayout(
    pool.pendingWithdrawalShares,
    fixed.yesReserves,
    fixed.noReserves,
    pool.totalLpShares
  )

  if (withdrawalPayout !== 5_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Withdrawal payout wrong: expected 5000000000, got ${withdrawalPayout}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      buggyLoss: `${buggyLoss} (${Number(buggyLoss) / 1_000_000} USDC vanished)`,
      fixedTotal: fixed.totalAfter.toString(),
      withdrawalPayout: `${withdrawalPayout} (${Number(withdrawalPayout) / 1_000_000} USDC)`,
    },
  }
}

function testScenarioC(): TestResult {
  const name = 'Scenario C: 100% pending withdrawal'

  // All shares pending — entire TVL should be preserved for withdrawal
  const pool: PoolState = {
    yesReserves: 12_000_000_000n,
    noReserves: 8_000_000_000n,
    totalLpShares: 20_000_000_000n,
    pendingWithdrawalShares: 20_000_000_000n, // 100%
  }

  const totalBefore = pool.yesReserves + pool.noReserves // 20,000 USDC

  // Verify buggy version loses ALL funds
  const buggy = buggyRebalance(pool)
  const buggyLoss = totalBefore - buggy.totalAfter

  if (buggyLoss !== totalBefore) {
    return {
      name,
      passed: false,
      error: `100% pending should lose 100% in buggy version, lost ${buggyLoss}`,
    }
  }

  // Verify fixed version preserves ALL funds
  const fixed = fixedRebalance(pool)

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Fixed rebalance lost funds: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  // Verify full withdrawal payout: (20B * 20,000) / 20B = 20,000
  const withdrawalPayout = calculateWithdrawalPayout(
    pool.pendingWithdrawalShares,
    fixed.yesReserves,
    fixed.noReserves,
    pool.totalLpShares
  )

  if (withdrawalPayout !== 20_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Withdrawal payout wrong: expected 20000000000, got ${withdrawalPayout}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      buggyLoss: `${buggyLoss} (${Number(buggyLoss) / 1_000_000} USDC — TOTAL LOSS)`,
      fixedTotal: fixed.totalAfter.toString(),
      withdrawalPayout: `${withdrawalPayout} (${Number(withdrawalPayout) / 1_000_000} USDC)`,
    },
  }
}

function testScenarioD(): TestResult {
  const name = 'Scenario D: Trades + partial withdrawal (small pool)'

  // Small pool with trading imbalance
  const pool: PoolState = {
    yesReserves: 4_000_000_000n,
    noReserves: 1_000_000_000n,
    totalLpShares: 5_000_000_000n,
    pendingWithdrawalShares: 2_000_000_000n, // 40%
  }

  const totalBefore = pool.yesReserves + pool.noReserves // 5,000 USDC

  // Verify buggy version loses funds
  const buggy = buggyRebalance(pool)
  const buggyLoss = totalBefore - buggy.totalAfter

  if (buggyLoss === 0n) {
    return { name, passed: false, error: 'Buggy rebalance should lose funds' }
  }

  // Verify fixed version preserves funds
  const fixed = fixedRebalance(pool)

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Fixed rebalance lost funds: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  // Verify withdrawal payout: (2B * 5,000) / 5B = 2,000
  const withdrawalPayout = calculateWithdrawalPayout(
    pool.pendingWithdrawalShares,
    fixed.yesReserves,
    fixed.noReserves,
    pool.totalLpShares
  )

  if (withdrawalPayout !== 2_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Withdrawal payout wrong: expected 2000000000, got ${withdrawalPayout}`,
    }
  }

  // Verify remaining LP value: (3B * 3,000) / 3B = 3,000
  const remainingShares = pool.totalLpShares - pool.pendingWithdrawalShares
  const remainingReservesYes = fixed.yesReserves - withdrawalPayout / 2n
  const remainingReservesNo = fixed.noReserves - withdrawalPayout / 2n
  const remainingValue = calculateShareValue(
    remainingShares,
    remainingReservesYes,
    remainingReservesNo,
    remainingShares
  )

  if (remainingValue !== 3_000_000_000n) {
    return {
      name,
      passed: false,
      error: `Remaining LP value wrong: expected 3000000000, got ${remainingValue}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      buggyLoss: `${buggyLoss} (${Number(buggyLoss) / 1_000_000} USDC vanished)`,
      fixedTotal: fixed.totalAfter.toString(),
      withdrawalPayout: `${withdrawalPayout} (${Number(withdrawalPayout) / 1_000_000} USDC)`,
      remainingLpValue: `${remainingValue} (${Number(remainingValue) / 1_000_000} USDC)`,
    },
  }
}

function testNoPendingWithdrawals(): TestResult {
  const name = 'No pending withdrawals — both implementations agree'

  const pool: PoolState = {
    yesReserves: 15_000_000_000n,
    noReserves: 5_000_000_000n,
    totalLpShares: 20_000_000_000n,
    pendingWithdrawalShares: 0n, // No pending
  }

  const totalBefore = pool.yesReserves + pool.noReserves

  const buggy = buggyRebalance(pool)
  const fixed = fixedRebalance(pool)

  // Both should produce identical results with no pending withdrawals
  if (buggy.yesReserves !== fixed.yesReserves || buggy.noReserves !== fixed.noReserves) {
    return {
      name,
      passed: false,
      error: `Implementations diverge with no pending: buggy=(${buggy.yesReserves},${buggy.noReserves}) fixed=(${fixed.yesReserves},${fixed.noReserves})`,
    }
  }

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Total not preserved: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      yesAfter: fixed.yesReserves.toString(),
      noAfter: fixed.noReserves.toString(),
      note: 'Bug only manifests when pendingWithdrawalShares > 0',
    },
  }
}

function testOddTotalWithPending(): TestResult {
  const name = 'Odd total reserves with pending — remainder goes to YES'

  const pool: PoolState = {
    yesReserves: 7_000_000_001n, // Odd total
    noReserves: 4_000_000_000n,
    totalLpShares: 11_000_000_000n,
    pendingWithdrawalShares: 3_000_000_000n,
  }

  const totalBefore = pool.yesReserves + pool.noReserves // 11,000,000,001

  const fixed = fixedRebalance(pool)

  if (fixed.totalAfter !== totalBefore) {
    return {
      name,
      passed: false,
      error: `Total not preserved: before=${totalBefore}, after=${fixed.totalAfter}`,
    }
  }

  // YES should be NO + 1 for odd totals
  if (fixed.yesReserves !== fixed.noReserves + 1n) {
    return {
      name,
      passed: false,
      error: `Odd remainder not in YES: yes=${fixed.yesReserves}, no=${fixed.noReserves}`,
    }
  }

  return {
    name,
    passed: true,
    details: {
      total: totalBefore.toString(),
      yesAfter: fixed.yesReserves.toString(),
      noAfter: fixed.noReserves.toString(),
    },
  }
}

function testBuggyLossScaling(): TestResult {
  const name = 'Bug loss scales linearly with pending percentage (impact table)'

  const tvl = 20_000_000_000n // 20,000 USDC
  const totalShares = 20_000_000_000n
  const pendingPercentages = [25n, 50n, 75n, 100n]
  const expectedLosses = [5_000_000_000n, 10_000_000_000n, 15_000_000_000n, 20_000_000_000n]

  for (let i = 0; i < pendingPercentages.length; i++) {
    const pct = pendingPercentages[i]
    const pending = (totalShares * pct) / 100n

    const pool: PoolState = {
      yesReserves: tvl / 2n,
      noReserves: tvl / 2n,
      totalLpShares: totalShares,
      pendingWithdrawalShares: pending,
    }

    const buggy = buggyRebalance(pool)
    const loss = tvl - buggy.totalAfter

    if (loss !== expectedLosses[i]) {
      return {
        name,
        passed: false,
        error: `${pct}% pending: expected loss ${expectedLosses[i]}, got ${loss}`,
      }
    }

    // Fixed version should have zero loss
    const fixed = fixedRebalance(pool)
    if (fixed.totalAfter !== tvl) {
      return {
        name,
        passed: false,
        error: `${pct}% pending: fixed version lost funds`,
      }
    }
  }

  return {
    name,
    passed: true,
    details: {
      '25% pending loss': `${Number(expectedLosses[0]) / 1_000_000} USDC`,
      '50% pending loss': `${Number(expectedLosses[1]) / 1_000_000} USDC`,
      '75% pending loss': `${Number(expectedLosses[2]) / 1_000_000} USDC`,
      '100% pending loss': `${Number(expectedLosses[3]) / 1_000_000} USDC (TOTAL)`,
    },
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('='.repeat(60))
  console.log('Story 7.29 — Rebalancing Regression Test (Offline Math)')
  console.log('='.repeat(60))
  console.log()
  console.log('Verifies that the fixed rebalancing logic preserves total')
  console.log('reserves when pending withdrawals exist, and that the buggy')
  console.log('version would have lost funds.')
  console.log()

  const results: TestResult[] = [
    testScenarioA(),
    testScenarioB(),
    testScenarioC(),
    testScenarioD(),
    testNoPendingWithdrawals(),
    testOddTotalWithPending(),
    testBuggyLossScaling(),
  ]

  // Print results
  console.log('='.repeat(60))
  console.log('TEST RESULTS')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0

  for (const result of results) {
    if (result.passed) {
      console.log(`\n  PASS: ${result.name}`)
      if (result.details) {
        for (const [key, value] of Object.entries(result.details)) {
          console.log(`        ${key}: ${value}`)
        }
      }
      passed++
    } else {
      console.log(`\n  FAIL: ${result.name}`)
      console.log(`        Error: ${result.error}`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  if (failed > 0) {
    process.exit(1)
  }
}

main()
