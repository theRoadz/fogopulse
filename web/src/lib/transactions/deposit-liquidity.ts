import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN, Program } from '@coral-xyz/anchor'

import type { Asset } from '@/types/assets'
import {
  POOL_PDAS,
  POOL_USDC_ATAS,
  GLOBAL_CONFIG_PDA,
  USDC_MINT,
} from '@/lib/constants'
import { deriveLpSharePda, deriveUserUsdcAta } from '@/lib/pda'

interface BuildDepositLiquidityParams {
  asset: Asset
  amount: string // Human-readable USDC (e.g., "10.50")
  userPubkey: PublicKey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>
}

// Max safe USDC amount to avoid JS number precision issues
const MAX_USDC_AMOUNT = Number.MAX_SAFE_INTEGER / 1_000_000

/**
 * Convert human-readable USDC amount to lamports (6 decimals)
 *
 * @throws Error if amount is invalid, negative, or exceeds safe precision limits
 */
function usdcToLamports(amount: string): BN {
  const parsed = parseFloat(amount)
  if (isNaN(parsed) || parsed < 0) {
    throw new Error('Invalid amount')
  }
  if (parsed > MAX_USDC_AMOUNT) {
    throw new Error('Amount exceeds maximum safe value')
  }
  const lamports = Math.floor(parsed * 1_000_000)
  return new BN(lamports)
}

/**
 * Build the deposit_liquidity instruction
 *
 * ## Instruction Arguments
 *
 * 1. `user` (Pubkey) - The actual user wallet pubkey
 * 2. `amount` (u64) - USDC amount in lamports (6 decimals)
 *
 * ## Account order (must match deposit_liquidity.rs):
 * 1. signer_or_session - User wallet OR session account (signer, mut)
 * 2. config - GlobalConfig PDA
 * 3. pool - Pool PDA (mut)
 * 4. lp_share - LpShare PDA (init_if_needed, mut)
 * 5. pool_usdc - Pool's USDC ATA (mut)
 * 6. user_usdc - User's USDC ATA (mut)
 * 7. usdc_mint - USDC Mint
 * 8. token_program - TOKEN_PROGRAM_ID
 * 9. associated_token_program - ASSOCIATED_TOKEN_PROGRAM_ID
 * 10. system_program - SystemProgram.programId
 */
export async function buildDepositLiquidityInstruction(
  params: BuildDepositLiquidityParams
): Promise<TransactionInstruction> {
  const { asset, amount, userPubkey, program } = params

  const poolPda = POOL_PDAS[asset]
  const poolUsdcAta = POOL_USDC_ATAS[asset]
  const lpSharePda = deriveLpSharePda(userPubkey, poolPda)
  const userUsdcAta = deriveUserUsdcAta(userPubkey)
  const amountLamports = usdcToLamports(amount)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodBuilder = (program.methods as any)
    .depositLiquidity(userPubkey, amountLamports)
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
