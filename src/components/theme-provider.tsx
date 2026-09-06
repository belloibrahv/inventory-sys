"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"

const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: Theme
  setTheme: (theme: Theme) => void
}>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light")

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") === "dark" ? "dark" : "light"
    setThemeState(stored)
    document.documentElement.classList.toggle("dark", stored === "dark")
  }, [])

  function setTheme(next: Theme) {
    setThemeState(next)
    window.localStorage.setItem("theme", next)
    document.documentElement.classList.toggle("dark", next === "dark")
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
