import type { UserRole } from "@prisma/client"
import { can } from "@/lib/permissions"

export { isSuperAdmin, isBooksDesk, booksDeskPartner, BOOKS_DESK_ROLES, ROLE_LABELS } from "@/lib/roles"

export async function canSeeAllBranches(role: UserRole) {
  return can(role, "action.all_branches")
}

export async function canManageCatalog(role: UserRole) {
  return can(role, "action.catalog")
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

export async function canManageStaff(role: UserRole) {
  return can(role, "action.staff")
}

export async function scopedBranchId(role: UserRole, branchId: string | null, requested?: string | null) {
  if (await canSeeAllBranches(role)) return requested ?? undefined
  return branchId ?? requested ?? undefined
}
