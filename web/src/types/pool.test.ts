import { describe, it, expect } from 'vitest'
import { calculateProbabilities } from './pool'

describe('calculateProbabilities', () => {
  it('returns 50/50 when reserves are zero', () => {
    expect(calculateProbabilities(0n, 0n)).toEqual({ pUp: 50, pDown: 50 })
  })

  it('returns 50/50 when reserves are equal', () => {
    expect(calculateProbabilities(1000n, 1000n)).toEqual({ pUp: 50, pDown: 50 })
  })

  it('returns 50/50 when reserves differ by 1 lamport (post-settlement rebalance)', () => {
    // Actual on-chain values from epoch 87 settlement
    const yesReserves = 16_024_063_559n
    const noReserves = 16_024_063_558n
    expect(calculateProbabilities(yesReserves, noReserves)).toEqual({ pUp: 50, pDown: 50 })
  })

  it('returns correct probabilities for skewed reserves', () => {
    // noReserves is 75% of total → pUp = 75
    expect(calculateProbabilities(25n, 75n)).toEqual({ pUp: 75, pDown: 25 })
  })

  it('returns 100/0 when all reserves are on one side', () => {
    expect(calculateProbabilities(0n, 100n)).toEqual({ pUp: 100, pDown: 0 })
    expect(calculateProbabilities(100n, 0n)).toEqual({ pUp: 0, pDown: 100 })
  })
})
