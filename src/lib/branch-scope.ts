import { cookies } from "next/headers"
import type { UserRole } from "@prisma/client"
import { canSeeAllBranches } from "@/lib/rbac"

/**
 * Which shop's records a person is working in.
 *
 * Abu Twins runs three shops. Staff belong to one of them and must only ever
 * see that shop's stock, sales, customers and money. Head office roles see
 * every shop, and may narrow down to one shop at a time.
 */

export type Viewer = {
  role: UserRole
  branchId: string | null
}

/**
 * The shop filter to put on a query.
 *
 * `undefined` means every shop, and is only ever returned for a role that is
 * allowed to see every shop. For everyone else this is their own shop, whatever
 * the screen asked for.
 *
 * `requested` is what the person picked in the shop selector. Head office can
 * use it to look at one shop on its own; for shop staff it is ignored, so a
 * hand-typed branch id in the address bar cannot widen what they see.
 */
export async function branchFilter(viewer: Viewer, requested?: string | null) {
  if (await canSeeAllBranches(viewer.role)) return requested || undefined
  return viewer.branchId ?? undefined
}

/**
 * Whether this person may open a record belonging to a given shop.
 *
 * Records with no shop on them (head office settings, the shared catalogue)
 * are reachable by anyone who got past the permission check.
 */
export async function canReachBranch(viewer: Viewer, recordBranchId: string | null | undefined) {
  if (!recordBranchId) return true
  if (await canSeeAllBranches(viewer.role)) return true
  return viewer.branchId === recordBranchId
}

/**
 * Hand back a record only if the viewer's shop may see it.
 *
 * Out-of-shop records come back as null rather than as an error, so a member of
 * staff at one shop cannot use the difference between "no such invoice" and
 * "not your invoice" to learn what another shop is holding.
 */
export async function scopeRecord<T extends { branchId: string | null }>(
  viewer: Viewer,
  record: T | null,
  branchOf: (row: T) => string | null = (row) => row.branchId
): Promise<T | null> {
  if (!record) return null
  return (await canReachBranch(viewer, branchOf(record))) ? record : null
}

/**
 * The message shown when someone tries to act on another shop's record. Kept in
 * one place so every screen says the same thing.
 */
export const OTHER_SHOP = "That record belongs to another shop."

/** Name of the cookie holding the shop head office is currently looking at. */
export const VIEW_SHOP_COOKIE = "abutwins.view_shop"

/**
 * The shop filter for a screen that is only reading.
 *
 * Shop staff always get their own shop. Head office gets whichever shop they
 * picked in the shop selector, or every shop combined when they have picked
 * "All shops". That is the "individually and collectively" the owner asked for:
 * the same screens, once per shop or all three at once.
 *
 * This is deliberately separate from the check used when something is being
 * written. Looking at Bodija's books must not stop head office from correcting
 * a record at Iwo Road.
 */
export async function viewBranchFilter(viewer: Viewer) {
  if (!(await canSeeAllBranches(viewer.role))) return viewer.branchId ?? undefined
  const picked = (await cookies()).get(VIEW_SHOP_COOKIE)?.value
  return picked && picked !== "ALL" ? picked : undefined
}

/** The shop head office has picked, for showing the selector in the header. */
export async function activeViewShop(viewer: Viewer) {
  if (!(await canSeeAllBranches(viewer.role))) return viewer.branchId ?? null
  const picked = (await cookies()).get(VIEW_SHOP_COOKIE)?.value
  return picked && picked !== "ALL" ? picked : null
}
