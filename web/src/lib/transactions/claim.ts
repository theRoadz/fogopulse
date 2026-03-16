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
import { derivePositionPda, deriveUserUsdcAta } from '@/lib/pda'

interface BuildClaimInstructionParams {
  asset: Asset
  epochPda: PublicKey
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

/**
 * Build the claim_payout instruction for claiming winnings from a settled epoch.
 *
 * Account order (must match claim_payout.rs):
 * 1. signer_or_session - User wallet (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA
 * 4. epoch - Epoch PDA (settled)
 * 5. position - UserPosition PDA (mut)
 * 6. pool_usdc - Pool's USDC ATA (mut)
 * 7. user_usdc - User's USDC ATA (mut)
 * 8. usdc_mint - USDC Mint
 * 9. token_program - TOKEN_PROGRAM_ID
 * 10. associated_token_program - ASSOCIATED_TOKEN_PROGRAM_ID
 * 11. system_program - SystemProgram
 *
 * Instruction arg: user (Pubkey) - for FOGO Sessions support
 */
export async function buildClaimPayoutInstruction(
  params: BuildClaimInstructionParams
): Promise<TransactionInstruction> {
  const { asset, epochPda, userPubkey, program } = params

  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]
  const positionPda = derivePositionPda(epochPda, userPubkey)
  const userUsdcAta = deriveUserUsdcAta(userPubkey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .claimPayout(userPubkey)
    .accounts({
      signerOrSession: userPubkey,
      config: GLOBAL_CONFIG_PDA,
      pool: poolPda,
      epoch: epochPda,
      position: positionPda,
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

/**
 * Build the claim_refund instruction for claiming refund from a refunded epoch.
 *
 * Uses identical account structure to claim_payout.
 */
export async function buildClaimRefundInstruction(
  params: BuildClaimInstructionParams
): Promise<TransactionInstruction> {
  const { asset, epochPda, userPubkey, program } = params

  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]
  const positionPda = derivePositionPda(epochPda, userPubkey)
  const userUsdcAta = deriveUserUsdcAta(userPubkey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .claimRefund(userPubkey)
    .accounts({
      signerOrSession: userPubkey,
      config: GLOBAL_CONFIG_PDA,
      pool: poolPda,
      epoch: epochPda,
      position: positionPda,
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
