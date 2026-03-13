import {
  createEd25519Instruction,
  parsePythMessageSize,
  OFFSETS,
  PYTH_SIGNATURE_OFFSET,
  PYTH_PUBKEY_OFFSET,
  PYTH_PAYLOAD_OFFSET,
} from './ed25519-instruction'
import { ED25519_PROGRAM_ID } from './constants'

describe('Ed25519 Instruction Builder', () => {
  // Sample Pyth message structure (not real, but correctly formatted)
  // Magic (4) + Signature (64) + Pubkey (32) + Size (2) + Payload
  const createMockPythMessage = (payloadSize: number): Uint8Array => {
    const headerSize = 4 + 64 + 32 + 2 // 102 bytes
    const message = new Uint8Array(headerSize + payloadSize)

    // Magic prefix (4 bytes)
    message[0] = 0x50 // 'P'
    message[1] = 0x59 // 'Y'
    message[2] = 0x54 // 'T'
    message[3] = 0x48 // 'H'

    // Signature (64 bytes) - dummy data
    for (let i = 4; i < 68; i++) {
      message[i] = i % 256
    }

    // Pubkey (32 bytes) - dummy data
    for (let i = 68; i < 100; i++) {
      message[i] = i % 256
    }

    // Message size (u16 LE)
    message[100] = payloadSize & 0xff
    message[101] = (payloadSize >> 8) & 0xff

    // Payload - dummy data
    for (let i = 102; i < 102 + payloadSize; i++) {
      message[i] = i % 256
    }

    return message
  }

  describe('OFFSETS', () => {
    it('should have correct magic length', () => {
      expect(OFFSETS.MAGIC_LEN).toBe(4)
    })

    it('should have correct signature length', () => {
      expect(OFFSETS.SIGNATURE_LEN).toBe(64)
    })

    it('should have correct pubkey length', () => {
      expect(OFFSETS.PUBKEY_LEN).toBe(32)
    })

    it('should have correct message size length', () => {
      expect(OFFSETS.MESSAGE_SIZE_LEN).toBe(2)
    })

    it('should have correct signature offset (after magic)', () => {
      expect(PYTH_SIGNATURE_OFFSET).toBe(4)
    })

    it('should have correct pubkey offset (after magic + signature)', () => {
      expect(PYTH_PUBKEY_OFFSET).toBe(68) // 4 + 64
    })

    it('should have correct payload offset (after header)', () => {
      expect(PYTH_PAYLOAD_OFFSET).toBe(102) // 4 + 64 + 32 + 2
    })
  })

  describe('parsePythMessageSize', () => {
    it('should parse message size correctly', () => {
      const message = createMockPythMessage(150)
      expect(parsePythMessageSize(message)).toBe(150)
    })

    it('should handle small message sizes', () => {
      const message = createMockPythMessage(10)
      expect(parsePythMessageSize(message)).toBe(10)
    })

    it('should handle larger message sizes (multi-byte)', () => {
      const message = createMockPythMessage(1000)
      expect(parsePythMessageSize(message)).toBe(1000)
    })

    it('should throw on truncated message', () => {
      const truncatedMessage = new Uint8Array(50) // Too short
      expect(() => parsePythMessageSize(truncatedMessage)).toThrow(
        'Pyth message too short to contain message size'
      )
    })
  })

  describe('createEd25519Instruction', () => {
    const pythMessage = createMockPythMessage(100)
    const instructionIndex = 1 // create_epoch is at index 1
    const messageOffset = 12 // 8 (discriminator) + 4 (vec length)

    it('should create instruction with correct program ID', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      expect(ix.programId.equals(ED25519_PROGRAM_ID)).toBe(true)
    })

    it('should create instruction with empty keys array', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      expect(ix.keys).toHaveLength(0)
    })

    it('should create instruction data with correct length', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      // 2 (header) + 14 (per signature) = 16 bytes
      expect(ix.data.length).toBe(16)
    })

    it('should set number of signatures to 1', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      expect(ix.data[0]).toBe(1)
    })

    it('should have zero padding byte', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      expect(ix.data[1]).toBe(0)
    })

    it('should calculate correct signature offset', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      // Signature offset = messageOffset + MAGIC_LEN = 12 + 4 = 16
      const signatureOffset = ix.data[2] | (ix.data[3] << 8)
      expect(signatureOffset).toBe(messageOffset + PYTH_SIGNATURE_OFFSET)
    })

    it('should set correct instruction index for signature', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      const sigIxIndex = ix.data[4] | (ix.data[5] << 8)
      expect(sigIxIndex).toBe(instructionIndex)
    })

    it('should calculate correct pubkey offset', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      // Pubkey offset = messageOffset + 68 = 12 + 68 = 80
      const pubkeyOffset = ix.data[6] | (ix.data[7] << 8)
      expect(pubkeyOffset).toBe(messageOffset + PYTH_PUBKEY_OFFSET)
    })

    it('should set correct instruction index for pubkey', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      const pkIxIndex = ix.data[8] | (ix.data[9] << 8)
      expect(pkIxIndex).toBe(instructionIndex)
    })

    it('should calculate correct message data offset (payload offset)', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      // Message offset = messageOffset + 102 = 12 + 102 = 114
      const msgOffset = ix.data[10] | (ix.data[11] << 8)
      expect(msgOffset).toBe(messageOffset + PYTH_PAYLOAD_OFFSET)
    })

    it('should set correct message size from Pyth message', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      const msgSize = ix.data[12] | (ix.data[13] << 8)
      expect(msgSize).toBe(100) // The payload size we created
    })

    it('should set correct instruction index for message', () => {
      const ix = createEd25519Instruction(pythMessage, instructionIndex, messageOffset)
      const msgIxIndex = ix.data[14] | (ix.data[15] << 8)
      expect(msgIxIndex).toBe(instructionIndex)
    })

    it('should work with different message offsets', () => {
      const offset20 = 20
      const ix = createEd25519Instruction(pythMessage, 1, offset20)

      const signatureOffset = ix.data[2] | (ix.data[3] << 8)
      expect(signatureOffset).toBe(offset20 + PYTH_SIGNATURE_OFFSET) // 24

      const pubkeyOffset = ix.data[6] | (ix.data[7] << 8)
      expect(pubkeyOffset).toBe(offset20 + PYTH_PUBKEY_OFFSET) // 88

      const payloadOffset = ix.data[10] | (ix.data[11] << 8)
      expect(payloadOffset).toBe(offset20 + PYTH_PAYLOAD_OFFSET) // 122
    })

    it('should work with different instruction indices', () => {
      const ix = createEd25519Instruction(pythMessage, 5, messageOffset)

      const sigIxIndex = ix.data[4] | (ix.data[5] << 8)
      expect(sigIxIndex).toBe(5)

      const pkIxIndex = ix.data[8] | (ix.data[9] << 8)
      expect(pkIxIndex).toBe(5)

      const msgIxIndex = ix.data[14] | (ix.data[15] << 8)
      expect(msgIxIndex).toBe(5)
    })
  })

  describe('integration with constants', () => {
    it('should use the correct Ed25519 program ID', () => {
      expect(ED25519_PROGRAM_ID.toBase58()).toBe('Ed25519SigVerify111111111111111111111111111')
    })
  })
})
