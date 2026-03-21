'use client'

import { useEffect, useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'

import { useProgram } from '@/hooks/use-program'
import { GLOBAL_CONFIG_PDA, QUERY_KEYS } from '@/lib/constants'

export interface GlobalConfigData {
  admin: PublicKey
  treasury: PublicKey
  insurance: PublicKey
  tradingFeeBps: number
  lpFeeShareBps: number
  treasuryFeeShareBps: number
  insuranceFeeShareBps: number
  perWalletCapBps: number
  perSideCapBps: number
  oracleConfidenceThresholdStartBps: number
  oracleConfidenceThresholdSettleBps: number
  oracleStalenessThresholdStart: BN
  oracleStalenessThresholdSettle: BN
  epochDurationSeconds: BN
  freezeWindowSeconds: BN
  allowHedging: boolean
  paused: boolean
  frozen: boolean
  maxTradeAmount: BN
  bump: number
}

interface UseGlobalConfigResult {
  config: GlobalConfigData | null
  isLoading: boolean
  error: Error | null
  isRealtimeConnected: boolean
  refetch: () => void
}

/**
 * Hook for fetching and subscribing to GlobalConfig account data.
 * Uses TanStack Query with polling + WebSocket for real-time updates.
 */
export function useGlobalConfig(): UseGlobalConfigResult {
  const { connection } = useConnection()
  const queryClient = useQueryClient()
  const program = useProgram()

  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  const fetchGlobalConfig = useCallback(async (): Promise<GlobalConfigData> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (program.account as any).globalConfig.fetch(GLOBAL_CONFIG_PDA)

    return {
      admin: account.admin as PublicKey,
      treasury: account.treasury as PublicKey,
      insurance: account.insurance as PublicKey,
      tradingFeeBps: account.tradingFeeBps,
      lpFeeShareBps: account.lpFeeShareBps,
      treasuryFeeShareBps: account.treasuryFeeShareBps,
      insuranceFeeShareBps: account.insuranceFeeShareBps,
      perWalletCapBps: account.perWalletCapBps,
      perSideCapBps: account.perSideCapBps,
      oracleConfidenceThresholdStartBps: account.oracleConfidenceThresholdStartBps,
      oracleConfidenceThresholdSettleBps: account.oracleConfidenceThresholdSettleBps,
      oracleStalenessThresholdStart: account.oracleStalenessThresholdStart as BN,
      oracleStalenessThresholdSettle: account.oracleStalenessThresholdSettle as BN,
      epochDurationSeconds: account.epochDurationSeconds as BN,
      freezeWindowSeconds: account.freezeWindowSeconds as BN,
      allowHedging: account.allowHedging,
      paused: account.paused,
      frozen: account.frozen,
      maxTradeAmount: account.maxTradeAmount as BN,
      bump: account.bump,
    }
  }, [program])

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.globalConfig(),
    queryFn: fetchGlobalConfig,
    refetchInterval: 5000,
    staleTime: 2000,
  })

  // WebSocket subscription for real-time updates
  useEffect(() => {
    let subscriptionId: number | undefined

    const subscribe = async () => {
      try {
        subscriptionId = connection.onAccountChange(
          GLOBAL_CONFIG_PDA,
          async () => {
            // Refetch via TanStack Query to update cache and handle errors consistently
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.globalConfig() })
          },
          'confirmed'
        )
        setIsRealtimeConnected(true)
      } catch (err) {
        console.warn('Error setting up GlobalConfig WebSocket subscription:', err)
        setIsRealtimeConnected(false)
      }
    }

    subscribe()

    return () => {
      setIsRealtimeConnected(false)
      if (subscriptionId !== undefined) {
        connection.removeAccountChangeListener(subscriptionId)
      }
    }
  }, [connection, queryClient, fetchGlobalConfig])

  return {
    config: config ?? null,
    isLoading,
    error: error as Error | null,
    isRealtimeConnected,
    refetch,
  }
}
