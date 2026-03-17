import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HistoryFeature } from '@/components/history/history-feature'

export const metadata: Metadata = {
  title: 'History | FOGO Pulse',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <HistoryFeature />
}
