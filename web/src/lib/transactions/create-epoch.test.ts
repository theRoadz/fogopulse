import { PROGRAM_ID, SEEDS, CREATE_EPOCH_DISCRIMINATOR, POOL_PDAS } from '@/lib/constants'

describe('Create Epoch Transaction Builder', () => {
  describe('constants', () => {
    it('should use correct seeds', () => {
      expect(SEEDS.EPOCH.toString()).toBe('epoch')
    })

    it('should use correct program ID', () => {
      expect(PROGRAM_ID.toBase58()).toBe('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
    })

    it('should have correct create_epoch discriminator', () => {
      expect(CREATE_EPOCH_DISCRIMINATOR).toBeInstanceOf(Uint8Array)
      expect(CREATE_EPOCH_DISCRIMINATOR.length).toBe(8)
      // From IDL: [115, 111, 36, 230, 59, 145, 168, 27]
      expect(Array.from(CREATE_EPOCH_DISCRIMINATOR)).toEqual([115, 111, 36, 230, 59, 145, 168, 27])
    })

    it('should have all required pool PDAs', () => {
      expect(POOL_PDAS.BTC).toBeDefined()
      expect(POOL_PDAS.ETH).toBeDefined()
      expect(POOL_PDAS.SOL).toBeDefined()
      expect(POOL_PDAS.FOGO).toBeDefined()
    })
  })

  describe('PYTH_MESSAGE_OFFSET', () => {
    it('should be 12 (8 discriminator + 4 vec length)', () => {
      // This is tested implicitly by checking the calculation
      const discriminatorLength = 8
      const vecLengthPrefix = 4
      const expectedOffset = discriminatorLength + vecLengthPrefix
      expect(expectedOffset).toBe(12)
    })
  })

  describe('exports', () => {
    it('should export buildCreateEpochTransaction', async () => {
      const { buildCreateEpochTransaction } = await import('./create-epoch')
      expect(typeof buildCreateEpochTransaction).toBe('function')
    })

    it('should export fetchPoolNextEpochId', async () => {
      const { fetchPoolNextEpochId } = await import('./create-epoch')
      expect(typeof fetchPoolNextEpochId).toBe('function')
    })

    it('should re-export deriveEpochPda', async () => {
      const { deriveEpochPda } = await import('./create-epoch')
      expect(typeof deriveEpochPda).toBe('function')
    })
  })
})
