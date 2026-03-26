'use client'

import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { ExplorerLink } from '../cluster/cluster-ui'
import { AccountBalanceCards, AccountButtons, AccountTokens, AccountTransactions } from './account-ui'
import { ellipsify } from '@/lib/utils'

export default function AccountDetailFeature() {
  const params = useParams()
  const address = useMemo(() => {
    if (!params.address) {
      return
    }
    try {
      return new PublicKey(params.address)
    } catch (e) {
      console.log(`Invalid public key`, e)
    }
  }, [params])
  if (!address) {
    return <div>Error loading account</div>
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold">Wallet</h1>
        <div className="mt-2">
          <ExplorerLink path={`account/${address}`} label={ellipsify(address.toString())} />
        </div>
      </div>

      <AccountBalanceCards address={address} />

      <div className="flex justify-center">
        <AccountButtons address={address} />
      </div>

      <AccountTokens address={address} />
      <AccountTransactions address={address} />
    </div>
  )
}
