"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { Toaster } from "sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={client}>
          {children}
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
