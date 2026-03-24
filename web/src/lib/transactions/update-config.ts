import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { BN, Program } from '@coral-xyz/anchor'

import { GLOBAL_CONFIG_PDA } from '@/lib/constants'

export interface UpdateConfigParams {
  treasury: PublicKey | null
  insurance: PublicKey | null
  tradingFeeBps: number | null
  lpFeeShareBps: number | null
  treasuryFeeShareBps: number | null
  insuranceFeeShareBps: number | null
  perWalletCapBps: number | null
  perSideCapBps: number | null
  oracleConfidenceThresholdStartBps: number | null
  oracleConfidenceThresholdSettleBps: number | null
  oracleStalenessThresholdStart: number | null
  oracleStalenessThresholdSettle: number | null
  epochDurationSeconds: number | null
  freezeWindowSeconds: number | null
  allowHedging: boolean | null
  paused: boolean | null
  frozen: boolean | null
  maxTradeAmount: number | null
  settlementTimeoutSeconds: number | null
}

/**
 * Convert UpdateConfigParams to Anchor-compatible format.
 *
 * Anchor expects Option<i64> fields as BN | null, and Option<u16> as number | null.
 * The i64 fields (staleness thresholds, timing params) must be wrapped in BN.
 */
function toAnchorParams(params: UpdateConfigParams) {
  return {
    treasury: params.treasury,
    insurance: params.insurance,
    tradingFeeBps: params.tradingFeeBps,
    lpFeeShareBps: params.lpFeeShareBps,
    treasuryFeeShareBps: params.treasuryFeeShareBps,
    insuranceFeeShareBps: params.insuranceFeeShareBps,
    perWalletCapBps: params.perWalletCapBps,
    perSideCapBps: params.perSideCapBps,
    oracleConfidenceThresholdStartBps: params.oracleConfidenceThresholdStartBps,
    oracleConfidenceThresholdSettleBps: params.oracleConfidenceThresholdSettleBps,
    oracleStalenessThresholdStart:
      params.oracleStalenessThresholdStart !== null
        ? new BN(params.oracleStalenessThresholdStart)
        : null,
    oracleStalenessThresholdSettle:
      params.oracleStalenessThresholdSettle !== null
        ? new BN(params.oracleStalenessThresholdSettle)
        : null,
    epochDurationSeconds:
      params.epochDurationSeconds !== null
        ? new BN(params.epochDurationSeconds)
        : null,
    freezeWindowSeconds:
      params.freezeWindowSeconds !== null
        ? new BN(params.freezeWindowSeconds)
        : null,
    allowHedging: params.allowHedging,
    paused: params.paused,
    frozen: params.frozen,
    maxTradeAmount:
      params.maxTradeAmount !== null
        ? new BN(params.maxTradeAmount)
        : null,
    settlementTimeoutSeconds:
      params.settlementTimeoutSeconds !== null
        ? new BN(params.settlementTimeoutSeconds)
        : null,
  }
}

/**
 * Build the update_config instruction.
 *
 * Returns a single TransactionInstruction (not a full Transaction).
 * Matches the pattern from buy.ts — caller is responsible for
 * building and signing the transaction.
 *
 * Accounts (from update_config.rs):
 *   1. admin (Signer) — must match GlobalConfig.admin
 *   2. global_config (mut) — PDA with seed "global_config"
 */
export async function buildUpdateConfigInstruction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  admin: PublicKey,
  params: UpdateConfigParams
): Promise<TransactionInstruction> {
  const anchorParams = toAnchorParams(params)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instruction: TransactionInstruction = await (program.methods as any)
    .updateConfig(anchorParams)
    .accounts({
      admin,
      globalConfig: GLOBAL_CONFIG_PDA,
    })
    .instruction()

  return instruction
}
