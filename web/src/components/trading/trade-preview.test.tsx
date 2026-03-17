/**
 * @jest-environment jsdom
 */
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectionProvider } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import type { ReactNode } from 'react'

import { TradePreview } from './trade-preview'
import { useTradeStore } from '@/stores/trade-store'
import type { Asset } from '@/types/assets'

// Mock Connection to avoid real network calls
const mockOnAccountChange = jest.fn().mockReturnValue(1)
const mockRemoveAccountChangeListener = jest.fn()

jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js')
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      onAccountChange: mockOnAccountChange,
      removeAccountChangeListener: mockRemoveAccountChangeListener,
      getAccountInfo: jest.fn(),
      commitment: 'confirmed',
    })),
  }
})

// Mock the Anchor Program
const mockPoolFetch = jest.fn()
jest.mock('@coral-xyz/anchor', () => {
  const actual = jest.requireActual('@coral-xyz/anchor')
  return {
    ...actual,
    Program: jest.fn().mockImplementation(() => ({
      account: {
        pool: {
          fetch: mockPoolFetch,
        },
      },
    })),
    AnchorProvider: jest.fn().mockImplementation(() => ({})),
  }
})

// Mock the IDL
jest.mock('@/lib/fogopulse.json', () => ({}), { virtual: true })

// Mock useUserPosition to avoid wallet provider dependency
jest.mock('@/hooks/use-user-position', () => ({
  useUserPosition: () => ({
    position: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}))

// Mock constants
jest.mock('@/lib/constants', () => ({
  POOL_PDAS: {
    BTC: { toString: () => 'btc-pool-pda' },
    ETH: { toString: () => 'eth-pool-pda' },
    SOL: { toString: () => 'sol-pool-pda' },
    FOGO: { toString: () => 'fogo-pool-pda' },
  },
  FOGO_TESTNET_RPC: 'https://testnet.fogo.io',
  TRADING_FEE_BPS: 180,
  PER_WALLET_CAP_BPS: 500,
  PER_SIDE_CAP_BPS: 3000,
  USDC_DECIMALS: 6,
}))

// Test wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint="https://testnet.fogo.io">
          {children}
        </ConnectionProvider>
      </QueryClientProvider>
    )
  }
}

// Helper to create standard mock pool data
function createMockPool(yesReserves: number, noReserves: number) {
  return {
    assetMint: new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY'),
    yesReserves: new BN(yesReserves),
    noReserves: new BN(noReserves),
    totalLpShares: new BN(yesReserves + noReserves),
    nextEpochId: new BN(1),
    activeEpoch: null,
    activeEpochState: 0,
    walletCapBps: 500,
    sideCapBps: 3000,
    isPaused: false,
    isFrozen: false,
    bump: 255,
  }
}

describe('TradePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset trade store
    act(() => {
      useTradeStore.getState().reset()
    })
  })

  it('renders nothing when preview data is not available', () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    // No direction or amount set - should render nothing
    expect(container.firstChild).toBeNull()
  })

  it('renders preview when direction and amount are set', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    // Wait for async operations
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    // Check that preview container is rendered
    expect(screen.getByTestId('trade-preview')).toBeInTheDocument()
    expect(screen.getByText('Trade Preview')).toBeInTheDocument()
  })

  it('displays entry price', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('Entry Price')).toBeInTheDocument()
    expect(screen.getByText(/\/ share/)).toBeInTheDocument()
  })

  it('displays shares to receive', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('Shares')).toBeInTheDocument()
    expect(screen.getByText(/shares$/)).toBeInTheDocument()
  })

  it('displays fee amount and percentage', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('Fee (1.8%)')).toBeInTheDocument()
  })

  it('displays potential payout for UP trade', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('If UP Wins')).toBeInTheDocument()
    expect(screen.getByText('If DOWN Wins')).toBeInTheDocument()
  })

  it('displays potential payout for DOWN trade', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('down')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('If DOWN Wins')).toBeInTheDocument()
    expect(screen.getByText('If UP Wins')).toBeInTheDocument()
  })

  it('displays market impact section', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('Market Impact')).toBeInTheDocument()
    expect(screen.getByText('UP')).toBeInTheDocument()
    expect(screen.getByText('DOWN')).toBeInTheDocument()
  })

  it('displays price impact', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(screen.getByText('Price Impact')).toBeInTheDocument()
  })

  it('shows high price impact warning for large trades on imbalanced pool', async () => {
    // Imbalanced pool - UP trade will have high price impact
    mockPoolFetch.mockResolvedValue(createMockPool(900_000_000, 100_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100') // Large relative to reserves
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    // Should show high price impact warning
    expect(screen.getByText(/High price impact detected/)).toBeInTheDocument()
  })

  it('accepts custom className', async () => {
    mockPoolFetch.mockResolvedValue(createMockPool(500_000_000, 500_000_000))

    act(() => {
      useTradeStore.getState().setDirection('up')
      useTradeStore.getState().setAmount('100')
    })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <TradePreview asset={'BTC' as Asset} className="custom-class" />
      </Wrapper>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const preview = screen.getByTestId('trade-preview')
    expect(preview).toHaveClass('custom-class')
  })
})
