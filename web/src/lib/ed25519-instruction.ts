/**
 * Ed25519 Signature Verification Instruction Builder
 *
 * Creates an Ed25519 precompile instruction that verifies Pyth Lazer signatures.
 * The Ed25519 instruction references data in another instruction (create_epoch)
 * where the Pyth message is stored.
 *
 * Pyth Solana Message Format:
 * - Bytes 0-3:     4-byte magic prefix
 * - Bytes 4-67:    64-byte Ed25519 signature
 * - Bytes 68-99:   32-byte Ed25519 public key
 * - Bytes 100-101: 2-byte message size (u16 LE)
 * - Bytes 102+:    Actual payload (price data)
 *
 * @see https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
 */

import { TransactionInstruction } from '@solana/web3.js'

import { ED25519_PROGRAM_ID } from '@/lib/constants'

// Pyth message layout offsets
const MAGIC_LEN = 4
const SIGNATURE_LEN = 64
const PUBKEY_LEN = 32
const MESSAGE_SIZE_LEN = 2

// Calculated offsets within Pyth message
export const PYTH_SIGNATURE_OFFSET = MAGIC_LEN // 4
export const PYTH_PUBKEY_OFFSET = MAGIC_LEN + SIGNATURE_LEN // 68
export const PYTH_MESSAGE_SIZE_OFFSET = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN // 100
export const PYTH_PAYLOAD_OFFSET = MAGIC_LEN + SIGNATURE_LEN + PUBKEY_LEN + MESSAGE_SIZE_LEN // 102

/**
 * Parse message size from Pyth message
 *
 * Reads the 2-byte little-endian message size at offset 100.
 */
export function parsePythMessageSize(pythMessage: Uint8Array): number {
  if (pythMessage.length < PYTH_MESSAGE_SIZE_OFFSET + MESSAGE_SIZE_LEN) {
    throw new Error('Pyth message too short to contain message size')
  }
  // Read u16 little-endian
  return pythMessage[PYTH_MESSAGE_SIZE_OFFSET] | (pythMessage[PYTH_MESSAGE_SIZE_OFFSET + 1] << 8)
}

/**
 * Create Ed25519 signature verification instruction
 *
 * Builds an Ed25519 precompile instruction that references data in another
 * instruction at the specified index. The Ed25519 program will verify that
 * the signature in the Pyth message is valid.
 *
 * CRITICAL: The Ed25519 instruction MUST be placed at index 0 in the transaction,
 * and it references the Pyth message data in the instruction at `instructionIndex`
 * (typically index 1, the create_epoch instruction).
 *
 * @param pythMessage - The signed Pyth Lazer message as Uint8Array
 * @param instructionIndex - Index of the instruction containing the Pyth message (usually 1)
 * @param messageOffset - Byte offset where Pyth message starts in the target instruction's data
 *                        For create_epoch: 12 (8 discriminator + 4 vec length)
 * @returns TransactionInstruction for Ed25519 verification
 */
export function createEd25519Instruction(
  pythMessage: Uint8Array,
  instructionIndex: number,
  messageOffset: number
): TransactionInstruction {
  // Read the message size from Pyth message
  const messageSize = parsePythMessageSize(pythMessage)

  // Build Ed25519 instruction data
  // Format per Solana Ed25519 program spec:
  // - 1 byte: number of signatures
  // - 1 byte: padding
  // - For each signature (14 bytes):
  //   - 2 bytes: signature offset (u16 LE)
  //   - 2 bytes: signature instruction index (u16 LE)
  //   - 2 bytes: public key offset (u16 LE)
  //   - 2 bytes: public key instruction index (u16 LE)
  //   - 2 bytes: message data offset (u16 LE)
  //   - 2 bytes: message data size (u16 LE)
  //   - 2 bytes: message instruction index (u16 LE)

  const data = new Uint8Array(16) // 2 header + 14 per signature
  let offset = 0

  // Number of signatures (1)
  data[offset++] = 1

  // Padding (0)
  data[offset++] = 0

  // Signature offset (u16 LE) - relative to start of instruction data
  const signatureOffset = messageOffset + PYTH_SIGNATURE_OFFSET
  data[offset++] = signatureOffset & 0xff
  data[offset++] = (signatureOffset >> 8) & 0xff

  // Signature instruction index (u16 LE)
  data[offset++] = instructionIndex & 0xff
  data[offset++] = (instructionIndex >> 8) & 0xff

  // Public key offset (u16 LE)
  const pubkeyOffset = messageOffset + PYTH_PUBKEY_OFFSET
  data[offset++] = pubkeyOffset & 0xff
  data[offset++] = (pubkeyOffset >> 8) & 0xff

  // Public key instruction index (u16 LE)
  data[offset++] = instructionIndex & 0xff
  data[offset++] = (instructionIndex >> 8) & 0xff

  // Message data offset (u16 LE) - points to payload after header
  const payloadOffset = messageOffset + PYTH_PAYLOAD_OFFSET
  data[offset++] = payloadOffset & 0xff
  data[offset++] = (payloadOffset >> 8) & 0xff

  // Message data size (u16 LE)
  data[offset++] = messageSize & 0xff
  data[offset++] = (messageSize >> 8) & 0xff

  // Message instruction index (u16 LE)
  data[offset++] = instructionIndex & 0xff
  data[offset++] = (instructionIndex >> 8) & 0xff

  return new TransactionInstruction({
    keys: [], // Ed25519 program takes no accounts
    programId: ED25519_PROGRAM_ID,
    data: Buffer.from(data), // Convert Uint8Array to Buffer for TransactionInstruction
  })
}

// Export offset constants for testing
export const OFFSETS = {
  MAGIC_LEN,
  SIGNATURE_LEN,
  PUBKEY_LEN,
  MESSAGE_SIZE_LEN,
  SIGNATURE_OFFSET: PYTH_SIGNATURE_OFFSET,
  PUBKEY_OFFSET: PYTH_PUBKEY_OFFSET,
  MESSAGE_SIZE_OFFSET: PYTH_MESSAGE_SIZE_OFFSET,
  PAYLOAD_OFFSET: PYTH_PAYLOAD_OFFSET,
} as const
