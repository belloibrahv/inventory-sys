"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandLockup } from "@/components/brand-mark"
import { navGroups } from "@/components/layout/nav"
import { useUI } from "@/store/ui"

/**
 * Thirty-odd destinations in six groups. The weight is carried by the group
 * headings and by the one active item, not by making every label bold, which is
 * what previously made the menu look like a wall.
 */
export function Sidebar({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname()
  const open = useUI((state) => state.sidebarOpen)
  const setSidebar = useUI((state) => state.setSidebar)
  const desktopSidebar = useUI((state) => state.desktopSidebar)
  const setDesktopSidebar = useUI((state) => state.setDesktopSidebar)
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
          "fixed inset-y-0 left-0 z-50 w-[264px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          open ? "flex" : "hidden",
          desktopSidebar ? "lg:flex" : "lg:hidden"
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <BrandLockup light compact />
          <button
            type="button"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-muted hover:text-white lg:inline-flex"
            onClick={() => setDesktopSidebar(false)}
            aria-label="Hide menu"
            title="Hide menu"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-10 pt-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebar(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                        active
                          ? "bg-sidebar-active font-semibold text-white"
                          : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-muted hover:text-white"
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />
                      ) : null}
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-sidebar-foreground/55")} />
                      <span className="truncate">{item.name}</span>
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
