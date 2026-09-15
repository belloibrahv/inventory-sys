import type { UserRole } from "@prisma/client"

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "System Administrator",
  CEO: "Managing Director / CEO",
  AUDITOR: "Internal Auditor",
  ACCOUNTANT: "Financial Accountant",
  BRANCH_MANAGER: "Branch Manager",
  VAULT_MANAGER: "Inventory & Vault Custodian",
  STOCK_UPLOADER: "Stock Ingestion Specialist",
  CASHIER: "Cashier / Till Operator",
  SALES_EXECUTIVE: "Sales Executive",
  ENGINEER: "Hardware Diagnostics & Repair Engineer",
}

/** Internal Auditor and Accountant share financial oversight: ledgers, audit trail, and internal controls. */
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
