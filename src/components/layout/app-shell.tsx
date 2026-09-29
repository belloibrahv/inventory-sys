"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { CommandPalette } from "@/components/layout/command-palette"
import { AccessGate } from "@/components/layout/access-gate"
import { SectionTabs } from "@/components/layout/section-tabs"
import { MobileTabBar } from "@/components/layout/mobile-tab-bar"
import { pathIsAllowed } from "@/lib/access-path"
import { OfflineBanner } from "@/components/offline-banner"
import { OfflineGuard } from "@/components/offline-guard"
import { WarmOfflineCache } from "@/components/warm-offline-cache"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { PriceApprovalDock } from "@/components/notifications/price-approval-dock"
import { ShopCalculator } from "@/components/shop-calculator"
import { DecisionProvider } from "@/hooks/use-decision"
import { readSavedDesktopSidebar, useUI } from "@/store/ui"
import { cn } from "@/lib/utils"

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
  shops = null,
  user,
  allowedHrefs,
  children,
}: {
  title: string
  unread?: number
  shops?: { branches: Array<{ id: string; name: string; code: string }>; active: string } | null
  user: { name?: string | null; role: import("@prisma/client").UserRole; mustChangePassword?: boolean }
  allowedHrefs: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const allowed = pathIsAllowed(pathname, allowedHrefs)
  const desktopSidebar = useUI((state) => state.desktopSidebar)
  const setDesktopSidebar = useUI((state) => state.setDesktopSidebar)

  useEffect(() => {
    setDesktopSidebar(readSavedDesktopSidebar())
  }, [setDesktopSidebar])

  return (
    <DecisionProvider>
      <div className="min-h-screen bg-background">
        <AccessGate allowedHrefs={allowedHrefs} fallback={allowedHrefs[0] || "/login"} />
        <PasswordGate mustChange={Boolean(user.mustChangePassword)} />
        <Sidebar allowedHrefs={allowedHrefs} />
        <div className={cn("transition-[padding] duration-200", desktopSidebar ? "lg:pl-[264px]" : "lg:pl-0")}>
          <Header title={title} unread={unread} user={user} shops={shops} />
          <div className="mx-auto w-full max-w-[1600px] px-4 md:px-6">
            <div className="pt-4 empty:hidden">
              <OfflineBanner />
            </div>
            {allowed ? <SectionTabs allowedHrefs={allowedHrefs} /> : null}
            {/* Room under the last card for the phone tab bar. */}
            {/* A new screen rises in (keyed on the page, so filters that only
                change the address's query do not replay it). */}
            <main key={pathname} className="motion-page space-y-5 pb-24 pt-5 md:pt-6 lg:pb-6">
              {allowed ? children : null}
            </main>
          </div>
        </div>
        <MobileTabBar allowedHrefs={allowedHrefs} />
        <CommandPalette allowedHrefs={allowedHrefs} />
        <ShopCalculator />
        <OfflineGuard />
        <WarmOfflineCache />
        <NotificationCenter initialUnread={unread ?? 0} />
        <PriceApprovalDock />
      </div>
    </DecisionProvider>
  )
}
