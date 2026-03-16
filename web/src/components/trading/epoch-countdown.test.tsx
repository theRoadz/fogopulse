/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { EpochCountdown } from './epoch-countdown'
import { EpochState } from '@/types/epoch'
import type { EpochUIState } from '@/types/epoch'
import { PublicKey } from '@solana/web3.js'

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

describe('EpochCountdown', () => {
  const mockPoolPda = new PublicKey('11111111111111111111111111111112')
  const now = Math.floor(Date.now() / 1000)

  const createEpochState = (overrides: Partial<EpochUIState> = {}): EpochUIState => ({
    epoch: {
      pool: mockPoolPda,
      epochId: BigInt(1),
      state: EpochState.Open,
      startTime: now - 60,
      endTime: now + 240,
      freezeTime: now + 225,
      startPrice: BigInt(9500000000000),
      startConfidence: BigInt(1000000),
      startPublishTime: now - 65,
      settlementPrice: null,
      settlementConfidence: null,
      settlementPublishTime: null,
      outcome: null,
      yesTotalAtSettlement: null,
      noTotalAtSettlement: null,
      bump: 255,
    },
    timeRemaining: 240,
    isFrozen: false,
    isSettling: false,
    isSettled: false,
    startPriceDisplay: 95000,
    priceExponent: -8,
    ...overrides,
  })

  describe('countdown display', () => {
    it('should display time in MM:SS format', () => {
      const epochState = createEpochState({ timeRemaining: 125 }) // 2:05

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('02:05')).toBeInTheDocument()
    })

    it('should pad single digit seconds', () => {
      const epochState = createEpochState({ timeRemaining: 63 }) // 1:03

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('01:03')).toBeInTheDocument()
    })

    it('should display 00:00 when time is 0', () => {
      const epochState = createEpochState({ timeRemaining: 0 })

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('00:00')).toBeInTheDocument()
    })

    it('should display 00:00 for negative time', () => {
      const epochState = createEpochState({ timeRemaining: -10 })

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('00:00')).toBeInTheDocument()
    })
  })

  describe('normal state', () => {
    it('should display "Time Remaining" text', () => {
      const epochState = createEpochState({ timeRemaining: 240 })

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('Time Remaining')).toBeInTheDocument()
    })

    it('should not show freeze warning when more than 30s to freeze', () => {
      const epochState = createEpochState({
        timeRemaining: 240,
        epoch: {
          ...createEpochState().epoch!,
          freezeTime: now + 100, // 100 seconds to freeze
        },
      })

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.queryByText(/Trading closes in/)).not.toBeInTheDocument()
    })
  })

  describe('freeze warning state', () => {
    it('should show freeze warning when within 30 seconds of freeze', () => {
      // Epoch ends in 45 seconds, freezes 15 seconds before end
      // So timeRemaining=45, freezeTime=now+30, endTime=now+45
      // timeToFreeze = timeRemaining - (endTime - freezeTime) = 45 - 15 = 30
      const epochState = createEpochState({
        timeRemaining: 45,
        isFrozen: false,
        epoch: {
          ...createEpochState().epoch!,
          endTime: now + 45,
          freezeTime: now + 30, // 30 seconds to freeze (within warning threshold)
        },
      })

      render(<EpochCountdown epochState={epochState} />)

      // The component calculates timeToFreeze from timeRemaining
      expect(screen.getByText(/Trading closes in/)).toBeInTheDocument()
    })

    it('should calculate timeToFreeze based on timeRemaining (not stale Date.now)', () => {
      // This tests the fix: timeToFreeze should derive from timeRemaining
      // endTime - freezeTime = 15 (freeze offset)
      // timeToFreeze = timeRemaining - freezeOffset = 25 - 15 = 10
      const epochState = createEpochState({
        timeRemaining: 25,
        isFrozen: false,
        epoch: {
          ...createEpochState().epoch!,
          endTime: now + 25,
          freezeTime: now + 10, // 10 seconds to freeze
        },
      })

      render(<EpochCountdown epochState={epochState} />)

      // Should show "Trading closes in 10s"
      expect(screen.getByText('Trading closes in 10s')).toBeInTheDocument()
    })
  })

  describe('frozen state', () => {
    it('should display "Trading Closed" when frozen', () => {
      const epochState = createEpochState({
        isFrozen: true,
        timeRemaining: 15,
      })

      render(<EpochCountdown epochState={epochState} />)

      expect(screen.getByText('Trading Closed')).toBeInTheDocument()
    })
  })

  describe('no epoch state', () => {
    it('should render nothing when no epoch', () => {
      const epochState: EpochUIState = {
        epoch: null,
        timeRemaining: 0,
        isFrozen: false,
        isSettling: false,
        isSettled: false,
        startPriceDisplay: null,
        priceExponent: -8,
      }

      const { container } = render(<EpochCountdown epochState={epochState} />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('styling', () => {
    it('should apply custom className', () => {
      const epochState = createEpochState()

      const { container } = render(
        <EpochCountdown epochState={epochState} className="test-class" />
      )

      expect(container.firstChild).toHaveClass('test-class')
    })
  })
})
