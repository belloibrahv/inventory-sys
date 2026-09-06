import { UserRole } from "@prisma/client"
import { can, isSuperAdmin } from "@/lib/permissions"

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CEO: "CEO",
  AUDITOR: "Records checker",
  ACCOUNTANT: "Accountant",
  BRANCH_MANAGER: "Shop manager",
  VAULT_MANAGER: "IMEI keeper",
  CASHIER: "Cashier",
  SALES_EXECUTIVE: "Sales person",
  ENGINEER: "Repair engineer",
}

export { isSuperAdmin }

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
