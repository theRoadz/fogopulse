import type { Metadata } from 'next'
import { HistoryFeature } from '@/components/history/history-feature'

export const metadata: Metadata = {
  title: 'History | FOGO Pulse',
}

export default function Page() {
  return <HistoryFeature />
}
