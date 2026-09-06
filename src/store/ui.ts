import { create } from "zustand"

type UIState = {
  sidebarOpen: boolean
  commandOpen: boolean
  toggleSidebar: () => void
  setSidebar: (open: boolean) => void
  setCommandOpen: (open: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  commandOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebar: (open) => set({ sidebarOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),
}))
