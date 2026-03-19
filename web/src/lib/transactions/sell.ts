import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN, Program } from '@coral-xyz/anchor'

import type { Asset } from '@/types/assets'
import {
  POOL_PDAS,
  POOL_USDC_ATAS,
  GLOBAL_CONFIG_PDA,
  USDC_MINT,
  TREASURY_USDC_ATA,
  INSURANCE_USDC_ATA,
} from '@/lib/constants'
import { derivePositionPda, deriveUserUsdcAta } from '@/lib/pda'

interface BuildSellPositionParams {
  asset: Asset
  epochPda: PublicKey
  direction: 'up' | 'down'
  shares: bigint
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

/**
 * Convert frontend direction string to Anchor enum format
 */
function toAnchorDirection(direction: 'up' | 'down'): { up: Record<string, never> } | { down: Record<string, never> } {
  return direction === 'up' ? { up: {} } : { down: {} }
}

/**
 * Build the sell_position instruction
 *
 * ## Instruction Arguments
 *
 * The sell_position instruction takes 3 arguments:
 * 1. `user` (Pubkey) - The actual user wallet pubkey
 * 2. `direction` (enum) - Position direction (Up or Down)
 * 3. `shares` (u64) - Number of shares to sell
 *
 * ## Account order (must match sell_position.rs):
 * 1. signer_or_session - User wallet OR session account (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA (mut)
 * 4. epoch - Epoch PDA (mut)
 * 5. position - UserPosition PDA (mut)
 * 6. user_usdc - User's USDC ATA (mut) - receives net_payout
 * 7. pool_usdc - Pool's USDC ATA (mut) - source of transfers
 * 8. treasury_usdc - Treasury's USDC ATA (mut) - receives treasury_fee
 * 9. insurance_usdc - Insurance's USDC ATA (mut) - receives insurance_fee
 * 10. usdc_mint - USDC Mint
 * 11. token_program - TOKEN_PROGRAM_ID
 * 12. associated_token_program - ASSOCIATED_TOKEN_PROGRAM_ID
 * 13. system_program - SystemProgram.programId
 */
export async function buildSellPositionInstruction(
  params: BuildSellPositionParams
): Promise<TransactionInstruction> {
  const { asset, epochPda, direction, shares, userPubkey, program } = params

  // Get pool PDA and pool USDC ATA from hardcoded constants (DO NOT derive at runtime)
  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]

  // Derive position PDA from epoch + user + direction (runtime derivation required)
  const positionPda = derivePositionPda(epochPda, userPubkey, direction)

  // Derive user's USDC ATA (runtime derivation required)
  const userUsdcAta = deriveUserUsdcAta(userPubkey)

  // Build instruction using Anchor's IDL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .sellPosition(userPubkey, toAnchorDirection(direction), new BN(shares.toString()))
    .accounts({
      signerOrSession: userPubkey,
      config: GLOBAL_CONFIG_PDA,
      pool: poolPda,
      epoch: epochPda,
      position: positionPda,
      userUsdc: userUsdcAta,
      poolUsdc: poolUsdcAta,
      treasuryUsdc: TREASURY_USDC_ATA,
      insuranceUsdc: INSURANCE_USDC_ATA,
      usdcMint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })

  const instruction: TransactionInstruction = await methodBuilder.instruction()

  return instruction
}
