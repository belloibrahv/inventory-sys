import type { UserRole } from "@prisma/client"

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Main admin",
  CEO: "CEO / owner",
  AUDITOR: "Records checker",
  ACCOUNTANT: "Accountant",
  BRANCH_MANAGER: "Shop manager",
  VAULT_MANAGER: "Receive goods",
  STOCK_UPLOADER: "Person who loads stock",
  CASHIER: "Cashier",
  SALES_EXECUTIVE: "Sales person",
  ENGINEER: "Repair person",
}

export function isSuperAdmin(role: UserRole) {
  return role === "SUPER_ADMIN"
}
