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
    <div className="-mx-4 border-b border-border px-4 md:-mx-6 md:px-6">
      <div
        className="flex gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] transition-colors",
                isActive
                  ? "border-brand font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {Icon ? <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand" : "")} /> : null}
              <span className="whitespace-nowrap">{child.name}</span>
            </Link>
          )
        })}
      </div>
      {active?.hint ? <p className="pb-2.5 pt-1 text-xs text-muted-foreground">{active.hint}</p> : null}
    </div>
  )
}
