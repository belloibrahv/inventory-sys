"use client"

import { signOut } from "next-auth/react"
import type { UserRole } from "@prisma/client"
import { useTheme } from "@/components/theme-provider"
import { Bell, BookOpen, Menu, Moon, Search, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUI } from "@/store/ui"
import { ROLE_LABELS } from "@/lib/roles"

export function Header({
  title,
  unread = 0,
  user,
}: {
  title: string
  unread?: number
  user: { name?: string | null; role: UserRole }
}) {
  const { setTheme, resolvedTheme } = useTheme()
  const setCommandOpen = useUI((state) => state.setCommandOpen)
  const toggleNav = useUI((state) => state.toggleNav)
  const desktopSidebar = useUI((state) => state.desktopSidebar)
  const sidebarOpen = useUI((state) => state.sidebarOpen)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl md:px-8">
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Abu Twins</p>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCommandOpen(true)}
          className="hidden h-10 items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm md:flex"
        >
          <Search className="h-4 w-4" />
          Find IMEI, invoice, or customer
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)} className="md:hidden">
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
        <a
          href="/help"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted sm:hidden"
          aria-label="How to use this"
          title="How to use this"
        >
          <BookOpen className="h-4 w-4" />
        </a>
        <a href="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
          ) : null}
        </a>
        <div className="ml-1 hidden items-center gap-3 rounded-full border border-border bg-card py-1 pl-1 pr-3 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {(user?.name ?? "AT").slice(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight">
            <p className="text-xs font-medium">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {user?.role ? ROLE_LABELS[user.role] : ""}
            </p>
          </div>
          <a href="/help" className="text-[11px] text-muted-foreground hover:text-foreground">
            How to use this
          </a>
          <a href="/account" className="text-[11px] text-muted-foreground hover:text-foreground">
            Account
          </a>
          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
