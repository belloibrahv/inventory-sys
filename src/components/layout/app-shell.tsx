"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { CommandPalette } from "@/components/layout/command-palette"
import { AccessGate } from "@/components/layout/access-gate"
import { pathIsAllowed } from "@/lib/access-path"

function PasswordGate({ mustChange }: { mustChange: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (mustChange && pathname !== "/account") router.replace("/account")
  }, [mustChange, pathname, router])
  return null
}

export function AppShell({
  title,
  unread,
  user,
  allowedHrefs,
  children,
}: {
  title: string
  unread?: number
  user: { name?: string | null; role: import("@prisma/client").UserRole; mustChangePassword?: boolean }
  allowedHrefs: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const allowed = pathIsAllowed(pathname, allowedHrefs)

  return (
    <div className="min-h-screen bg-background">
      <AccessGate allowedHrefs={allowedHrefs} fallback={allowedHrefs[0] || "/login"} />
      <PasswordGate mustChange={Boolean(user.mustChangePassword)} />
      <Sidebar allowedHrefs={allowedHrefs} />
      <div className="lg:pl-[272px]">
        <Header title={title} unread={unread} user={user} />
        <main className="px-4 py-6 md:px-8 md:py-8">{allowed ? children : null}</main>
      </div>
      <CommandPalette allowedHrefs={allowedHrefs} />
    </div>
  )
}
