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

/** Internal Auditor has full shop oversight on the left menu. Accountant is money and books only. */
export const BOOKS_DESK_ROLES: UserRole[] = ["AUDITOR", "ACCOUNTANT"]

export function isSuperAdmin(role: UserRole) {
  return role === "SUPER_ADMIN"
}

/** Main admin and CEO may correct the shop. Every change is written in Who did what. */
export function isShopOwner(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "CEO"
}

/**
 * Permanent remove / lock-from-system actions.
 * Only the Managing Director (CEO) for now — even Super Admin and the
 * all-shop auditor cannot wipe brands, items, banks, or disable staff logins.
 */
export function canHardDelete(role: UserRole) {
  return role === "CEO"
}

/**
 * Who may change the name, logo and address printed on invoices.
 *
 * The client asked for the main admin, the CEO and the books desk
 * (accountant / auditor) to set the letterhead from Shop details, without
 * also handing them the selling rules.
 */
export function canEditLetterhead(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "CEO" || role === "AUDITOR" || role === "ACCOUNTANT"
}

export function isBooksDesk(role: UserRole) {
  return role === "AUDITOR" || role === "ACCOUNTANT"
}

export function booksDeskPartner(role: UserRole): UserRole | null {
  if (role === "AUDITOR") return "ACCOUNTANT"
  if (role === "ACCOUNTANT") return "AUDITOR"
  return null
}
