'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { QUERY_KEYS } from '@/lib/constants'

export interface AdminSettings {
  allowEpochCreation: boolean
  maintenanceMode: boolean
  maintenanceMessage?: string
}

const DEFAULTS: AdminSettings = { allowEpochCreation: true, maintenanceMode: false }

export function useAdminSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.adminSettings(),
    queryFn: async (): Promise<AdminSettings> => {
      const res = await fetch('/api/admin-settings')
      if (!res.ok) return DEFAULTS
      return res.json()
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useUpdateAdminSettings() {
  const { publicKey } = useWallet()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<AdminSettings>) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      const res = await fetch(
        `/api/admin-settings?wallet=${publicKey.toBase58()}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        },
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update admin settings')
      }

      return await res.json()
    },
    onSuccess: () => {
      toast.success('Admin setting updated')
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminSettings() })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
