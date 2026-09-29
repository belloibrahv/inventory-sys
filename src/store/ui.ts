import { create } from "zustand"

const DESKTOP_NAV_KEY = "abutwins.desktop-nav"

type UIState = {
  sidebarOpen: boolean
  desktopSidebar: boolean
  commandOpen: boolean
  calculatorOpen: boolean
  toggleCalculator: () => void
  setCalculatorOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebar: (open: boolean) => void
  setDesktopSidebar: (open: boolean) => void
  toggleDesktopSidebar: () => void
  toggleNav: () => void
  setCommandOpen: (open: boolean) => void
}

function persistDesktop(open: boolean) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(DESKTOP_NAV_KEY, open ? "open" : "closed")
}

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
}

export const useUI = create<UIState>((set, get) => ({
  sidebarOpen: false,
  desktopSidebar: true,
  commandOpen: false,
  calculatorOpen: false,
  toggleCalculator: () => set((state) => ({ calculatorOpen: !state.calculatorOpen })),
  setCalculatorOpen: (open) => set({ calculatorOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebar: (open) => set({ sidebarOpen: open }),
  setDesktopSidebar: (open) => {
    persistDesktop(open)
    set({ desktopSidebar: open })
  },
  toggleDesktopSidebar: () => get().setDesktopSidebar(!get().desktopSidebar),
  toggleNav: () => {
    if (isDesktop()) get().toggleDesktopSidebar()
    else get().toggleSidebar()
  },
  setCommandOpen: (open) => set({ commandOpen: open }),
}))

export function readSavedDesktopSidebar() {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(DESKTOP_NAV_KEY) !== "closed"
}
