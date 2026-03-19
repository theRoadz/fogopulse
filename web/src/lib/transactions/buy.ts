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
import { deriveEpochPda, derivePositionPda, deriveUserUsdcAta } from '@/lib/pda'
import idl from '@/lib/fogopulse.json'

interface BuildBuyPositionParams {
  asset: Asset
  direction: 'up' | 'down'
  amount: string // Human-readable USDC (e.g., "10.50")
  epochId: bigint
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

/**
 * Convert frontend direction string to Anchor enum format
 *
 * CRITICAL: Anchor expects enum objects like { up: {} } or { down: {} }
 * NOT string values like 'up' or 'down'
 */
function toAnchorDirection(direction: 'up' | 'down'): { up: Record<string, never> } | { down: Record<string, never> } {
  return direction === 'up' ? { up: {} } : { down: {} }
}

// Max safe USDC amount to avoid JS number precision issues
// Number.MAX_SAFE_INTEGER is 2^53 - 1 = 9,007,199,254,740,991
// Divided by 1,000,000 (USDC decimals) = ~9,007,199,254 USDC max
const MAX_USDC_AMOUNT = Number.MAX_SAFE_INTEGER / 1_000_000

/**
 * Convert human-readable USDC amount to lamports (6 decimals)
 *
 * USDC has 6 decimal places:
 * - 1 USDC = 1,000,000 lamports
 * - 0.01 USDC = 10,000 lamports
 *
 * @throws Error if amount is invalid, negative, or exceeds safe precision limits
 */
function usdcToLamports(amount: string): BN {
  const parsed = parseFloat(amount)
  if (isNaN(parsed) || parsed < 0) {
    throw new Error('Invalid amount')
  }
  // Guard against amounts that would lose precision when converted to lamports
  if (parsed > MAX_USDC_AMOUNT) {
    throw new Error('Amount exceeds maximum safe value')
  }
  // Use Math.floor to avoid floating point precision issues
  const lamports = Math.floor(parsed * 1_000_000)
  return new BN(lamports)
}

/**
 * Build the buy_position instruction
 *
 * ## Instruction Arguments
 *
 * The buy_position instruction takes 3 arguments:
 * 1. `user` (Pubkey) - The actual user wallet pubkey
 * 2. `direction` (enum) - Up or Down prediction
 * 3. `amount` (u64) - USDC amount in lamports (6 decimals)
 *
 * **IMPORTANT: Why `user` is passed as both account AND argument:**
 *
 * The `user` pubkey is required as an instruction argument (not just as the signer account)
 * to support FOGO Sessions - a gasless trading feature where a session account signs
 * transactions on behalf of users. The on-chain program validates that the `user` argument
 * matches `extract_user(signer_or_session)` to prevent spoofing.
 *
 * When using direct wallet signatures, `user` == `signerOrSession`.
 * When using FOGO Sessions, `user` is the wallet owner, `signerOrSession` is the session PDA.
 *
 * See: anchor/programs/fogopulse/src/instructions/buy_position.rs
 *
 * ## Account order (must match buy_position.rs):
 * 1. signer_or_session - User wallet OR session account (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA (mut)
 * 4. epoch - Epoch PDA (mut)
 * 5. position - UserPosition PDA (init_if_needed)
 * 6. user_usdc - User's USDC ATA (mut)
 * 7. pool_usdc - Pool's USDC ATA (mut)
 * 8. treasury_usdc - Treasury's USDC ATA (mut) - receives 20% of fees
 * 9. insurance_usdc - Insurance's USDC ATA (mut) - receives 10% of fees
 * 10. usdc_mint - USDC Mint
 * 11. token_program - TOKEN_PROGRAM_ID
 * 12. associated_token_program - ASSOCIATED_TOKEN_PROGRAM_ID
 * 13. system_program - SystemProgram.programId
 */
export async function buildBuyPositionInstruction(
  params: BuildBuyPositionParams
): Promise<TransactionInstruction> {
  const { asset, direction, amount, epochId, userPubkey, program } = params

  // Get pool PDA and pool USDC ATA from constants
  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]

  // Derive epoch PDA from pool + epochId
  const epochPda = deriveEpochPda(poolPda, epochId)

  // Derive position PDA from epoch + user + direction
  const positionPda = derivePositionPda(epochPda, userPubkey, direction)

  // Derive user's USDC ATA
  const userUsdcAta = deriveUserUsdcAta(userPubkey)

  // Convert amount to lamports
  const amountLamports = usdcToLamports(amount)

  // Convert direction to Anchor enum format
  const directionEnum = toAnchorDirection(direction)

  // Build instruction using Anchor's IDL
  // Instruction args: user (Pubkey), direction (enum), amount (u64)
  // NOTE: Type assertion used due to TypeScript limitation with deeply nested Anchor IDL types
  // The accounts structure matches buy_position.rs exactly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .buyPosition(userPubkey, directionEnum, amountLamports)
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

/**
 * Export IDL for external use
 */
export { idl }
