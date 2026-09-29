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
 * Main admin and CEO both run the shop: every screen, every correction, Who
 * can see what, profit and what items cost us included (canSeeProfit,
 * canSeeCost).
 */
export function isShopOwner(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "CEO"
}

/**
 * The CEO owns the business. Profit, margins and what items cost us are shown
 * to the CEO, the main admin (who runs the system for the CEO), and to the books: the Financial Accountant keeps the accounts and
 * the Internal Auditor checks prices, below-cost sales and stock value, and
 * neither can do that without cost. These are fixed here in code rather than
 * boxes on Who can see what. Seeing is not changing: only the CEO changes a
 * cost price (canChangeCost).
 */
export function isCEO(role: UserRole) {
  return role === "CEO"
}

export const PROFIT_ROLES: readonly UserRole[] = ["CEO", "SUPER_ADMIN", "ACCOUNTANT", "AUDITOR"]

/** Profit figures, margins, and "we kept" anywhere in the app. */
export function canSeeProfit(role: UserRole) {
  return PROFIT_ROLES.includes(role)
}

/**
 * What an item cost us, on the price list, stock value and reports. People
 * loading stock still type the cost from the supplier bill as they enter it.
 */
export function canSeeCost(role: UserRole) {
  return PROFIT_ROLES.includes(role)
}

/** Changing what an item cost us, and the Prices panel on Business today: the CEO only. */
export function canChangeCost(role: UserRole) {
  return isCEO(role)
}

/**
 * Changing the selling or lowest price of an item already on the list: the
 * CEO and the main admin. Changing a cost price stays with the CEO
 * (canChangeCost). A new item still gets its starting
 * prices from whoever adds or loads it.
 */
export function canChangePrices(role: UserRole) {
  return isShopOwner(role)
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
