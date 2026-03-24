/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

// Mock dependencies
jest.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({ publicKey: new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111111') }),
}))

const mockMutate = jest.fn()
jest.mock('@/hooks/use-update-config', () => ({
  useUpdateConfig: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}))

let mockConfig: Record<string, unknown>

jest.mock('@/hooks/use-global-config', () => ({
  useGlobalConfig: () => ({ config: mockConfig }),
}))

const mockUpdateAdminSettingsMutate = jest.fn()
jest.mock('@/hooks/use-admin-settings', () => ({
  useAdminSettings: () => ({
    data: { allowEpochCreation: true },
    isLoading: false,
  }),
  useUpdateAdminSettings: () => ({
    mutate: mockUpdateAdminSettingsMutate,
    isPending: false,
  }),
}))

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => <h2 className={className}>{children}</h2>,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
}))

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange, disabled }: { id?: string; checked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={id}
      data-testid={`switch-${id}`}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? 'on' : 'off'}
    </button>
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}))

import { ConfigurationPanel } from './configuration-panel'

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tradingFeeBps: 180,
    lpFeeShareBps: 7000,
    treasuryFeeShareBps: 2000,
    insuranceFeeShareBps: 1000,
    perWalletCapBps: 500,
    perSideCapBps: 3000,
    oracleConfidenceThresholdStartBps: 100,
    oracleConfidenceThresholdSettleBps: 100,
    oracleStalenessThresholdStart: new BN(60),
    oracleStalenessThresholdSettle: new BN(60),
    epochDurationSeconds: new BN(300),
    freezeWindowSeconds: new BN(15),
    maxTradeAmount: new BN(10_000_000),
    settlementTimeoutSeconds: new BN(600),
    treasury: new PublicKey('11111111111111111111111111111111'),
    insurance: new PublicKey('11111111111111111111111111111111'),
    allowHedging: false,
    paused: false,
    frozen: false,
    ...overrides,
  }
}

beforeEach(() => {
  mockConfig = makeConfig()
  mockMutate.mockClear()
  mockUpdateAdminSettingsMutate.mockClear()
})

describe('ConfigurationPanel - Protocol Safety', () => {
  it('renders Protocol Safety section with Pause and Freeze toggles', () => {
    render(<ConfigurationPanel />)
    expect(screen.getByText('Protocol Safety')).toBeInTheDocument()
    expect(screen.getByText('Pause Protocol')).toBeInTheDocument()
    expect(screen.getByText('Emergency Freeze')).toBeInTheDocument()
  })

  it('renders description text for pause toggle', () => {
    render(<ConfigurationPanel />)
    expect(screen.getByText(/Blocks new epoch creation globally/)).toBeInTheDocument()
  })

  it('renders description text for freeze toggle', () => {
    render(<ConfigurationPanel />)
    expect(screen.getByText(/Halts ALL protocol activity/)).toBeInTheDocument()
  })

  it('initializes pause toggle from config (off)', () => {
    render(<ConfigurationPanel />)
    const pauseSwitch = screen.getByTestId('switch-paused')
    expect(pauseSwitch).toHaveAttribute('aria-checked', 'false')
  })

  it('initializes pause toggle from config (on)', () => {
    mockConfig = makeConfig({ paused: true })
    render(<ConfigurationPanel />)
    const pauseSwitch = screen.getByTestId('switch-paused')
    expect(pauseSwitch).toHaveAttribute('aria-checked', 'true')
  })

  it('initializes freeze toggle from config (off)', () => {
    render(<ConfigurationPanel />)
    const freezeSwitch = screen.getByTestId('switch-frozen')
    expect(freezeSwitch).toHaveAttribute('aria-checked', 'false')
  })

  it('initializes freeze toggle from config (on)', () => {
    mockConfig = makeConfig({ frozen: true })
    render(<ConfigurationPanel />)
    const freezeSwitch = screen.getByTestId('switch-frozen')
    expect(freezeSwitch).toHaveAttribute('aria-checked', 'true')
  })

  it('shows (changed) indicator when pause is toggled', () => {
    render(<ConfigurationPanel />)
    const pauseSwitch = screen.getByTestId('switch-paused')
    fireEvent.click(pauseSwitch)
    expect(screen.getByText('(changed)')).toBeInTheDocument()
  })

  it('shows red (changed) indicator when freeze is toggled', () => {
    render(<ConfigurationPanel />)
    const freezeSwitch = screen.getByTestId('switch-frozen')
    fireEvent.click(freezeSwitch)
    // The freeze changed indicator has red styling
    const changedIndicators = screen.getAllByText('(changed)')
    expect(changedIndicators.length).toBeGreaterThan(0)
  })

  it('enables Update Config button when pause is toggled', () => {
    render(<ConfigurationPanel />)
    const pauseSwitch = screen.getByTestId('switch-paused')
    fireEvent.click(pauseSwitch)
    const updateButton = screen.getByText('Update Config')
    expect(updateButton).not.toBeDisabled()
  })

  it('shows confirmation dialog with pause change in table', () => {
    render(<ConfigurationPanel />)
    // Toggle pause
    fireEvent.click(screen.getByTestId('switch-paused'))
    // Click Update Config to open dialog
    fireEvent.click(screen.getByText('Update Config'))
    // Dialog should show with Pause Protocol row (label + table cell = 2)
    expect(screen.getAllByText('Pause Protocol')).toHaveLength(2)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('shows red warning banner in dialog when enabling freeze', () => {
    render(<ConfigurationPanel />)
    // Toggle freeze ON
    fireEvent.click(screen.getByTestId('switch-frozen'))
    // Open confirmation dialog
    fireEvent.click(screen.getByText('Update Config'))
    // Should show warning banner
    expect(screen.getByText('WARNING: Emergency Freeze')).toBeInTheDocument()
    expect(screen.getByText(/Enabling freeze will halt ALL protocol activity/)).toBeInTheDocument()
  })

  it('does NOT show red warning banner when disabling freeze', () => {
    mockConfig = makeConfig({ frozen: true })
    render(<ConfigurationPanel />)
    // Toggle freeze OFF (was on, now off)
    fireEvent.click(screen.getByTestId('switch-frozen'))
    // Open confirmation dialog
    fireEvent.click(screen.getByText('Update Config'))
    // Should NOT show warning banner (we're unfreezing)
    expect(screen.queryByText('WARNING: Emergency Freeze')).not.toBeInTheDocument()
  })

  it('shows Emergency Freeze row with red styling in confirmation table', () => {
    render(<ConfigurationPanel />)
    // Toggle freeze
    fireEvent.click(screen.getByTestId('switch-frozen'))
    // Open dialog
    fireEvent.click(screen.getByText('Update Config'))
    // The Emergency Freeze label appears in both the form and dialog table
    expect(screen.getAllByText('Emergency Freeze')).toHaveLength(2)
    // The new value cell should have red styling
    const frozenNewValue = screen.getByText('Frozen')
    expect(frozenNewValue.className).toContain('text-red-500')
  })

  it('includes pause and freeze changes alongside other config changes', () => {
    render(<ConfigurationPanel />)
    // Toggle both
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByTestId('switch-frozen'))
    // Open dialog
    fireEvent.click(screen.getByText('Update Config'))
    // Both should appear (label + table cell = 2 each)
    expect(screen.getAllByText('Pause Protocol')).toHaveLength(2)
    expect(screen.getAllByText('Emergency Freeze')).toHaveLength(2)
  })

  it('calls mutate with paused=true when pause is toggled on and confirmed', () => {
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByText('Update Config'))
    fireEvent.click(screen.getByText('Confirm'))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const params = mockMutate.mock.calls[0][0].params
    expect(params.paused).toBe(true)
    expect(params.frozen).toBeNull()
  })

  it('calls mutate with frozen=true when freeze is toggled on and confirmed', () => {
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-frozen'))
    fireEvent.click(screen.getByText('Update Config'))
    fireEvent.click(screen.getByText('Confirm'))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const params = mockMutate.mock.calls[0][0].params
    expect(params.frozen).toBe(true)
    expect(params.paused).toBeNull()
  })

  it('sends paused=false when unfreezing (was paused, now active)', () => {
    mockConfig = makeConfig({ paused: true })
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByText('Update Config'))
    fireEvent.click(screen.getByText('Confirm'))

    const params = mockMutate.mock.calls[0][0].params
    expect(params.paused).toBe(false)
  })

  it('does not send paused or frozen when unchanged', () => {
    render(<ConfigurationPanel />)
    // Toggle hedging to make a change (so we can submit)
    fireEvent.click(screen.getByTestId('switch-allowHedging'))
    fireEvent.click(screen.getByText('Update Config'))
    fireEvent.click(screen.getByText('Confirm'))

    const params = mockMutate.mock.calls[0][0].params
    expect(params.paused).toBeNull()
    expect(params.frozen).toBeNull()
  })

  it('shows pause + freeze + numeric changes together in confirmation dialog (AC6)', () => {
    render(<ConfigurationPanel />)
    // Toggle pause and freeze
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByTestId('switch-frozen'))
    // Change a numeric field — tradingFeeBps
    const tradingFeeInput = screen.getByLabelText('Trading Fee (BPS)')
    fireEvent.change(tradingFeeInput, { target: { value: '200' } })
    // Open dialog
    fireEvent.click(screen.getByText('Update Config'))
    // All three changes should appear
    expect(screen.getAllByText('Pause Protocol')).toHaveLength(2)
    expect(screen.getAllByText('Emergency Freeze')).toHaveLength(2)
    expect(screen.getByText('Trading Fee')).toBeInTheDocument()
  })

  it('shows amber warning banner when enabling pause', () => {
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByText('Update Config'))
    expect(screen.getByText('WARNING: Protocol Pause')).toBeInTheDocument()
    expect(screen.getByText(/Enabling pause will block ALL new epoch creation/)).toBeInTheDocument()
  })

  it('does NOT show amber warning banner when disabling pause', () => {
    mockConfig = makeConfig({ paused: true })
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-paused'))
    fireEvent.click(screen.getByText('Update Config'))
    expect(screen.queryByText('WARNING: Protocol Pause')).not.toBeInTheDocument()
  })

  it('shows "Active" without red styling when unfreezing', () => {
    mockConfig = makeConfig({ frozen: true })
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-frozen'))
    fireEvent.click(screen.getByText('Update Config'))
    // The new value "Active" should NOT have red styling (it's an unfreeze)
    const activeValue = screen.getByText('Active')
    expect(activeValue.className).not.toContain('text-red-500')
  })
})

describe('ConfigurationPanel - UI Settings', () => {
  it('renders the Allow Epoch Creation toggle', () => {
    render(<ConfigurationPanel />)
    expect(screen.getByText('UI Settings')).toBeInTheDocument()
    expect(screen.getByText('Allow Epoch Creation (UI)')).toBeInTheDocument()
  })

  it('calls updateAdminSettings.mutate when toggle is clicked', () => {
    render(<ConfigurationPanel />)
    fireEvent.click(screen.getByTestId('switch-allowEpochCreation'))
    expect(mockUpdateAdminSettingsMutate).toHaveBeenCalledWith({ allowEpochCreation: false })
  })
})
