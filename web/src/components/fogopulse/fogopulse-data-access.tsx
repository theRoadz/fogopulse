'use client'

import { getFogopulseProgram, getFogopulseProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'

/**
 * FogoPulse program data access hook
 *
 * Note: The original scaffolding used a "counter" account from create-solana-dapp template.
 * FogoPulse has different accounts: GlobalConfig, Pool, Epoch, UserPosition.
 * This file will be expanded as the trading UI is built.
 */
export function useFogopulseProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getFogopulseProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getFogopulseProgram(provider, programId), [provider, programId])

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  return {
    program,
    programId,
    getProgramAccount,
  }
}

export function useFogopulseProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const { program } = useFogopulseProgram()

  // Placeholder - will be expanded for Pool/Epoch/Position queries
  const accountQuery = useQuery({
    queryKey: ['fogopulse', 'account', { cluster, account }],
    queryFn: async () => {
      // Return null for now - account-specific queries will be added
      // as trading UI components are built
      return null
    },
    enabled: false, // Disabled until specific account queries are implemented
  })

  return {
    accountQuery,
  }
}
