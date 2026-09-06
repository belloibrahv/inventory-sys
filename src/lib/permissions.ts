import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const VIEW_PERMS = [
  { key: "view.dashboard", label: "Home", href: "/dashboard" },
  { key: "view.products", label: "Phones & items", href: "/products" },
  { key: "view.imei", label: "Phone IMEIs", href: "/imei" },
  { key: "view.inventory", label: "Shop stock", href: "/inventory" },
  { key: "view.incoming", label: "Goods on the way", href: "/incoming" },
  { key: "view.sales", label: "Sales", href: "/sales" },
  { key: "view.pos", label: "Sell now", href: "/pos" },
  { key: "view.purchases", label: "Goods from supplier", href: "/purchases" },
  { key: "view.customers", label: "Customers", href: "/customers" },
  { key: "view.suppliers", label: "Suppliers", href: "/suppliers" },
  { key: "view.transfers", label: "Send to another shop", href: "/transfers" },
  { key: "view.returns", label: "Returns", href: "/returns" },
  { key: "view.swaps", label: "Swaps", href: "/swaps" },
  { key: "view.repairs", label: "Repairs", href: "/repairs" },
  { key: "view.reconciliation", label: "Stock count", href: "/reconciliation" },
  { key: "view.finance", label: "Money in & out", href: "/finance" },
  { key: "view.expenses", label: "Expenses", href: "/expenses" },
  { key: "view.approvals", label: "Needs approval", href: "/approvals" },
  { key: "view.branches", label: "Shops", href: "/branches" },
  { key: "view.staff", label: "Staff", href: "/staff" },
  { key: "view.access", label: "Who can see what", href: "/staff/access" },
  { key: "view.reports", label: "Reports", href: "/reports" },
  { key: "view.audit", label: "Who did what", href: "/audit" },
  { key: "view.notifications", label: "Alerts", href: "/notifications" },
  { key: "view.settings", label: "Settings", href: "/settings" },
] as const

export const ACTION_PERMS = [
  { key: "action.sell", label: "Sell and collect money" },
  { key: "action.catalog", label: "Add items and change prices" },
  { key: "action.intake", label: "Receive phones and supplier goods" },
  { key: "action.incoming", label: "Book goods before they arrive" },
  { key: "action.transfer", label: "Send and receive goods between shops" },
  { key: "action.return", label: "Record returns" },
  { key: "action.swap", label: "Record swaps" },
  { key: "action.repair", label: "Handle repairs" },
  { key: "action.recon", label: "Count stock" },
  { key: "action.approve", label: "Approve or reject requests" },
  { key: "action.finance", label: "Record expenses and pay suppliers" },
  { key: "action.staff", label: "Add staff" },
  { key: "action.settings", label: "Change shop settings" },
  { key: "action.all_branches", label: "See every shop" },
  { key: "action.override_floor", label: "Sell below the lowest allowed price" },
] as const

export const ALL_PERM_KEYS = [...VIEW_PERMS, ...ACTION_PERMS].map((row) => row.key)

const ALL = ALL_PERM_KEYS

const V = (...keys: string[]) => keys

const DEFAULTS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL,
  CEO: ALL.filter((key) => key !== "view.access" && key !== "action.override_floor" && key !== "action.settings"),
  AUDITOR: V(
    "view.dashboard", "view.products", "view.imei", "view.inventory", "view.incoming", "view.sales", "view.purchases",
    "view.customers", "view.suppliers", "view.transfers", "view.returns", "view.swaps", "view.repairs",
    "view.reconciliation", "view.finance", "view.expenses", "view.approvals", "view.branches",
    "view.reports", "view.audit", "view.notifications",
    "action.approve", "action.recon", "action.all_branches"
  ),
  ACCOUNTANT: V(
    "view.dashboard", "view.sales", "view.customers", "view.suppliers", "view.purchases",
    "view.finance", "view.expenses", "view.reports", "view.notifications",
    "action.sell", "action.finance", "action.all_branches"
  ),
  BRANCH_MANAGER: V(
    "view.dashboard", "view.products", "view.imei", "view.inventory", "view.incoming", "view.sales", "view.pos",
    "view.purchases", "view.customers", "view.suppliers", "view.transfers", "view.returns",
    "view.swaps", "view.repairs", "view.reconciliation", "view.finance", "view.expenses",
    "view.approvals", "view.staff", "view.reports", "view.notifications",
    "action.sell", "action.catalog", "action.intake", "action.incoming", "action.transfer", "action.return",
    "action.swap", "action.repair", "action.recon", "action.approve", "action.finance", "action.staff"
  ),
  VAULT_MANAGER: V(
    "view.dashboard", "view.products", "view.imei", "view.inventory", "view.incoming", "view.purchases",
    "view.suppliers", "view.transfers", "view.notifications",
    "action.intake", "action.incoming", "action.transfer", "action.catalog"
  ),
  CASHIER: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.returns", "view.notifications",
    "action.sell", "action.return"
  ),
  SALES_EXECUTIVE: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.products", "view.notifications",
    "action.sell"
  ),
  ENGINEER: V(
    "view.dashboard", "view.imei", "view.repairs", "view.returns", "view.customers", "view.notifications",
    "action.repair", "action.return"
  ),
}

export function isSuperAdmin(role: UserRole) {
  return role === "SUPER_ADMIN"
}

export async function ensureRolePermissions() {
  const existing = await prisma.rolePermission.findMany()
  const have = new Set(existing.map((row) => `${row.role}:${row.permKey}`))
  const rows = (Object.keys(DEFAULTS) as UserRole[]).flatMap((role) =>
    ALL_PERM_KEYS.map((permKey) => ({
      role,
      permKey,
      allowed: role === "SUPER_ADMIN" || DEFAULTS[role].includes(permKey),
    }))
  )
  const missing = rows.filter((row) => !have.has(`${row.role}:${row.permKey}`))
  if (missing.length) await prisma.rolePermission.createMany({ data: missing })
}

export async function getAllowedKeys(role: UserRole) {
  if (role === "SUPER_ADMIN") return new Set(ALL_PERM_KEYS)
  await ensureRolePermissions()
  const rows = await prisma.rolePermission.findMany({ where: { role } })
  if (rows.length === 0) return new Set(DEFAULTS[role] ?? [])
  return new Set(rows.filter((row) => row.allowed).map((row) => row.permKey))
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
  return VIEW_PERMS.filter((row) => keys.has(row.key)).map((row) => row.href)
}

export { pathIsAllowed } from "@/lib/access-path"

export function firstAllowedHref(keys: Set<string>) {
  return hrefsForKeys(keys)[0] || "/login"
}

export { DEFAULTS }
