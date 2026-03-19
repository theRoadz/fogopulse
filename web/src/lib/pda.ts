import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { PROGRAM_ID, SEEDS, USDC_MINT } from '@/lib/constants'

// Constants for BigInt operations (avoid creating in loop)
const BIGINT_0xFF = BigInt(0xff)
const BIGINT_8 = BigInt(8)

/**
 * Convert bigint epochId to little-endian Uint8Array (browser-compatible)
 *
 * CRITICAL: Node.js Buffer.writeBigUInt64LE() does NOT work in browsers.
 * This implementation manually converts to little-endian bytes.
 */
function epochIdToBytes(epochId: bigint): Uint8Array {
  const buffer = new Uint8Array(8)
  let n = epochId
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number(n & BIGINT_0xFF)
    n = n >> BIGINT_8
  }
  return buffer
}

/**
 * Derive Epoch PDA from pool PDA and epoch ID
 *
 * Seeds: ["epoch", pool, epoch_id.to_le_bytes()]
 */
export function deriveEpochPda(poolPda: PublicKey, epochId: bigint): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.EPOCH, poolPda.toBuffer(), epochIdToBytes(epochId)],
    PROGRAM_ID
  )
  return pda
}

/**
 * Derive UserPosition PDA from epoch PDA, user public key, and direction
 *
 * Seeds: ["position", epoch, user, direction_byte]
 * Direction byte: Up = 0, Down = 1 (matches Borsh enum order)
 */
export function derivePositionPda(
  epochPda: PublicKey,
  userPubkey: PublicKey,
  direction: 'up' | 'down'
): PublicKey {
  const directionByte = direction === 'up' ? 0 : 1
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.POSITION, epochPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([directionByte])],
    PROGRAM_ID
  )
  return pda
}

/**
 * Derive LpShare PDA from user public key and pool PDA
 *
 * Seeds: ["lp_share", user, pool]
 */
export function deriveLpSharePda(userPubkey: PublicKey, poolPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.LP_SHARE, userPubkey.toBuffer(), poolPda.toBuffer()],
    PROGRAM_ID
  )
  return pda
}

/**
 * Derive user's USDC Associated Token Account (ATA)
 *
 * Uses SPL Token's getAssociatedTokenAddressSync for standard ATA derivation.
 */
export function deriveUserUsdcAta(userPubkey: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    USDC_MINT,
    userPubkey,
    false // allowOwnerOffCurve - false for regular user wallets
  )
}
