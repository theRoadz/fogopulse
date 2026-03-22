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
export const MIN_TRADE_AMOUNT = 0.10

/**
 * Maximum trade amount in USDC (mirrors on-chain GlobalConfig.max_trade_amount default)
 */
export const MAX_TRADE_AMOUNT = 100
