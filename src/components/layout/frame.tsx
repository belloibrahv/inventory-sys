"use client"

import type { ReactNode } from "react"
import type { UserRole } from "@prisma/client"
import { usePathname } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { titleFor } from "@/components/layout/titles"

export function AppFrame({
  unread,
  badges,
  shops,
  user,
  allowedHrefs,
  children,
}: {
  unread: number
  badges: Record<string, number>
  shops: { branches: Array<{ id: string; name: string; code: string }>; active: string } | null
  user: { name?: string | null; role: UserRole; mustChangePassword?: boolean }
  allowedHrefs: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  return (
    <AppShell title={titleFor(pathname)} unread={unread} badges={badges} user={user} shops={shops} allowedHrefs={allowedHrefs}>
      {children}
    </AppShell>
  )
}
