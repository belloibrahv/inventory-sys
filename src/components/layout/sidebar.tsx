"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, PanelLeftClose, Pin, PinOff, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandLockup } from "@/components/brand-mark"
import { isOnItem, navGroups, type NavChild, type NavItem } from "@/components/layout/nav"
import { activeChildHref } from "@/components/layout/nav-active"
import { pathIsAllowed } from "@/lib/access-path"
import { useUI } from "@/store/ui"
import { usePins } from "@/store/pins"

/**
 * Thirty-odd destinations in six areas (Today, Sell, Stock, Money, Oversight,
 * Setup), trimmed to what the job may open, with search on top. The weight is carried by the group
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
  const setCommandOpen = useUI((state) => state.setCommandOpen)
  const pins = usePins((state) => state.pins)
  const loadPins = usePins((state) => state.load)
  const togglePin = usePins((state) => state.toggle)
  useEffect(() => loadPins(), [loadPins])

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          // A section is only offered when the role may actually open it. The
          // same check the router uses, so the menu can never show a door that
          // shuts in your face.
          const children = item.children?.filter((child) => pathIsAllowed(child.href, allowedHrefs))
          const parentAllowed = pathIsAllowed(item.href, allowedHrefs)
          // Who can see what lives under Staff; a role may open it without the
          // staff list, so the item stays and leads to the first open section.
          if (!parentAllowed && !children?.length) return null
          return { ...item, href: parentAllowed ? item.href : children![0].href, children }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    }))
    .filter((group) => group.items.length > 0)

  // Pinned pages: any page or section the job may open, drawn with its
  // parent's icon, in the order they were pinned.
  const pinned = pins
    .map((href) => {
      for (const group of navGroups) {
        for (const item of group.items) {
          const child = item.children?.find((row) => row.href === href)
          if (item.href === href || child) {
            return { href, name: child && child.href !== item.href ? child.name : item.name, icon: item.icon }
          }
        }
      }
      return null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && pathIsAllowed(row.href, allowedHrefs))

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
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-muted hover:text-white lg:hidden"
            onClick={() => setSidebar(false)}
            aria-label="Close menu"
            title="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => {
              setSidebar(false)
              setCommandOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-muted/60 px-2.5 py-2 text-left text-[13px] text-sidebar-foreground/70 transition-colors duration-press ease-standard hover:border-sidebar-foreground/25 hover:text-white"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
            <kbd className="hidden rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/60 lg:inline">
              Ctrl K
            </kbd>
          </button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-10 pt-4">
          {pinned.length ? (
            <div className="motion-rise">
              <p className="mb-1.5 flex items-center gap-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
                <Pin className="h-3 w-3" /> Pinned
              </p>
              <div className="space-y-0.5">
                {pinned.map((row) => (
                  <NavLeaf
                    key={`pin-${row.href}`}
                    href={row.href}
                    name={row.name}
                    icon={row.icon}
                    active={pathname === row.href}
                    onNavigate={() => setSidebar(false)}
                    pinned
                    onPin={() => togglePin(row.href)}
                  />
                ))}
              </div>
            </div>
          ) : null}
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
                      pinned={pins.includes(item.href)}
                      onPin={() => togglePin(item.href)}
                    />
                  ) : (
                    <NavLeaf
                      key={item.href}
                      href={item.href}
                      name={item.name}
                      icon={item.icon}
                      active={isOnItem(pathname, item.href)}
                      onNavigate={() => setSidebar(false)}
                      pinned={pins.includes(item.href)}
                      onPin={() => togglePin(item.href)}
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

/**
 * Pin or unpin a page. Shown on hover or keyboard focus on a computer; on a
 * touch screen, where there is no hover, it stays faintly visible.
 */
function PinButton({ name, pinned, onPin }: { name: string; pinned: boolean; onPin: () => void }) {
  return (
    <button
      type="button"
      onClick={onPin}
      aria-label={pinned ? `Unpin ${name}` : `Pin ${name} to the top`}
      title={pinned ? "Unpin" : "Pin to the top"}
      className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/45 opacity-0 transition-[opacity,color] duration-press ease-standard hover:text-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-50"
    >
      {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
    </button>
  )
}

function NavLeaf({
  href,
  name,
  icon: Icon,
  active,
  onNavigate,
  pinned = false,
  onPin,
}: {
  href: string
  name: string
  icon: NavItem["icon"]
  active: boolean
  onNavigate: () => void
  pinned?: boolean
  onPin?: () => void
}) {
  return (
    <div className="group relative flex items-center">
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-press ease-standard",
        active
          ? "bg-sidebar-active font-semibold text-white"
          : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-muted hover:text-white"
      )}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" /> : null}
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-sidebar-foreground/55")} />
      <span className="whitespace-normal leading-snug">{name}</span>
    </Link>
      {onPin ? <PinButton name={name} pinned={pinned} onPin={onPin} /> : null}
    </div>
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
  pinned,
  onPin,
}: {
  item: NavItem & { children: NavChild[] }
  pathname: string
  onNavigate: () => void
  pinned: boolean
  onPin: () => void
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
          "group relative flex items-center rounded-lg transition-colors",
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
          <span className="whitespace-normal leading-snug">{item.name}</span>
        </Link>
        <PinButton name={item.name} pinned={pinned} onPin={onPin} />
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
        <div className="motion-rise relative mt-0.5 space-y-0.5 pb-1 pl-[18px]">
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
                <span className="whitespace-normal leading-snug">{child.name}</span>
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
