import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { BN, Program } from '@coral-xyz/anchor'

import type { Asset } from '@/types/assets'
import { POOL_PDAS, GLOBAL_CONFIG_PDA } from '@/lib/constants'
import { deriveLpSharePda } from '@/lib/pda'

interface BuildRequestWithdrawalParams {
  asset: Asset
  sharesAmount: string // Raw shares count (u64)
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

/**
 * Build the request_withdrawal instruction
 *
 * ## Instruction Arguments
 *
 * 1. `user` (Pubkey) - The actual user wallet pubkey
 * 2. `shares_amount` (u64) - Number of LP shares to withdraw
 *
 * ## Account order (must match request_withdrawal.rs):
 * 1. signer_or_session - User wallet OR session account (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA (mut)
 * 4. lp_share - LpShare PDA (mut)
 */
export async function buildRequestWithdrawalInstruction(
  params: BuildRequestWithdrawalParams
): Promise<TransactionInstruction> {
  const { asset, sharesAmount, userPubkey, program } = params

  const poolPda = POOL_PDAS[asset]
  const lpSharePda = deriveLpSharePda(userPubkey, poolPda)

  const shares = new BN(sharesAmount)
  if (shares.lten(0)) {
    throw new Error('Shares amount must be greater than zero')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .requestWithdrawal(userPubkey, shares)
    .accounts({
      signerOrSession: userPubkey,
      config: GLOBAL_CONFIG_PDA,
      pool: poolPda,
      lpShare: lpSharePda,
    })

  const instruction: TransactionInstruction = await methodBuilder.instruction()

  return instruction
}
