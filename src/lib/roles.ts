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

/**
 * Main admin and CEO share the system upkeep jobs: staff logins, Who can see
 * what, shops, backups. Business corrections (undoing money, opening stock,
 * prices) belong to the CEO alone; use isCEO for those.
 */
export function isShopOwner(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "CEO"
}

/**
 * The CEO owns the business. Profit, margins, what items cost us, and changing
 * prices are theirs alone. These are fixed here in code rather than left as
 * boxes on Who can see what, so no screen can hand them to anyone else, the
 * main admin included.
 */
export function isCEO(role: UserRole) {
  return role === "CEO"
}

/** Profit figures, margins, and "we kept" anywhere in the app. */
export function canSeeProfit(role: UserRole) {
  return isCEO(role)
}

/**
 * What an item cost us, on the price list, the till, stock value and reports.
 * People loading stock still type the cost from the supplier bill as they
 * enter it; that entry is the only place anyone else meets a cost price.
 */
export function canSeeCost(role: UserRole) {
  return isCEO(role)
}

/**
 * Changing the selling, lowest or cost price of an item already on the list.
 * A new item still gets its starting prices from whoever adds or loads it.
 */
export function canChangePrices(role: UserRole) {
  return isCEO(role)
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
