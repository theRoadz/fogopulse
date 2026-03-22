import type { Metadata } from 'next'

import { TradesFeature } from '@/components/history/trades-feature'

export const metadata: Metadata = {
  title: 'Trade History | FOGO Pulse',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <TradesFeature />
}
