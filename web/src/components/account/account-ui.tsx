'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { useCluster } from '../cluster/cluster-data-access'
import { ExplorerLink } from '../cluster/cluster-ui'
import {
  useGetBalance,
  useGetSignatures,
  useGetTokenAccounts,
  useTransferSol,
} from './account-data-access'
import { ellipsify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AppAlert } from '@/components/app-alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AppModal } from '@/components/app-modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTokenPrices } from '@/hooks/use-token-prices'
import { useTokenMetadata } from '@/hooks/use-token-metadata'
import { USDC_MINT } from '@/lib/constants'

export function AccountBalanceCards({ address }: { address: PublicKey }) {
  const fogoQuery = useGetBalance({ address })
  const tokenQuery = useGetTokenAccounts({ address })

  const fogoBalance =
    fogoQuery.data != null
      ? (Math.round((fogoQuery.data / LAMPORTS_PER_SOL) * 10000) / 10000).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })
      : null

  // Extract USDC balance from token accounts (works for any address, connected or not)
  const usdcMintStr = USDC_MINT.toBase58()
  const usdcAccount = tokenQuery.data?.find(
    ({ account }) => account.data.parsed.info.mint.toString() === usdcMintStr
  )
  const usdcBalance = usdcAccount?.account.data.parsed.info.tokenAmount.uiAmount ?? 0
  const usdcFormatted = usdcBalance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
      {/* FOGO Balance Card */}
      <Card className="cursor-pointer" onClick={() => fogoQuery.refetch()}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">FOGO Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {fogoQuery.isLoading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <div className="text-3xl font-bold font-mono text-primary">
              {fogoBalance ?? '0'} <span className="text-lg">FOGO</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* USDC Balance Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">USDC Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {tokenQuery.isLoading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <div className="text-2xl font-bold font-mono">
              ${usdcFormatted} <span className="text-lg text-muted-foreground">USDC</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function AccountChecker() {
  const { publicKey } = useWallet()
  if (!publicKey) {
    return null
  }
  return <AccountBalanceCheck address={publicKey} />
}

export function AccountBalanceCheck({ address }: { address: PublicKey }) {
  const { cluster } = useCluster()
  const query = useGetBalance({ address })

  if (query.isLoading) {
    return null
  }
  if (query.isError || !query.data) {
    return (
      <AppAlert action={null}>
        You are connected to <strong>{cluster.name}</strong> but your account is not found on this cluster.
      </AppAlert>
    )
  }
  return null
}

export function AccountButtons({ address }: { address: PublicKey }) {
  return (
    <div>
      <div className="space-x-2">
        <ModalSend address={address} />
        <ModalReceive address={address} />
      </div>
    </div>
  )
}

export function AccountTokens({ address }: { address: PublicKey }) {
  const [showAll, setShowAll] = useState(false)
  const query = useGetTokenAccounts({ address })
  const client = useQueryClient()
  const prices = useTokenPrices()

  // Extract all mint addresses for metadata lookup
  const mints = useMemo(
    () => query.data?.map(({ account }) => account.data.parsed.info.mint.toString()) ?? [],
    [query.data]
  )
  const metadata = useTokenMetadata(mints)

  const items = useMemo(() => {
    if (!query.data) return []

    // Filter out NFTs (decimals === 0)
    const fungible = query.data.filter(
      ({ account }) => account.data.parsed.info.tokenAmount.decimals > 0
    )

    // Sort: USD value desc → named tokens by balance desc → unnamed by balance desc
    const sorted = [...fungible].sort((a, b) => {
      const mintA = a.account.data.parsed.info.mint.toString()
      const mintB = b.account.data.parsed.info.mint.toString()
      const amountA = a.account.data.parsed.info.tokenAmount.uiAmount ?? 0
      const amountB = b.account.data.parsed.info.tokenAmount.uiAmount ?? 0
      const usdA = prices[mintA] != null ? amountA * prices[mintA] : null
      const usdB = prices[mintB] != null ? amountB * prices[mintB] : null

      if (usdA != null && usdB != null) return usdB - usdA
      if (usdA != null) return -1
      if (usdB != null) return 1
      const hasNameA = !!metadata[mintA]
      const hasNameB = !!metadata[mintB]
      if (hasNameA !== hasNameB) return hasNameA ? -1 : 1
      return amountB - amountA
    })

    return showAll ? sorted : sorted.slice(0, 5)
  }, [query.data, showAll, prices, metadata])

  const totalFungible = useMemo(() => {
    if (!query.data) return 0
    return query.data.filter(
      ({ account }) => account.data.parsed.info.tokenAmount.decimals > 0
    ).length
  }, [query.data])

  return (
    <div className="space-y-2">
      <div className="justify-between">
        <div className="flex justify-between">
          <h2 className="text-2xl font-bold">Token Accounts</h2>
          <div className="space-x-2">
            {query.isLoading ? (
              <span className="loading loading-spinner"></span>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  await query.refetch()
                  await client.invalidateQueries({
                    queryKey: ['getTokenAccountBalance'],
                  })
                }}
              >
                <RefreshCw size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
      {query.isError && <pre className="alert alert-error">Error: {query.error?.message.toString()}</pre>}
      {query.isSuccess && (
        <div>
          {totalFungible === 0 ? (
            <div>No token accounts found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Value (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map(({ account, pubkey }) => {
                  const mint = account.data.parsed.info.mint.toString()
                  const meta = metadata[mint]
                  const uiAmount = account.data.parsed.info.tokenAmount.uiAmount ?? 0
                  const price = prices[mint]
                  const usdValue = price != null ? uiAmount * price : null

                  return (
                    <TableRow key={pubkey.toString()}>
                      <TableCell>
                        <div className="flex flex-col">
                          {meta ? (
                            <ExplorerLink
                              label={meta.symbol || meta.name}
                              path={`account/${mint}`}
                            />
                          ) : (
                            <span className="font-mono text-muted-foreground">
                              <ExplorerLink
                                label={ellipsify(mint)}
                                path={`account/${mint}`}
                              />
                            </span>
                          )}
                          {meta?.name && meta.symbol && meta.name !== meta.symbol && (
                            <span className="text-xs text-muted-foreground">{meta.name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">
                          {uiAmount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {usdValue != null ? (
                          <span className="font-mono">
                            ${usdValue.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}

                {totalFungible > 5 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">
                      <Button variant="outline" onClick={() => setShowAll(!showAll)}>
                        {showAll ? 'Show Less' : 'Show All'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}

export function AccountTransactions({ address }: { address: PublicKey }) {
  const query = useGetSignatures({ address })
  const [showAll, setShowAll] = useState(false)

  const items = useMemo(() => {
    if (showAll) return query.data
    return query.data?.slice(0, 5)
  }, [query.data, showAll])

  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <h2 className="text-2xl font-bold">Transaction History</h2>
        <div className="space-x-2">
          {query.isLoading ? (
            <span className="loading loading-spinner"></span>
          ) : (
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw size={16} />
            </Button>
          )}
        </div>
      </div>
      {query.isError && <pre className="alert alert-error">Error: {query.error?.message.toString()}</pre>}
      {query.isSuccess && (
        <div>
          {query.data.length === 0 ? (
            <div>No transactions found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signature</TableHead>
                  <TableHead className="text-right">Slot</TableHead>
                  <TableHead>Block Time</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map((item) => (
                  <TableRow key={item.signature}>
                    <TableHead className="font-mono">
                      <ExplorerLink path={`tx/${item.signature}`} label={ellipsify(item.signature, 8)} />
                    </TableHead>
                    <TableCell className="font-mono text-right">
                      <ExplorerLink path={`block/${item.slot}`} label={item.slot.toString()} />
                    </TableCell>
                    <TableCell>{new Date((item.blockTime ?? 0) * 1000).toISOString()}</TableCell>
                    <TableCell className="text-right">
                      {item.err ? (
                        <span className="text-red-500" title={item.err.toString()}>
                          Failed
                        </span>
                      ) : (
                        <span className="text-green-500">Success</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(query.data?.length ?? 0) > 5 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      <Button variant="outline" onClick={() => setShowAll(!showAll)}>
                        {showAll ? 'Show Less' : 'Show All'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}

function ModalReceive({ address }: { address: PublicKey }) {
  return (
    <AppModal title="Receive">
      <p>Receive assets by sending them to your public key:</p>
      <code>{address.toString()}</code>
    </AppModal>
  )
}

function ModalSend({ address }: { address: PublicKey }) {
  const wallet = useWallet()
  const mutation = useTransferSol({ address })
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('1')

  if (!address || !wallet.sendTransaction) {
    return <div>Wallet not connected</div>
  }

  return (
    <AppModal
      title="Send"
      submitDisabled={!destination || !amount || mutation.isPending}
      submitLabel="Send"
      submit={() => {
        mutation.mutateAsync({
          destination: new PublicKey(destination),
          amount: parseFloat(amount),
        })
      }}
    >
      <Label htmlFor="destination">Destination</Label>
      <Input
        disabled={mutation.isPending}
        id="destination"
        onChange={(e) => setDestination(e.target.value)}
        placeholder="Destination"
        type="text"
        value={destination}
      />
      <Label htmlFor="amount">Amount</Label>
      <Input
        disabled={mutation.isPending}
        id="amount"
        min="1"
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        step="any"
        type="number"
        value={amount}
      />
    </AppModal>
  )
}
