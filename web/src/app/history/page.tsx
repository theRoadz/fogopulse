import { redirect } from 'next/navigation'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  if (params.tab === 'trades') {
    redirect('/trades')
  }
  redirect('/settlements')
}
