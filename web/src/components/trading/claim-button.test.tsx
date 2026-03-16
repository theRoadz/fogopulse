/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { ClaimButton } from './claim-button'
import { EpochState, Outcome } from '@/types/epoch'
import type { EpochData } from '@/types/epoch'
import type { PoolData } from '@/types/pool'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { ClaimState } from '@/hooks/use-claimable-amount'

// Mock wallet
const mockPublicKey = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
let mockWalletPublicKey: PublicKey | null = mockPublicKey

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: mockWalletPublicKey,
    sendTransaction: jest.fn(),
  }),
  useConnection: () => ({
    connection: {},
  }),
}))

// Mock useUserPosition
let mockPosition: UserPositionData | null = null
let mockIsPositionLoading = false

jest.mock('@/hooks/use-user-position', () => ({
  useUserPosition: () => ({
    position: mockPosition,
    isLoading: mockIsPositionLoading,
    error: null,
    refetch: jest.fn(),
  }),
}))

// Mock useClaimableAmount
let mockClaimState: ClaimState = { type: 'no-position' }
let mockDisplayAmount: string | null = null

jest.mock('@/hooks/use-claimable-amount', () => ({
  useClaimableAmount: () => ({
    claimState: mockClaimState,
    displayAmount: mockDisplayAmount,
  }),
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

// Mock useClaimPosition
const mockMutate = jest.fn()
let mockIsPending = false

jest.mock('@/hooks/use-claim-position', () => ({
  useClaimPosition: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}))

// Mock useProgram
jest.mock('@/hooks/use-program', () => ({
  useProgram: () => ({}),
}))

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, onClick, className, ...props }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, ...props }: React.ComponentProps<'span'>) => (
    <span className={className} {...props}>{children}</span>
  ),
}))

jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CheckCircle: ({ className }: { className?: string }) => <span data-testid="icon-check-circle" className={className} />,
  RefreshCw: ({ className }: { className?: string }) => <span data-testid="icon-refresh" className={className} />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="icon-loader" className={className} />,
  XCircle: ({ className }: { className?: string }) => <span data-testid="icon-x-circle" className={className} />,
}))

const mockEpochPda = new PublicKey('11111111111111111111111111111111')

const mockEpoch: EpochData = {
  pool: new PublicKey('11111111111111111111111111111111'),
  epochId: BigInt(1),
  state: EpochState.Settled,
  startTime: 1000,
  endTime: 1300,
  freezeTime: 1285,
  startPrice: BigInt(9500000000000),
  startConfidence: BigInt(1000000),
  startPublishTime: 995,
  settlementPrice: BigInt(9600000000000),
  settlementConfidence: BigInt(1000000),
  settlementPublishTime: 1305,
  outcome: Outcome.Up,
  yesTotalAtSettlement: BigInt(100_000_000),
  noTotalAtSettlement: BigInt(50_000_000),
  bump: 255,
}

const mockPool: PoolData = {
  assetMint: new PublicKey('11111111111111111111111111111111'),
  yesReserves: BigInt(100_000_000),
  noReserves: BigInt(100_000_000),
  totalLpShares: BigInt(0),
  nextEpochId: BigInt(2),
  activeEpoch: null,
  activeEpochState: 0,
  walletCapBps: 500,
  sideCapBps: 3000,
  isPaused: false,
  isFrozen: false,
  bump: 255,
}

function renderClaimButton(overrides: Partial<React.ComponentProps<typeof ClaimButton>> = {}) {
  return render(
    <ClaimButton
      asset="BTC"
      epoch={mockEpoch}
      epochPda={mockEpochPda}
      pool={mockPool}
      {...overrides}
    />
  )
}

describe('ClaimButton', () => {
  beforeEach(() => {
    mockWalletPublicKey = mockPublicKey
    mockPosition = null
    mockIsPositionLoading = false
    mockClaimState = { type: 'no-position' }
    mockDisplayAmount = null
    mockIsPending = false
    mockMutate.mockClear()
  })

  it('renders nothing when no wallet is connected', () => {
    mockWalletPublicKey = null
    const { container } = renderClaimButton()
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when position is loading', () => {
    mockIsPositionLoading = true
    const { container } = renderClaimButton()
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when no position exists', () => {
    mockClaimState = { type: 'no-position' }
    const { container } = renderClaimButton()
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when epoch is not settled', () => {
    mockClaimState = { type: 'not-settled' }
    const { container } = renderClaimButton()
    expect(container.innerHTML).toBe('')
  })

  it('renders claim payout button for winner', () => {
    mockClaimState = { type: 'winner', amount: BigInt(15_000_000) }
    mockDisplayAmount = '15.00'
    mockPosition = {} as UserPositionData

    renderClaimButton()

    expect(screen.getByTestId('claim-action')).toBeInTheDocument()
    expect(screen.getByTestId('claim-payout-button')).toBeInTheDocument()
    expect(screen.getByText('Claim Payout: 15.00 USDC')).toBeInTheDocument()
  })

  it('renders claim refund button for refunded epoch', () => {
    mockClaimState = { type: 'refund', amount: BigInt(10_000_000) }
    mockDisplayAmount = '10.00'
    mockPosition = {} as UserPositionData

    renderClaimButton()

    expect(screen.getByTestId('claim-action')).toBeInTheDocument()
    expect(screen.getByTestId('claim-refund-button')).toBeInTheDocument()
    expect(screen.getByText('Claim Refund: 10.00 USDC')).toBeInTheDocument()
  })

  it('renders claimed badge when already claimed', () => {
    mockClaimState = { type: 'claimed' }
    mockPosition = {} as UserPositionData

    renderClaimButton()

    expect(screen.getByTestId('claim-claimed')).toBeInTheDocument()
    expect(screen.getByText('Claimed')).toBeInTheDocument()
  })

  it('renders position lost text for losers', () => {
    mockClaimState = { type: 'lost' }
    mockPosition = {} as UserPositionData

    renderClaimButton()

    expect(screen.getByTestId('claim-lost')).toBeInTheDocument()
    expect(screen.getByText('Position Lost')).toBeInTheDocument()
  })

  it('renders frozen message when pool is frozen', () => {
    mockClaimState = { type: 'winner', amount: BigInt(15_000_000) }
    mockDisplayAmount = '15.00'
    mockPosition = {} as UserPositionData

    renderClaimButton({ pool: { ...mockPool, isFrozen: true } })

    expect(screen.getByTestId('claim-frozen')).toBeInTheDocument()
    expect(screen.getByText('Claims temporarily disabled')).toBeInTheDocument()
  })

  it('renders frozen message for refund when pool is frozen', () => {
    mockClaimState = { type: 'refund', amount: BigInt(10_000_000) }
    mockDisplayAmount = '10.00'
    mockPosition = {} as UserPositionData

    renderClaimButton({ pool: { ...mockPool, isFrozen: true } })

    expect(screen.getByTestId('claim-frozen')).toBeInTheDocument()
  })

  it('calls mutate when payout button is clicked', () => {
    mockClaimState = { type: 'winner', amount: BigInt(15_000_000) }
    mockDisplayAmount = '15.00'
    mockPosition = {} as UserPositionData

    renderClaimButton()

    fireEvent.click(screen.getByTestId('claim-payout-button'))

    expect(mockMutate).toHaveBeenCalledWith({
      asset: 'BTC',
      type: 'payout',
      epochPda: mockEpochPda,
      userPubkey: mockPublicKey.toString(),
      displayAmount: '15.00',
    })
  })

  it('calls mutate with refund type when refund button is clicked', () => {
    mockClaimState = { type: 'refund', amount: BigInt(10_000_000) }
    mockDisplayAmount = '10.00'
    mockPosition = {} as UserPositionData

    renderClaimButton()

    fireEvent.click(screen.getByTestId('claim-refund-button'))

    expect(mockMutate).toHaveBeenCalledWith({
      asset: 'BTC',
      type: 'refund',
      epochPda: mockEpochPda,
      userPubkey: mockPublicKey.toString(),
      displayAmount: '10.00',
    })
  })

  it('shows loading state during transaction', () => {
    mockClaimState = { type: 'winner', amount: BigInt(15_000_000) }
    mockDisplayAmount = '15.00'
    mockPosition = {} as UserPositionData
    mockIsPending = true

    renderClaimButton()

    expect(screen.getByText('Claiming...')).toBeInTheDocument()
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
    expect(screen.getByTestId('claim-payout-button')).toBeDisabled()
  })

  it('does not render claim section for claimed position even when frozen', () => {
    mockClaimState = { type: 'claimed' }
    mockPosition = {} as UserPositionData

    renderClaimButton({ pool: { ...mockPool, isFrozen: true } })

    // Should show "Claimed" badge, not frozen message
    expect(screen.getByTestId('claim-claimed')).toBeInTheDocument()
  })
})
