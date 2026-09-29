"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { Toaster } from "sonner"
// Imported for its side effect: it must catch the install prompt the moment the browser offers it.
import "@/components/install-app"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())

  return (
    <SessionProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          {children}
          {/* Styled in globals.css: ink toasts, a green tick, red and amber for trouble. */}
          {/* Just under the top bar, so a toast never covers search or the bell. */}
          <Toaster position="top-right" offset={{ top: 68, right: 16 }} mobileOffset={{ top: 64 }} toastOptions={{ duration: 3500 }} />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
