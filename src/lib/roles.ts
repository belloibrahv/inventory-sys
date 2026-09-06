import type { UserRole } from "@prisma/client"

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CEO: "CEO",
  AUDITOR: "Records checker",
  ACCOUNTANT: "Accountant",
  BRANCH_MANAGER: "Shop manager",
  VAULT_MANAGER: "Goods intake",
  CASHIER: "Cashier",
  SALES_EXECUTIVE: "Sales person",
  ENGINEER: "Repair engineer",
}

export function isSuperAdmin(role: UserRole) {
  return role === "SUPER_ADMIN"
}
