import type { UserRole } from "@prisma/client"
import { can } from "@/lib/permissions"
import { isBooksDesk, isShopOwner } from "@/lib/roles"

export {
  isSuperAdmin,
  isShopOwner,
  isCEO,
  canSeeProfit,
  canSeeCost,
  canChangeCost,
  canChangePrices,
  canHardDelete,
  isBooksDesk,
  booksDeskPartner,
  BOOKS_DESK_ROLES,
  ROLE_LABELS,
  canEditLetterhead,
} from "@/lib/roles"

export async function canSeeAllBranches(role: UserRole) {
  return can(role, "action.all_branches")
}

export async function canManageCatalog(role: UserRole) {
  return can(role, "action.catalog")
}

/**
 * Putting a new item name on the list. Full catalog staff can, and so can a
 * role given only Add new item names (shop managers): their new items carry
 * no prices until the CEO or main admin sets them (setsStartingPrices).
 */
export async function canAddItemName(role: UserRole) {
  return (await canManageCatalog(role)) || (await can(role, "action.add_item"))
}

/** May this person type the starting prices on a brand-new item? */
export async function setsStartingPrices(role: UserRole) {
  return isShopOwner(role) || (await canManageCatalog(role))
}

export async function canSell(role: UserRole) {
  return can(role, "action.sell")
}

export async function canApprove(role: UserRole) {
  return can(role, "action.approve")
}

export async function canManageFinance(role: UserRole) {
  return can(role, "action.finance")
}

/** Opening cash and named banks. Main admin, CEO, accountant, records checker. */
export function canSetOpeningMoney(role: UserRole) {
  return isShopOwner(role) || isBooksDesk(role)
}

export async function canManageStaff(role: UserRole) {
  return can(role, "action.staff")
}

export async function scopedBranchId(role: UserRole, branchId: string | null, requested?: string | null) {
  if (await canSeeAllBranches(role)) return requested ?? undefined
  return branchId ?? requested ?? undefined
}
