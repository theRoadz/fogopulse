// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import FogopulseIDL from '../target/idl/fogopulse.json'
import type { Fogopulse } from '../target/types/fogopulse'

// Re-export the generated IDL and type
export { Fogopulse, FogopulseIDL }

// The programId is imported from the program IDL.
export const FOGOPULSE_PROGRAM_ID = new PublicKey(FogopulseIDL.address)

// This is a helper function to get the Fogopulse Anchor program.
export function getFogopulseProgram(provider: AnchorProvider, address?: PublicKey): Program<Fogopulse> {
  return new Program({ ...FogopulseIDL, address: address ? address.toBase58() : FogopulseIDL.address } as Fogopulse, provider)
}

// This is a helper function to get the program ID for the Fogopulse program depending on the cluster.
// Note: FOGO testnet is accessed via 'devnet' cluster setting due to Anchor limitations
export function getFogopulseProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Fogopulse program on FOGO testnet
      return new PublicKey('Ht3NLQDkJG4BLgsnUnyuWD2393wULyP5nEXx8AyXhiGr')
    case 'mainnet-beta':
    default:
      return FOGOPULSE_PROGRAM_ID
  }
}
