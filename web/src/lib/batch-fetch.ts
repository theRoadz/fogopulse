import { PublicKey } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

import { deriveEpochPda, derivePositionPda } from '@/lib/pda'
import { parseSettledEpochAccount } from '@/lib/epoch-utils'
import type { LastSettledEpochData } from '@/lib/epoch-utils'
import { parseDirection } from '@/hooks/use-user-position'
import type { UserPositionData } from '@/hooks/use-user-position'
/** Build composite key for position lookup: "epochPda:direction" */
export function positionKey(epochPda: string, direction: 'up' | 'down'): string {
  return `${epochPda}:${direction}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = Program<any>

const BATCH_CHUNK_SIZE = 100

/** Split an array into chunks of a given size */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * Batch-fetch all settled/refunded epochs in a range using fetchMultiple.
 * Turns N sequential RPC calls into ceil(N/100) batch calls.
 */
export async function batchFetchEpochs(
  program: AnchorProgram,
  poolPda: PublicKey,
  fromEpochId: bigint,
  toEpochId: bigint
): Promise<LastSettledEpochData[]> {
  if (toEpochId < fromEpochId) return []

  // Derive all epoch PDAs (pure computation, no RPC)
  const epochEntries: Array<{ epochId: bigint; epochPda: PublicKey }> = []
  for (let id = fromEpochId; id <= toEpochId; id++) {
    const epochPda = deriveEpochPda(poolPda, id)
    epochEntries.push({ epochId: id, epochPda })
  }

  // Chunk and batch-fetch
  const pdaChunks = chunks(epochEntries, BATCH_CHUNK_SIZE)
  const chunkResults = await Promise.all(
    pdaChunks.map((chunk) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (program.account as any).epoch.fetchMultiple(chunk.map((e) => e.epochPda))
    )
  )

  // Parse results — fetchMultiple returns (AccountData | null)[]
  const settled: LastSettledEpochData[] = []
  for (let ci = 0; ci < chunkResults.length; ci++) {
    const accounts = chunkResults[ci]
    const chunk = pdaChunks[ci]
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i] === null) continue
      const parsed = parseSettledEpochAccount(
        accounts[i],
        poolPda,
        chunk[i].epochId,
        chunk[i].epochPda
      )
      if (parsed) settled.push(parsed)
    }
  }

  return settled
}

/**
 * Batch-fetch user positions for a list of epoch PDAs using fetchMultiple.
 * Checks both UP and DOWN directions per epoch.
 *
 * Shared by useTradingHistory (via settledEpochs) and useUserPositionsBatch (direct PDAs).
 */
export async function batchFetchUserPositions(
  program: AnchorProgram,
  epochPdas: PublicKey[],
  userPubkey: PublicKey
): Promise<Map<string, UserPositionData>> {
  if (epochPdas.length === 0) return new Map()

  const directions: Array<'up' | 'down'> = ['up', 'down']

  // Derive all position PDAs
  const fetchEntries = epochPdas.flatMap((epochPda) =>
    directions.map((dir) => ({
      epochPda,
      direction: dir,
      positionPda: derivePositionPda(epochPda, userPubkey, dir),
    }))
  )

  // Chunk and batch-fetch
  const pdaChunks = chunks(fetchEntries, BATCH_CHUNK_SIZE)
  const chunkResults = await Promise.all(
    pdaChunks.map((chunk) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (program.account as any).userPosition.fetchMultiple(chunk.map((e) => e.positionPda))
    )
  )

  // Parse results
  const positions = new Map<string, UserPositionData>()
  for (let ci = 0; ci < chunkResults.length; ci++) {
    const accounts = chunkResults[ci]
    const chunk = pdaChunks[ci]
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i] === null) continue
      const acct = accounts[i]
      const entry = chunk[i]
      positions.set(positionKey(entry.epochPda.toBase58(), entry.direction), {
        user: acct.user as PublicKey,
        epoch: acct.epoch as PublicKey,
        direction: parseDirection(acct.direction),
        amount: BigInt(acct.amount.toString()),
        shares: BigInt(acct.shares.toString()),
        entryPrice: BigInt(acct.entryPrice.toString()),
        claimed: acct.claimed,
        bump: acct.bump,
      })
    }
  }

  return positions
}
