import { create } from 'zustand'

export type DrawerType = 'audit' | 'tools' | 'settings' | 'context' | null

interface UIState {
  sidebarOpen: boolean
  activeDrawer: DrawerType

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  openDrawer: (drawer: DrawerType) => void
  closeDrawer: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeDrawer: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openDrawer: (drawer) => set({ activeDrawer: drawer }),
  closeDrawer: () => set({ activeDrawer: null }),
}))
