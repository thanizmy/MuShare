import { create } from 'zustand'

interface UiState {
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  queueOpen: boolean
  toggleQueue: () => void
  closeQueue: () => void
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  queueOpen: false,
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  closeQueue: () => set({ queueOpen: false }),
}))
