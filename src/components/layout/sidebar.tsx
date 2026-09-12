"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandLockup } from "@/components/brand-mark"
import { isOnItem, navGroups, type NavChild, type NavItem } from "@/components/layout/nav"
import { activeChildHref } from "@/components/layout/nav-active"
import { pathIsAllowed } from "@/lib/access-path"
import { useUI } from "@/store/ui"

/**
 * Thirty-odd destinations in six groups. The weight is carried by the group
 * headings and by the one active item, not by making every label bold, which is
 * what previously made the menu look like a wall.
 *
 * Screens that were split into sections carry their sections as a fold-out list
 * under the parent. The fold opens by itself when you are inside that area, so
 * nobody has to remember where Opening stock sheet went, and it can be opened by
 * hand from anywhere to jump straight to a section.
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
      items: group.items
        .filter((item) => allowedHrefs.includes(item.href))
        .map((item) => ({
          ...item,
          // A section is only offered when the role may actually open it. The
          // same check the router uses, so the menu can never show a door that
          // shuts in your face.
          children: item.children?.filter((child) => pathIsAllowed(child.href, allowedHrefs)),
        })),
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
                {group.items.map((item) =>
                  item.children && item.children.length > 1 ? (
                    <NavBranch
                      key={item.href}
                      item={item as NavItem & { children: NavChild[] }}
                      pathname={pathname}
                      onNavigate={() => setSidebar(false)}
                    />
                  ) : (
                    <NavLeaf
                      key={item.href}
                      href={item.href}
                      name={item.name}
                      icon={item.icon}
                      active={isOnItem(pathname, item.href)}
                      onNavigate={() => setSidebar(false)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}

function NavLeaf({
  href,
  name,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string
  name: string
  icon: NavItem["icon"]
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-sidebar-active font-semibold text-white"
          : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-muted hover:text-white"
      )}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" /> : null}
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-sidebar-foreground/55")} />
      <span className="truncate">{name}</span>
    </Link>
  )
}

/**
 * A parent with its sections folded underneath.
 *
 * The row is two controls in one: the label navigates to the parent screen, the
 * chevron opens the fold. Tapping the label on a phone should take you
 * somewhere, not just wiggle a list open.
 */
function NavBranch({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem & { children: NavChild[] }
  pathname: string
  onNavigate: () => void
}) {
  const inside = isOnItem(pathname, item.href) || item.children.some((child) => isOnItem(pathname, child.href))
  const [open, setOpen] = useState(inside)
  const activeHref = activeChildHref(pathname, item.children)
  const Icon = item.icon

  // Walking into the area from a link or the search box opens the fold too.
  useEffect(() => {
    if (inside) setOpen(true)
  }, [inside])

  return (
    <div>
      <div
        className={cn(
          "relative flex items-center rounded-lg transition-colors",
          inside ? "bg-sidebar-active" : "hover:bg-sidebar-muted"
        )}
      >
        {inside ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" /> : null}
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={inside ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg py-2 pl-2.5 text-[13px] transition-colors",
            inside ? "font-semibold text-white" : "font-medium text-sidebar-foreground/75 hover:text-white"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", inside ? "text-white" : "text-sidebar-foreground/55")} />
          <span className="truncate">{item.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? `Hide ${item.name} sections` : `Show ${item.name} sections`}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            inside ? "text-white/70 hover:text-white" : "text-sidebar-foreground/45 hover:text-white"
          )}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", open ? "rotate-90" : "")} />
        </button>
      </div>

      {open ? (
        <div className="relative mt-0.5 space-y-0.5 pb-1 pl-[18px]">
          <span className="absolute inset-y-0 left-[18px] w-px bg-sidebar-border" aria-hidden />
          {item.children.map((child) => {
            const active = child.href === activeHref
            const ChildIcon = child.icon
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={child.hint}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg py-1.5 pl-4 pr-2.5 text-[12.5px] transition-colors",
                  active
                    ? "font-semibold text-white"
                    : "font-medium text-sidebar-foreground/60 hover:bg-sidebar-muted hover:text-white"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 h-1.5 w-1.5 rounded-full transition-colors",
                    active ? "bg-brand" : "bg-sidebar-foreground/25"
                  )}
                  aria-hidden
                />
                {ChildIcon ? (
                  <ChildIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-brand" : "text-sidebar-foreground/40")} />
                ) : null}
                <span className="truncate">{child.name}</span>
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
