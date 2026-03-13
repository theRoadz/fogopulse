/**
 * Trade direction for UP/DOWN positions
 */
export type TradeDirection = 'up' | 'down' | null

/**
 * Trade ticket state interface
 */
export interface TradeTicketState {
  direction: TradeDirection
  amount: string // String for input handling
  isValid: boolean
  error: string | null
}

/**
 * Minimum trade amount in USDC
 */
export const MIN_TRADE_AMOUNT = 0.01
