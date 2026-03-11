'use client'

import { getFogopulseProgram, getFogopulseProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'

export function useFogopulseProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getFogopulseProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getFogopulseProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['fogopulse', 'all', { cluster }],
    queryFn: () => program.account.counter.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const initialize = useMutation({
    mutationKey: ['fogopulse', 'initialize', { cluster }],
    mutationFn: (keypair: Keypair) =>
      program.methods.initialize().accounts({ counter: keypair.publicKey }).signers([keypair]).rpc(),
    onSuccess: async (signature) => {
      transactionToast(signature)
      await accounts.refetch()
    },
    onError: () => {
      toast.error('Failed to initialize account')
    },
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    initialize,
  }
}

export function useFogopulseProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program, accounts } = useFogopulseProgram()

  const accountQuery = useQuery({
    queryKey: ['fogopulse', 'fetch', { cluster, account }],
    queryFn: () => program.account.counter.fetch(account),
  })

  const closeMutation = useMutation({
    mutationKey: ['fogopulse', 'close', { cluster, account }],
    mutationFn: () => program.methods.close().accounts({ counter: account }).rpc(),
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accounts.refetch()
    },
  })

  const decrementMutation = useMutation({
    mutationKey: ['fogopulse', 'decrement', { cluster, account }],
    mutationFn: () => program.methods.decrement().accounts({ counter: account }).rpc(),
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accountQuery.refetch()
    },
  })

  const incrementMutation = useMutation({
    mutationKey: ['fogopulse', 'increment', { cluster, account }],
    mutationFn: () => program.methods.increment().accounts({ counter: account }).rpc(),
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accountQuery.refetch()
    },
  })

  const setMutation = useMutation({
    mutationKey: ['fogopulse', 'set', { cluster, account }],
    mutationFn: (value: number) => program.methods.set(value).accounts({ counter: account }).rpc(),
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accountQuery.refetch()
    },
  })

  return {
    accountQuery,
    closeMutation,
    decrementMutation,
    incrementMutation,
    setMutation,
  }
}
