import { PublicKey } from '@solana/web3.js'

import { positionKey } from './batch-fetch'

// We can't easily test batchFetchEpochs/batchFetchUserPositions without
// a full Anchor program mock, but we can test the exported pure functions.

// Access the unexported chunks function via module internals isn't possible,
// so we test it indirectly through the exported functions' behavior.

describe('positionKey', () => {
  it('builds composite key from epochPda and direction', () => {
    const epochPda = PublicKey.default.toBase58()
    expect(positionKey(epochPda, 'up')).toBe(`${epochPda}:up`)
    expect(positionKey(epochPda, 'down')).toBe(`${epochPda}:down`)
  })

  it('produces unique keys for different directions', () => {
    const epochPda = PublicKey.default.toBase58()
    expect(positionKey(epochPda, 'up')).not.toBe(positionKey(epochPda, 'down'))
  })

  it('produces unique keys for different epoch PDAs', () => {
    const pda1 = PublicKey.default.toBase58()
    const pda2 = new PublicKey('So11111111111111111111111111111111111111112').toBase58()
    expect(positionKey(pda1, 'up')).not.toBe(positionKey(pda2, 'up'))
  })
})
