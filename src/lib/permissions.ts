import { cache } from "react"
import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { BOOKS_DESK_ROLES, isBooksDesk, isSuperAdmin } from "@/lib/roles"

export { isSuperAdmin, isBooksDesk, BOOKS_DESK_ROLES } from "@/lib/roles"

export const VIEW_PERMS = [
  { key: "view.dashboard", label: "Executive Dashboard", href: "/dashboard" },
  { key: "view.products", label: "Product Catalog & SKUs", href: "/products" },
  { key: "view.uploads", label: "Data Ingestion & Imports", href: "/uploads" },
  { key: "view.imei", label: "Serialized Assets (IMEI)", href: "/imei" },
  { key: "view.inventory", label: "Current Stock on Hand", href: "/inventory" },
  { key: "view.incoming", label: "Inbound Vendor Shipments", href: "/incoming" },
  { key: "view.sales", label: "Sales Orders & Invoices", href: "/sales" },
  { key: "view.pos", label: "Point of Sale (POS)", href: "/pos" },
  { key: "view.purchases", label: "Purchase Orders & Receiving", href: "/purchases" },
  { key: "view.customers", label: "Customer Accounts & CRM", href: "/customers" },
  { key: "view.suppliers", label: "Vendors & Suppliers", href: "/suppliers" },
  { key: "view.transfers", label: "Inter-Branch Transfers", href: "/transfers" },
  { key: "view.neighbor-fills", label: "External Partner Sourcing", href: "/neighbor-fills" },
  { key: "view.returns", label: "Customer Returns (RMA)", href: "/returns" },
  { key: "view.swaps", label: "Trade-In & Exchange", href: "/swaps" },
  { key: "view.repairs", label: "Service & Repairs", href: "/repairs" },
  { key: "view.reconciliation", label: "Physical Inventory Audit", href: "/reconciliation" },
  { key: "view.finance", label: "Cash Flow & Financial Ledger", href: "/finance" },
  { key: "view.expenses", label: "Operating Expenses (OPEX)", href: "/expenses" },
  { key: "view.approvals", label: "Approval Workflows", href: "/approvals" },
  { key: "view.branches", label: "Branch Locations", href: "/branches" },
  { key: "view.staff", label: "User Management", href: "/staff" },
  { key: "view.access", label: "Role-Based Access Control (RBAC)", href: "/staff/access" },
  { key: "view.profits", label: "Profitability Analytics (P&L)", href: "/profits" },
  { key: "view.reports", label: "Business Intelligence Reports", href: "/reports" },
  { key: "view.audit", label: "System Audit Trail", href: "/audit" },
  { key: "view.notifications", label: "System Alerts & Notifications", href: "/notifications" },
  { key: "view.settings", label: "System Configuration", href: "/settings" },
] as const

export const ACTION_PERMS = [
  { key: "action.sell", label: "Execute Sales & Process Payments" },
  { key: "action.catalog", label: "Manage Catalog Items & Set Prices" },
  { key: "action.upload", label: "Execute Batch Spreadsheet Imports" },
  { key: "action.intake", label: "Receive Vendor Stock & Register IMEIs" },
  { key: "action.incoming", label: "Book Inbound Shipments in Transit" },
  { key: "action.transfer", label: "Dispatch & Receive Inter-Branch Transfers" },
  { key: "action.neighbor", label: "Process External Partner Sourced Units" },
  { key: "action.return", label: "Process Customer Returns & Warranties" },
  { key: "action.swap", label: "Valuate & Ingest Customer Device Trade-Ins" },
  { key: "action.repair", label: "Manage Diagnostics & Hardware Repairs" },
  { key: "action.recon", label: "Perform Physical Inventory Audits" },
  { key: "action.approve", label: "Approve or Reject Workflow Requests" },
  { key: "action.finance", label: "Disburse Expenses & Settle Vendor Payables" },
  { key: "action.staff", label: "Manage Staff Profiles & Roles" },
  { key: "action.settings", label: "Modify System & Branch Settings" },
  { key: "action.all_branches", label: "Cross-Branch Enterprise Visibility" },
  { key: "action.override_floor", label: "Authorize Discounts Below Price Floor" },
] as const

export const ALL_PERM_KEYS = [...VIEW_PERMS, ...ACTION_PERMS].map((row) => row.key)

const ALL = ALL_PERM_KEYS

const V = (...keys: string[]) => keys

/**
 * One key ring for the books desk.
 *
 * Records checker used to only check and approve. Accountant used to only
 * post money. In this shop the same person (or two people on the same desk)
 * needs both: see Who did what, Check the books, pay suppliers, record
 * expenses, and collect money. So both jobs open the same pages and do the
 * same money work.
 */
export const BOOKS_DESK_KEYS = V(
  "view.dashboard",
  "view.products",
  "view.imei",
  "view.inventory",
  "view.incoming",
  "view.sales",
  "view.pos",
  "view.purchases",
  "view.customers",
  "view.suppliers",
  "view.transfers",
  "view.neighbor-fills",
  "view.returns",
  "view.swaps",
  "view.repairs",
  "view.reconciliation",
  "view.finance",
  "view.expenses",
  "view.profits",
  "view.approvals",
  "view.branches",
  "view.reports",
  "view.audit",
  "view.notifications",
  "action.sell",
  "action.finance",
  "action.approve",
  "action.recon",
  "action.all_branches"
)

const DEFAULTS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL,
  // The CEO watches the business. Loading the item list and the stock is the
  // uploader's job, so those two are left off deliberately.
  CEO: ALL.filter(
    (key) =>
      key !== "view.access" &&
      key !== "action.override_floor" &&
      key !== "action.settings" &&
      key !== "view.uploads" &&
      key !== "action.upload"
  ),
  AUDITOR: BOOKS_DESK_KEYS,
  ACCOUNTANT: BOOKS_DESK_KEYS,
  BRANCH_MANAGER: V(
    "view.dashboard", "view.products", "view.imei", "view.inventory", "view.incoming", "view.sales", "view.pos",
    "view.purchases", "view.customers", "view.suppliers", "view.transfers", "view.neighbor-fills", "view.returns",
    "view.swaps", "view.repairs", "view.reconciliation", "view.finance", "view.expenses", "view.profits",
    "view.approvals", "view.staff", "view.reports", "view.notifications",
    "action.sell", "action.intake", "action.incoming", "action.transfer", "action.neighbor",
    "action.return", "action.swap", "action.repair", "action.recon", "action.approve", "action.finance", "action.staff"
  ),
  VAULT_MANAGER: V(
    "view.dashboard", "view.products", "view.imei", "view.inventory", "view.incoming", "view.purchases",
    "view.suppliers", "view.transfers", "view.notifications",
    "action.intake", "action.incoming", "action.transfer"
  ),
  STOCK_UPLOADER: V(
    "view.dashboard", "view.uploads", "view.products", "view.imei", "view.inventory", "view.purchases", "view.notifications",
    "action.upload", "action.catalog", "action.all_branches"
  ),
  CASHIER: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.expenses", "view.neighbor-fills", "view.returns", "view.notifications",
    "action.sell", "action.neighbor", "action.return", "action.finance"
  ),
  SALES_EXECUTIVE: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.products", "view.expenses", "view.neighbor-fills", "view.notifications",
    "action.sell", "action.neighbor", "action.finance"
  ),
  ENGINEER: V(
    "view.dashboard", "view.imei", "view.repairs", "view.returns", "view.customers", "view.notifications",
    "action.repair", "action.return"
  ),
}

const ROLE_LIST = Object.keys(DEFAULTS) as UserRole[]
const EXPECTED_ROWS = ROLE_LIST.length * ALL_PERM_KEYS.length

/**
 * Fill in any permission row a new release added. The common case is that
 * nothing is missing, so that case costs one cheap count instead of reading the
 * whole table. Wrapped in cache() so it runs once per request no matter how many
 * screens and buttons ask what this member of staff may do.
 */
export const ensureRolePermissions = cache(async () => {
  if ((await prisma.rolePermission.count()) >= EXPECTED_ROWS) return

  const existing = await prisma.rolePermission.findMany({ select: { role: true, permKey: true } })
  const have = new Set(existing.map((row) => `${row.role}:${row.permKey}`))
  const missing = ROLE_LIST.flatMap((role) =>
    ALL_PERM_KEYS.filter((permKey) => !have.has(`${role}:${permKey}`)).map((permKey) => ({
      role,
      permKey,
      allowed: role === "SUPER_ADMIN" || DEFAULTS[role].includes(permKey),
    }))
  )
  if (missing.length) await prisma.rolePermission.createMany({ data: missing })
})

/**
 * Every allowed permission, for every role, in one read. Checking a single role
 * at a time meant a fresh query for each button on the page; a whole page load
 * used to run a dozen of them. cache() holds the answer for this one request
 * only, so a change on Who can see what still shows up on the next page.
 */
const loadPermissionMap = cache(async () => {
  await ensureRolePermissions()
  const rows = await prisma.rolePermission.findMany({
    select: { role: true, permKey: true, allowed: true },
  })
  // A role that appears here has been set up, even if every box is unticked.
  // That is different from a role nobody has touched yet, so both are tracked:
  // unticking everything must lock the role out, not quietly hand back the
  // permissions it shipped with.
  const map = new Map<UserRole, Set<string>>()
  for (const row of rows) {
    const set = map.get(row.role) ?? new Set<string>()
    if (row.allowed) set.add(row.permKey)
    map.set(row.role, set)
  }
  return map
})

export async function getAllowedKeys(role: UserRole) {
  if (role === "SUPER_ADMIN") return new Set(ALL_PERM_KEYS)
  const map = await loadPermissionMap()

  // Books desk: records checker and accountant hold the same key ring.
  // Whatever is ticked for either job is open to both, so one login can check
  // the books and also post money without swapping accounts.
  if (isBooksDesk(role)) {
    const out = new Set<string>()
    let anyConfigured = false
    for (const deskRole of BOOKS_DESK_ROLES) {
      const allowed = map.get(deskRole)
      if (!allowed) {
        for (const key of BOOKS_DESK_KEYS) out.add(key)
        continue
      }
      anyConfigured = true
      for (const key of allowed) out.add(key)
    }
    if (!anyConfigured) return new Set(BOOKS_DESK_KEYS)
    return out
  }

  const allowed = map.get(role)
  // No rows at all means Who can see what has never been set up for this role,
  // so fall back to what it ships with rather than locking the person out.
  if (!allowed) return new Set(DEFAULTS[role] ?? [])
  // Handed back as a copy: the map is held for the whole request, and a caller
  // that added to it would change what everyone else on the page is allowed.
  return new Set(allowed)
}

export async function can(role: UserRole, key: string) {
  if (role === "SUPER_ADMIN") return true
  if (key === "action.undo" || key === "view.access") return false
  const allowed = await getAllowedKeys(role)
  return allowed.has(key)
}

export async function canUndo(role: UserRole) {
  return role === "SUPER_ADMIN"
}

export function viewKeyForPath(pathname: string) {
  const match = VIEW_PERMS
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((row) => pathname === row.href || pathname.startsWith(`${row.href}/`))
  return match?.key ?? "view.dashboard"
}

export function hrefsForKeys(keys: Set<string>) {
  const hrefs: string[] = VIEW_PERMS.filter((row) => keys.has(row.key)).map((row) => row.href)
  if ((keys.has("view.finance") || keys.has("view.pos")) && !hrefs.includes("/finance/close")) {
    hrefs.push("/finance/close")
  }
  if ((keys.has("view.audit") || keys.has("view.finance") || keys.has("view.reports")) && !hrefs.includes("/audit/books")) {
    hrefs.push("/audit/books")
  }
  if ((keys.has("view.uploads") || keys.has("view.reports")) && !hrefs.includes("/opening-stock")) {
    hrefs.push("/opening-stock")
  }
  if (!hrefs.includes("/help")) hrefs.push("/help")
  return hrefs
}

export { pathIsAllowed } from "@/lib/access-path"

export function firstAllowedHref(keys: Set<string>) {
  return hrefsForKeys(keys)[0] || "/login"
}

export { DEFAULTS }
