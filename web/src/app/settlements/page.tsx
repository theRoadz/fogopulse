import type { Metadata } from 'next'

import { SettlementsFeature } from '@/components/history/settlements-feature'

export const metadata: Metadata = {
  title: 'Settlement History | FOGO Pulse',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <SettlementsFeature />
}
