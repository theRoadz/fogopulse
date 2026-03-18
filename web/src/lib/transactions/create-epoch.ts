/**
 * Create Epoch Transaction Builder
 *
 * Builds a versioned transaction to create a new epoch. The transaction includes:
 * 1. Ed25519 signature verification instruction (must be first)
 * 2. create_epoch instruction with Pyth message data
 *
 * This is a permissionless instruction - any connected wallet can create epochs.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'

import type { Asset } from '@/types/assets'
import {
  PROGRAM_ID,
  POOL_PDAS,
  GLOBAL_CONFIG_PDA,
  PYTH_LAZER_PROGRAM,
  PYTH_LAZER_STORAGE,
  PYTH_LAZER_TREASURY,
  SYSVAR_CLOCK,
  SYSVAR_INSTRUCTIONS,
  CREATE_EPOCH_DISCRIMINATOR,
} from '@/lib/constants'
import { createEd25519Instruction } from '@/lib/ed25519-instruction'
import { deriveEpochPda } from '@/lib/pda'

// Re-export deriveEpochPda for convenience
export { deriveEpochPda }

// pythMessageOffset = 8 (discriminator) + 4 (vec length) = 12
const PYTH_MESSAGE_OFFSET = 12

/**
 * Fetch the next epoch ID from a pool account
 *
 * Pool layout:
 * - discriminator: 8 bytes
 * - asset_mint: 32 bytes
 * - yes_reserves: 8 bytes (u64)
 * - no_reserves: 8 bytes (u64)
 * - total_lp_shares: 8 bytes (u64)
 * - pending_withdrawal_shares: 8 bytes (u64)
 * - next_epoch_id: 8 bytes (u64) <-- offset 72
 */
export async function fetchPoolNextEpochId(
  connection: Connection,
  poolPda: PublicKey
): Promise<bigint> {
  const accountInfo = await connection.getAccountInfo(poolPda)
  if (!accountInfo) {
    throw new Error('Pool account not found')
  }

  // Read next_epoch_id at offset 72 (8 + 32 + 8 + 8 + 8 + 8)
  const offset = 72
  const dataView = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset)

  // Read u64 little-endian
  const low = dataView.getUint32(offset, true)
  const high = dataView.getUint32(offset + 4, true)
  return BigInt(low) + (BigInt(high) << BigInt(32))
}

/**
 * Build create_epoch instruction data
 *
 * Layout:
 * - discriminator: 8 bytes
 * - vec_length: 4 bytes (u32 LE)
 * - pyth_message: N bytes
 * - ed25519_instruction_index: 1 byte (u8)
 * - signature_index: 1 byte (u8)
 */
function buildCreateEpochData(pythMessage: Uint8Array): Uint8Array {
  const dataLength = 8 + 4 + pythMessage.length + 1 + 1
  const data = new Uint8Array(dataLength)
  let offset = 0

  // Discriminator (8 bytes)
  data.set(CREATE_EPOCH_DISCRIMINATOR, offset)
  offset += 8

  // Vec length (u32 LE)
  const vecLen = pythMessage.length
  data[offset++] = vecLen & 0xff
  data[offset++] = (vecLen >> 8) & 0xff
  data[offset++] = (vecLen >> 16) & 0xff
  data[offset++] = (vecLen >> 24) & 0xff

  // Pyth message bytes
  data.set(pythMessage, offset)
  offset += pythMessage.length

  // ed25519_instruction_index (0 = first instruction)
  data[offset++] = 0

  // signature_index (0 = first signature)
  data[offset++] = 0

  return data
}

/**
 * Build create_epoch instruction
 *
 * CreateEpoch accounts (10 accounts in order):
 * 1. payer - Transaction fee payer (signer, mutable)
 * 2. global_config - GlobalConfig PDA
 * 3. pool - Pool PDA (mutable)
 * 4. epoch - New Epoch PDA (mutable, will be initialized)
 * 5. clock - Sysvar Clock
 * 6. instructions_sysvar - Instructions Sysvar (for Ed25519 verification)
 * 7. pyth_program - Pyth Lazer Program ID
 * 8. pyth_storage - Pyth Lazer Storage account
 * 9. pyth_treasury - Pyth Lazer Treasury (mutable)
 * 10. system_program - System Program
 */
function buildCreateEpochInstruction(
  payer: PublicKey,
  poolPda: PublicKey,
  epochPda: PublicKey,
  pythMessage: Uint8Array
): TransactionInstruction {
  const data = buildCreateEpochData(pythMessage)

  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: GLOBAL_CONFIG_PDA, isSigner: false, isWritable: false },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: epochPda, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
      { pubkey: PYTH_LAZER_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: PYTH_LAZER_STORAGE, isSigner: false, isWritable: false },
      { pubkey: PYTH_LAZER_TREASURY, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(data), // Convert Uint8Array to Buffer for TransactionInstruction
  })
}

export interface BuildCreateEpochTransactionParams {
  /** Asset to create epoch for */
  asset: Asset
  /** Signed Pyth Lazer message */
  pythMessage: Uint8Array
  /** Transaction payer/signer */
  payer: PublicKey
  /** Solana connection */
  connection: Connection
}

export interface CreateEpochTransactionResult {
  /** The built versioned transaction */
  transaction: VersionedTransaction
  /** The new epoch's PDA */
  epochPda: PublicKey
  /** The epoch ID */
  epochId: bigint
}

/**
 * Build a versioned transaction to create a new epoch
 *
 * This function:
 * 1. Fetches the next epoch ID from the pool
 * 2. Derives the new epoch PDA
 * 3. Builds the Ed25519 verification instruction
 * 4. Builds the create_epoch instruction
 * 5. Assembles both into a versioned transaction
 *
 * The transaction is NOT signed - caller must sign before sending.
 *
 * @param params - Transaction parameters
 * @returns Transaction and epoch metadata
 */
export async function buildCreateEpochTransaction(
  params: BuildCreateEpochTransactionParams
): Promise<CreateEpochTransactionResult> {
  const { asset, pythMessage, payer, connection } = params

  // Get pool PDA for this asset
  const poolPda = POOL_PDAS[asset]

  // Fetch next epoch ID from pool
  const epochId = await fetchPoolNextEpochId(connection, poolPda)

  // Derive epoch PDA
  const epochPda = deriveEpochPda(poolPda, epochId)

  // Build Ed25519 instruction (references create_epoch at index 1)
  const ed25519Ix = createEd25519Instruction(pythMessage, 1, PYTH_MESSAGE_OFFSET)

  // Build create_epoch instruction
  const createEpochIx = buildCreateEpochInstruction(payer, poolPda, epochPda, pythMessage)

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash()

  // Build versioned transaction
  // CRITICAL: Ed25519 instruction MUST be first (index 0)
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [ed25519Ix, createEpochIx],
  }).compileToV0Message()

  const transaction = new VersionedTransaction(messageV0)

  return {
    transaction,
    epochPda,
    epochId,
  }
}
