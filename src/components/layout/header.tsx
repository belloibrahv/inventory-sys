"use client"

import { useState } from "react"
import type { UserRole } from "@prisma/client"
import { leaveTheShop } from "@/lib/leave-shop"
import { useTheme } from "@/components/theme-provider"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, Bell, BookOpen, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserRound } from "lucide-react"
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
import { BrandBusyOverlay } from "@/components/brand-busy-overlay"

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

  const router = useRouter()
  const pathname = usePathname()
  const isHome = pathname === "/" || pathname === "/dashboard"
  const [leaving, setLeaving] = useState(false)

  return (
    <header className="app-header sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur-xl sm:px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleNav}
          aria-label={navShown ? "Hide menu" : "Show menu"}
          title={navShown ? "Hide menu" : "Show menu"}
        >
          <Menu className="h-5 w-5" />
        </Button>
        {!isHome ? (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back()
              } else {
                router.push("/dashboard")
              }
            }}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border-2 border-primary/50 bg-primary/10 px-2.5 text-sm font-bold text-primary shadow-sm transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-95 sm:px-3"
            aria-label="Back to previous page"
            title="Go back to the page you were on"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
        ) : null}
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight" title={title}>
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {shops ? (
          <div className="hidden md:block">
            <ShopSwitch branches={shops.branches} active={shops.active} />
          </div>
        ) : null}
        {/* The network dot lands here; see NetworkStatusIndicator. */}
        <span id="network-slot" className="contents" />

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
          className="hidden sm:inline-flex"
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
                <span className="block text-[13px] font-semibold whitespace-normal break-words">{user?.name}</span>
                <span className="block text-[11px] text-muted-foreground whitespace-normal break-words">
                  {user?.role ? ROLE_LABELS[user.role] : ""}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block whitespace-normal break-words">{user?.name}</span>
              <span className="block text-xs font-normal text-muted-foreground whitespace-normal break-words">
                {user?.role ? ROLE_LABELS[user.role] : ""}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shops ? (
              <div className="px-2 py-1.5 md:hidden">
                <ShopSwitch branches={shops.branches} active={shops.active} />
              </div>
            ) : null}
            <DropdownMenuItem
              className="sm:hidden"
              onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Sun className="mr-2 h-4 w-4 dark:hidden" />
              <Moon className="mr-2 hidden h-4 w-4 dark:block" />
              {resolvedTheme === "dark" ? "Bright screen" : "Dark screen"}
            </DropdownMenuItem>
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
            <DropdownMenuItem
              disabled={leaving}
              onSelect={(event) => {
                event.preventDefault()
                if (leaving) return
                setLeaving(true)
                void leaveTheShop()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {leaving ? (
        <BrandBusyOverlay
          open
          title="Signing you out"
          detail="Closing this shop session and taking you to Sign in."
          phases={[
            "Saving nothing more on this screen",
            "Closing your shop session",
            "Opening Sign in",
          ]}
        />
      ) : null}
    </header>
  )
}
