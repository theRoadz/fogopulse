'use client'

import { useAdminSettings } from '@/hooks/use-admin-settings'

const DEFAULT_MESSAGE = 'Trading is temporarily paused for scheduled maintenance.'

export function MaintenanceBanner() {
  const { data: settings } = useAdminSettings()

  if (!settings?.maintenanceMode) return null

  const message = settings.maintenanceMessage || DEFAULT_MESSAGE

  return (
    <div
      className="bg-yellow-500/90 text-yellow-950 overflow-hidden whitespace-nowrap py-2 text-sm font-medium"
      role="alert"
      aria-live="polite"
    >
      <div className="animate-ticker inline-block w-max">
        <span>{message}</span>
        <span className="ml-24">{message}</span>
      </div>
    </div>
  )
}
