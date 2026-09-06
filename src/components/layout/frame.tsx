"use client"

import type { ReactNode } from "react"
import type { UserRole } from "@prisma/client"
import { usePathname } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { titleFor } from "@/components/layout/titles"

export function AppFrame({
  unread,
  user,
  allowedHrefs,
  children,
}: {
  unread: number
  user: { name?: string | null; role: UserRole }
  allowedHrefs: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  return (
    <AppShell title={titleFor(pathname)} unread={unread} user={user} allowedHrefs={allowedHrefs}>
      {children}
    </AppShell>
  )
}
