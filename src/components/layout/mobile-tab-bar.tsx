"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgeCheck,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Menu,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { useUI } from "@/store/ui"
import { cn } from "@/lib/utils"

/**
 * The four screens a person uses most, under the thumb on a phone, plus Menu
 * for everything else. Which four depends on the job: a seller gets Sell and
 * Sales, an engineer Repairs, the books desk Money and Reports.
 */
const CANDIDATES: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/pos", label: "Sell", icon: Store },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/inventory", label: "Stock", icon: Boxes },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck },
  { href: "/finance", label: "Money", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
]

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileTabBar({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname()
  const setSidebar = useUI((state) => state.setSidebar)
  const allowed = new Set(allowedHrefs)
  const tabs = CANDIDATES.filter((tab) => allowed.has(tab.href)).slice(0, 4)

  // Sell now keeps its own pay bar at the bottom of the screen.
  if (pathname === "/pos" || tabs.length < 2) return null

  return (
    <nav
      aria-label="Main screens"
      className="tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href)
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <tab.icon className="h-5 w-5" />
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => setSidebar(true)}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center">
              <Menu className="h-5 w-5" />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
