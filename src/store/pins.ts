import { create } from "zustand"

const PINS_KEY = "abutwins.pinned-pages"
const MAX_PINS = 6

function readPins(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(PINS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, MAX_PINS) : []
  } catch {
    return []
  }
}

function savePins(list: string[]) {
  try {
    window.localStorage.setItem(PINS_KEY, JSON.stringify(list))
  } catch {
    // Private windows refuse storage; pins are only a convenience.
  }
}

/**
 * Pages a person pinned to the top of the menu, on this device. Up to six, in
 * the order they were pinned. Loaded after the first render so the server and
 * the browser draw the same menu first.
 */
type PinState = {
  pins: string[]
  loaded: boolean
  load: () => void
  toggle: (href: string) => void
}

export const usePins = create<PinState>((set, get) => ({
  pins: [],
  loaded: false,
  load: () => {
    if (get().loaded) return
    set({ pins: readPins(), loaded: true })
  },
  toggle: (href) => {
    const current = get().pins
    const next = current.includes(href) ? current.filter((item) => item !== href) : [...current, href].slice(-MAX_PINS)
    savePins(next)
    set({ pins: next })
  },
}))
