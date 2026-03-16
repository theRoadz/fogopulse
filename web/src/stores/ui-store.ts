import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { Asset } from '@/types/assets'

interface UIState {
  activeAsset: Asset
  setActiveAsset: (asset: Asset) => void
  pendingSellAsset: Asset | null
  setPendingSellAsset: (asset: Asset | null) => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    activeAsset: 'BTC',
    setActiveAsset: (asset) =>
      set((state) => {
        state.activeAsset = asset
      }),
    pendingSellAsset: null,
    setPendingSellAsset: (asset) =>
      set((state) => {
        state.pendingSellAsset = asset
      }),
  }))
)
