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

/** Records checker and accountant share one desk: money, books, and checks. */
export const BOOKS_DESK_ROLES: UserRole[] = ["AUDITOR", "ACCOUNTANT"]

export function isSuperAdmin(role: UserRole) {
  return role === "SUPER_ADMIN"
}

export function isBooksDesk(role: UserRole) {
  return role === "AUDITOR" || role === "ACCOUNTANT"
}

export function booksDeskPartner(role: UserRole): UserRole | null {
  if (role === "AUDITOR") return "ACCOUNTANT"
  if (role === "ACCOUNTANT") return "AUDITOR"
  return null
}
