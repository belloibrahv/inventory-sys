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
 * boxes on Who can see what. Seeing is not changing: only the CEO and the main
 * admin change a cost price (canChangeCost).
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

/**
 * Changing what an item cost us, and the Prices panel on Business today: the
 * CEO and the main admin. The main admin holds full control of the system for
 * the CEO; every change lands in Who did what, and the CEO is alerted to the
 * main admin's cost changes and high-risk work (see lib/prisma).
 */
export function canChangeCost(role: UserRole) {
  return isShopOwner(role)
}

/**
 * Changing the selling or lowest price of an item already on the list: the
 * CEO and the main admin, as is the cost price (canChangeCost). A new item still gets its starting
 * prices from whoever adds or loads it.
 */
export function canChangePrices(role: UserRole) {
  return isShopOwner(role)
}

/**
 * Permanent remove / lock-from-system actions: wiping brands, items and banks,
 * and disabling staff logins. The CEO and the main admin; the all-shop auditor
 * cannot. Each one is high risk in Who did what, so the CEO is alerted when the
 * main admin does it.
 */
export function canHardDelete(role: UserRole) {
  return isShopOwner(role)
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

/**
 * Deciding what happens beyond the shop with returned stock: sending it back
 * to the supplier (return outward), repair or a credit note. The client put
 * this with the Vault Manager, the shop Manager, the CEO and the main admin.
 * Everyone else (cashiers above all) records a return inward only: it comes
 * back into the shop, as a replacement from our stock or a refund.
 */
export function canSendToSupplier(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "CEO" || role === "BRANCH_MANAGER" || role === "VAULT_MANAGER"
}

export function isBooksDesk(role: UserRole) {
  return role === "AUDITOR" || role === "ACCOUNTANT"
}

export function booksDeskPartner(role: UserRole): UserRole | null {
  if (role === "AUDITOR") return "ACCOUNTANT"
  if (role === "ACCOUNTANT") return "AUDITOR"
  return null
}
