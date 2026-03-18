import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Program } from '@coral-xyz/anchor'

import type { Asset } from '@/types/assets'
import {
  POOL_PDAS,
  POOL_USDC_ATAS,
  GLOBAL_CONFIG_PDA,
  USDC_MINT,
} from '@/lib/constants'
import { deriveLpSharePda, deriveUserUsdcAta } from '@/lib/pda'

interface BuildProcessWithdrawalParams {
  asset: Asset
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

/**
 * Build the process_withdrawal instruction
 *
 * ## Instruction Arguments
 *
 * 1. `user` (Pubkey) - The actual user wallet pubkey
 *
 * Note: No amount argument — uses pending_withdrawal from LpShare account.
 * USDC amount is computed on-chain: (pending_shares * pool_value) / total_lp_shares
 *
 * ## Account order (must match process_withdrawal.rs):
 * 1. signer_or_session - User wallet OR session account (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA (mut)
 * 4. lp_share - LpShare PDA (mut)
 * 5. pool_usdc - Pool's USDC ATA (mut)
 * 6. user_usdc - User's USDC ATA (mut)
 * 7. usdc_mint - USDC Mint
 * 8. token_program - TOKEN_PROGRAM_ID
 * 9. associated_token_program - ASSOCIATED_TOKEN_PROGRAM_ID
 * 10. system_program - SystemProgram.programId
 */
export async function buildProcessWithdrawalInstruction(
  params: BuildProcessWithdrawalParams
): Promise<TransactionInstruction> {
  const { asset, userPubkey, program } = params

  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]
  const lpSharePda = deriveLpSharePda(userPubkey, poolPda)
  const userUsdcAta = deriveUserUsdcAta(userPubkey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .processWithdrawal(userPubkey)
    .accounts({
      signerOrSession: userPubkey,
      config: GLOBAL_CONFIG_PDA,
      pool: poolPda,
      lpShare: lpSharePda,
      poolUsdc: poolUsdcAta,
      userUsdc: userUsdcAta,
      usdcMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })

  const instruction: TransactionInstruction = await methodBuilder.instruction()

  return instruction
}
