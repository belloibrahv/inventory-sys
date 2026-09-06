"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandLockup } from "@/components/brand-mark"
import { navGroups } from "@/components/layout/nav"
import { useUI } from "@/store/ui"

export function Sidebar({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname()
  const open = useUI((state) => state.sidebarOpen)
  const setSidebar = useUI((state) => state.setSidebar)
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedHrefs.includes(item.href)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setSidebar(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[272px] flex-col bg-sidebar text-sidebar-foreground",
          open ? "flex" : "hidden",
          "lg:flex"
        )}
      >
        <div className="flex h-[4.5rem] items-center px-4">
          <BrandLockup light compact />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-8 pt-2">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebar(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-active text-white shadow-[inset_3px_0_0_hsl(var(--brand))]"
                          : "text-white/70 hover:bg-sidebar-muted hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.name}</span>
                      <ChevronRight className={cn("h-3.5 w-3.5 opacity-0", active && "opacity-50")} />
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
