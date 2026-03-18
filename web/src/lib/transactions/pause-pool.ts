import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'

import { GLOBAL_CONFIG_PDA } from '@/lib/constants'

/**
 * Build the pause_pool instruction.
 *
 * Returns a single TransactionInstruction (not a full Transaction).
 * Caller is responsible for building and signing the transaction.
 *
 * Accounts (from pause_pool.rs):
 *   1. admin (Signer) — must match GlobalConfig.admin
 *   2. global_config — PDA with seed "global_config"
 *   3. pool (mut) — Pool PDA to pause
 */
export async function buildPausePoolInstruction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  admin: PublicKey,
  pool: PublicKey
): Promise<TransactionInstruction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instruction: TransactionInstruction = await (program.methods as any)
    .pausePool()
    .accounts({
      admin,
      globalConfig: GLOBAL_CONFIG_PDA,
      pool,
    })
    .instruction()

  return instruction
}
