import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { Asset } from '@/types/assets'

interface UIState {
  activeAsset: Asset
  setActiveAsset: (asset: Asset) => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    activeAsset: 'BTC',
    setActiveAsset: (asset) =>
      set((state) => {
        state.activeAsset = asset
      }),
  }))
)
