import { isOnItem, type NavChild } from "@/components/layout/nav"

/**
 * Which child of a split area is the one being looked at.
 *
 * The first child usually shares the parent's own href (/products for the price
 * list), so a plain prefix test lights up two tabs at once on /products/new.
 * Longest matching href wins, which picks the deeper route every time and still
 * falls back to the parent-level child on /products and on /imei/<id>.
 */
export function activeChildHref(pathname: string, children: NavChild[]) {
  let best: string | null = null
  for (const child of children) {
    if (!isOnItem(pathname, child.href)) continue
    if (best === null || child.href.length > best.length) best = child.href
  }
  return best
}
