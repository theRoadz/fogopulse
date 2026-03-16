/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'

import { SettlementHistoryRow } from './settlement-history-row'
import { EpochState, Outcome } from '@/types/epoch'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import type { UserPositionData } from '@/hooks/use-user-position'
import type { EpochData } from '@/types/epoch'

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
  formatUsdPrice: (price: number) => `$${price.toFixed(2)}`,
}))

// Mock UI components
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, ...props }: React.ComponentProps<'span'>) => (
    <span className={className} {...props}>{children}</span>
  ),
}))

jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleTrigger: ({ children, asChild, ...props }: React.ComponentProps<'div'> & { asChild?: boolean }) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleContent: ({ children, className }: React.ComponentProps<'div'>) => (
    <div className={className}>{children}</div>
  ),
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
  ArrowUp: () => <span data-testid="arrow-up" />,
  ArrowDown: () => <span data-testid="arrow-down" />,
  Check: () => <span data-testid="check-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
}))

// Mock SettlementStatusPanel
jest.mock('./settlement-status-panel', () => ({
  SettlementStatusPanel: ({ title }: { title: string }) => (
    <div data-testid="settlement-status-panel">{title}</div>
  ),
}))

// Mock use-claimable-amount
jest.mock('@/hooks/use-claimable-amount', () => ({
  getClaimState: jest.fn(() => ({ type: 'lost' })),
  formatUsdcAmount: (amount: bigint) => (Number(amount) / 1_000_000).toFixed(2),
}))

const poolPda = new PublicKey('11111111111111111111111111111111')

function createMockSettlement(overrides: Partial<LastSettledEpochData> = {}): LastSettledEpochData {
  const rawEpochData: EpochData = {
    pool: poolPda,
    epochId: BigInt(42),
    state: EpochState.Settled,
    startTime: 1710496500,
    endTime: 1710497400,
    freezeTime: 1710497385,
    startPrice: BigInt(6917398000000),
    startConfidence: BigInt(4847879),
    startPublishTime: 1710496800,
    settlementPrice: BigInt(6918012000000),
    settlementConfidence: BigInt(3458947),
    settlementPublishTime: 1710497100,
    outcome: Outcome.Up,
    yesTotalAtSettlement: BigInt(100000000),
    noTotalAtSettlement: BigInt(50000000),
    bump: 255,
  }

  return {
    epochId: BigInt(42),
    epochPda: PublicKey.default,
    state: EpochState.Settled,
    outcome: Outcome.Up,
    startPrice: 69173.98,
    startConfidencePercent: '0.0701%',
    startPublishTime: 1710496800,
    settlementPrice: 69180.12,
    settlementConfidencePercent: '0.0500%',
    settlementPublishTime: Math.floor(Date.now() / 1000) - 300, // 5m ago
    priceDelta: 6.14,
    priceDeltaPercent: '+0.01%',
    startConfidenceRaw: BigInt(4847879),
    settlementConfidenceRaw: BigInt(3458947),
    yesTotalAtSettlement: BigInt(100000000),
    noTotalAtSettlement: BigInt(50000000),
    rawEpochData,
    ...overrides,
  }
}

function createMockPosition(overrides: Partial<UserPositionData> = {}): UserPositionData {
  return {
    user: PublicKey.default,
    epoch: PublicKey.default,
    direction: 'up',
    amount: BigInt(50000000), // 50 USDC
    shares: BigInt(50000000),
    entryPrice: BigInt(5000),
    claimed: false,
    bump: 254,
    ...overrides,
  }
}

describe('SettlementHistoryRow', () => {
  it('should render epoch ID', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('epoch-id')).toHaveTextContent('#42')
  })

  it('should render outcome badge for UP WON', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('outcome-badge')).toHaveTextContent('UP WON')
  })

  it('should render outcome badge for DOWN WON', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement({ outcome: Outcome.Down })}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('outcome-badge')).toHaveTextContent('DOWN WON')
  })

  it('should render outcome badge for REFUNDED', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement({ outcome: Outcome.Refunded, state: EpochState.Refunded })}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('outcome-badge')).toHaveTextContent('REFUNDED')
  })

  it('should render price delta', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('price-delta')).toHaveTextContent('+0.01%')
  })

  it('should render time ago', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('time-ago')).toBeInTheDocument()
    // Should contain "m ago" since we set it 5 minutes ago
    expect(screen.getByTestId('time-ago').textContent).toMatch(/\d+m ago/)
  })

  it('should not show user position when wallet is not connected', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={createMockPosition()}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.queryByTestId('user-position')).not.toBeInTheDocument()
  })

  it('should not show user position when position is null', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={true}
        asset="BTC"
      />
    )

    expect(screen.queryByTestId('user-position')).not.toBeInTheDocument()
  })

  it('should show user position when wallet connected and position exists', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={createMockPosition()}
        isWalletConnected={true}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('user-position')).toBeInTheDocument()
  })

  it('should render expanded settlement panel', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    // The CollapsibleContent renders the panel (our mock always shows it)
    expect(screen.getByTestId('settlement-status-panel')).toBeInTheDocument()
    expect(screen.getByTestId('settlement-status-panel')).toHaveTextContent('Epoch #42 Settlement')
  })

  it('should have data-testid attribute', () => {
    render(
      <SettlementHistoryRow
        settlement={createMockSettlement()}
        position={null}
        isWalletConnected={false}
        asset="BTC"
      />
    )

    expect(screen.getByTestId('settlement-history-row')).toBeInTheDocument()
  })
})
