"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { childrenForPath } from "@/components/layout/nav"
import { activeChildHref } from "@/components/layout/nav-active"
import { pathIsAllowed } from "@/lib/access-path"

/**
 * The tab strip for a screen that was split into sections.
 *
 * It reads the same nav table the sidebar reads, so adding a section in one
 * place gives you both the fold-out in the menu and the strip here. Nothing is
 * drawn on screens that were never split, and nothing is drawn when only one
 * section is open to this role.
 */
export function SectionTabs({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname()
  const area = childrenForPath(pathname)
  if (!area) return null

  const children = area.children.filter((child) => pathIsAllowed(child.href, allowedHrefs))
  if (children.length < 2) return null

  const activeHref = activeChildHref(pathname, children)
  const active = children.find((child) => child.href === activeHref)

  return (
    <div className="py-2.5">
      <div
        className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-2xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={`${area.parent.name} sections`}
      >
        {children.map((child) => {
          const isActive = child.href === activeHref
          const Icon = child.icon
          return (
            <Link
              key={child.href}
              href={child.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-bold transition-all",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-transparent bg-muted/70 text-foreground hover:border-border hover:bg-card"
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary-foreground" : "text-foreground/70"
                  )}
                />
              ) : null}
              <span className="whitespace-nowrap">{child.name}</span>
            </Link>
          )
        })}
      </div>
      {active?.hint ? <p className="mt-1.5 px-1 text-xs text-muted-foreground">{active.hint}</p> : null}
    </div>
  )
}
