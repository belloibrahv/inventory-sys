"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { Toaster } from "sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())

  return (
    <SessionProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          {children}
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
