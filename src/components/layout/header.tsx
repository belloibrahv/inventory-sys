"use client"

import { signOut } from "next-auth/react"
import type { UserRole } from "@prisma/client"
import { useTheme } from "@/components/theme-provider"
import { Bell, BookOpen, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUI } from "@/store/ui"
import { ROLE_LABELS } from "@/lib/roles"
import { ShopSwitch } from "@/components/shop-switch"

/**
 * The top bar carries the page name on the left and the few controls that are
 * not page-specific on the right.
 *
 * Help, Account and Sign out used to sit in the bar as three bordered links next
 * to the avatar, which made every screen open on a crowded strip. They are one
 * click deeper now, inside the avatar menu, where people expect them.
 */
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
  const navShown = desktopSidebar || sidebarOpen
  const initials = (user?.name ?? "AT").slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-2 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleNav}
          aria-label={navShown ? "Hide menu" : "Show menu"}
          title={navShown ? "Hide menu" : "Show menu"}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {shops ? <ShopSwitch branches={shops.branches} active={shops.active} /> : null}

        <button
          onClick={() => setCommandOpen(true)}
          className="hidden h-9 items-center gap-2 rounded-lg border border-input bg-muted/50 pl-3 pr-2 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:flex"
        >
          <Search className="h-4 w-4" />
          <span>Find an IMEI, an invoice, a supplier, or a customer</span>
          <kbd className="ml-2 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)} className="lg:hidden" aria-label="Search">
          <Search className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Change between bright and dark screen"
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>

        <a
          href="/notifications"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-muted"
          aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-background" />
          ) : null}
        </a>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg pl-1 pr-2 text-left transition-colors hover:bg-muted"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block truncate text-[13px] font-semibold">{user?.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user?.role ? ROLE_LABELS[user.role] : ""}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate">{user?.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user?.role ? ROLE_LABELS[user.role] : ""}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/help">
                <BookOpen className="mr-2 h-4 w-4" /> How to use this
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/account">
                <UserRound className="mr-2 h-4 w-4" /> Your login
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
