"use client"

import { signOut } from "next-auth/react"
import type { UserRole } from "@prisma/client"
import { useTheme } from "@/components/theme-provider"
import { Bell, Menu, Moon, Search, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUI } from "@/store/ui"
import { ROLE_LABELS } from "@/lib/roles"
import { ShopSwitch } from "@/components/shop-switch"

const headerAction =
  "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted"

export function Header({
  title,
  unread = 0,
  user,
  shops = null,
}: {
  title: string
  unread?: number
  user: { name?: string | null; role: UserRole }
  shops?: { branches: Array<{ id: string; name: string; code: string }>; active: string } | null
}) {
  const { setTheme, resolvedTheme } = useTheme()
  const setCommandOpen = useUI((state) => state.setCommandOpen)
  const toggleNav = useUI((state) => state.toggleNav)
  const desktopSidebar = useUI((state) => state.desktopSidebar)
  const sidebarOpen = useUI((state) => state.sidebarOpen)

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-background/80 px-4 py-2 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleNav}
          aria-label={desktopSidebar || sidebarOpen ? "Hide menu" : "Show menu"}
          title={desktopSidebar || sidebarOpen ? "Hide menu" : "Show menu"}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Abu Twins</p>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {shops ? <ShopSwitch branches={shops.branches} active={shops.active} /> : null}
        <button
          onClick={() => setCommandOpen(true)}
          className="hidden h-11 items-center gap-3 rounded-xl border-2 border-primary/40 bg-card px-3 text-sm font-semibold text-foreground shadow-sm md:flex"
        >
          <Search className="h-4 w-4" />
          Find IMEI, invoice, supplier bill, or customer
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)} className="md:hidden">
          <Search className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>
        <a href="/notifications" className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-muted">
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
          ) : null}
        </a>
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border-2 border-border bg-card py-1 pl-1 pr-1">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {(user?.name ?? "AT").slice(0, 2).toUpperCase()}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-sm font-semibold text-foreground">
                {user?.role ? ROLE_LABELS[user.role] : ""}
              </p>
            </div>
          </div>
          <a href="/help" className={headerAction}>
            How to use this
          </a>
          <a href="/account" className={headerAction}>
            Account
          </a>
          <button type="button" className={headerAction} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
