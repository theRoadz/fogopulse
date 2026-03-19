import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'

import { GLOBAL_CONFIG_PDA } from '@/lib/constants'

/**
 * Build the emergency_freeze instruction.
 *
 * Returns a single TransactionInstruction (not a full Transaction).
 * Caller is responsible for building and signing the transaction.
 *
 * Accounts (from emergency_freeze.rs):
 *   1. admin (Signer, mut) — must match GlobalConfig.admin
 *   2. global_config (mut) — PDA with seed "global_config"
 */
export async function buildEmergencyFreezeInstruction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  admin: PublicKey
): Promise<TransactionInstruction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instruction: TransactionInstruction = await (program.methods as any)
    .emergencyFreeze()
    .accounts({
      admin,
      globalConfig: GLOBAL_CONFIG_PDA,
    })
    .instruction()

  return instruction
}
