import { cache } from "react"
import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { BOOKS_DESK_ROLES, isBooksDesk, isShopOwner, isSuperAdmin } from "@/lib/roles"

export { isSuperAdmin, isShopOwner, isBooksDesk, BOOKS_DESK_ROLES } from "@/lib/roles"

export const VIEW_PERMS = [
  { key: "view.dashboard", label: "Home", href: "/dashboard" },
  { key: "view.uploads", label: "Upload stock", href: "/uploads" },
  { key: "view.products", label: "Phones & items", href: "/products" },
  { key: "view.imei", label: "Phone numbers (IMEI)", href: "/imei" },
  { key: "view.inventory", label: "Shop stock", href: "/inventory" },
  { key: "view.incoming", label: "Goods on the way", href: "/incoming" },
  { key: "view.sales", label: "Sales", href: "/sales" },
  { key: "view.pos", label: "Sell now", href: "/pos" },
  { key: "view.purchases", label: "Goods from supplier", href: "/purchases" },
  { key: "view.customers", label: "Customers & money owed", href: "/customers" },
  { key: "view.suppliers", label: "Suppliers", href: "/suppliers" },
  { key: "view.transfers", label: "Shop to shop", href: "/transfers" },
  { key: "view.neighbor-fills", label: "Stock Outsourcing (Neighbour shop fill)", href: "/neighbor-fills" },
  { key: "view.returns", label: "Returns", href: "/returns" },
  { key: "view.swaps", label: "Swap Deal", href: "/swaps" },
  { key: "view.repairs", label: "Repairs", href: "/repairs" },
  { key: "view.reconciliation", label: "Stock count", href: "/reconciliation" },
  { key: "view.finance", label: "Money in & out", href: "/finance" },
  { key: "view.expenses", label: "Shop expenses", href: "/expenses" },
  { key: "view.approvals", label: "Needs approval", href: "/approvals" },
  { key: "view.branches", label: "Shops", href: "/branches" },
  { key: "view.staff", label: "Staff", href: "/staff" },
  { key: "view.access", label: "Who can see what", href: "/staff/access" },
  { key: "view.profits", label: "Profit", href: "/profits" },
  { key: "view.reports", label: "Reports", href: "/reports" },
  { key: "view.audit", label: "Who did what", href: "/audit" },
  { key: "view.notifications", label: "Alerts", href: "/notifications" },
  { key: "view.settings", label: "Settings", href: "/settings" },
] as const

export const ACTION_PERMS = [
  { key: "action.sell", label: "Sell and take payment" },
  { key: "action.catalog", label: "Add items and change prices" },
  { key: "action.upload", label: "Upload stock from a sheet or supplier bill" },
  { key: "action.intake", label: "Put one phone on the shelf" },
  { key: "action.incoming", label: "Book goods on the way" },
  { key: "action.transfer", label: "Send and receive shop to shop" },
  { key: "action.neighbor", label: "Buy from next door" },
  { key: "action.return", label: "Take a return" },
  { key: "action.swap", label: "Record a Swap Deal" },
  { key: "action.repair", label: "Open and move a repair" },
  { key: "action.recon", label: "Send a stock count" },
  { key: "action.approve", label: "Say yes or no to waiting work" },
  { key: "action.finance", label: "Post expenses and pay suppliers" },
  { key: "action.staff", label: "Add and edit staff" },
  { key: "action.settings", label: "Change shop settings" },
  { key: "action.all_branches", label: "See every shop" },
  { key: "action.override_floor", label: "Sell below the lowest price" },
] as const

export const ALL_PERM_KEYS = [...VIEW_PERMS, ...ACTION_PERMS].map((row) => row.key)

const ALL = ALL_PERM_KEYS

const V = (...keys: string[]) => keys

/**
 * One key ring for the books desk (Financial Accountant and Internal Auditor).
 *
 * At Abu Twins the auditor also oversees every workflow, so both jobs may open
 * every shop page except Who can see what. They may post money and pay
 * suppliers. They may not sell, repair, approve shop work, load stock, or
 * change Settings — that stays with floor staff and Super Admin.
 */
export const BOOKS_DESK_KEYS = V(
  ...VIEW_PERMS.filter((row) => row.key !== "view.access").map((row) => row.key),
  "action.finance",
  "action.all_branches"
)

const DEFAULTS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL,
  // The CEO is an owner of the shop, with the main admin. They can correct
  // money, staff, shops, settings, and Who can see what. They cannot take the
  // main admin job away, and nobody can secretly rewrite an old invoice.
  CEO: ALL,
  AUDITOR: BOOKS_DESK_KEYS,
  ACCOUNTANT: BOOKS_DESK_KEYS,
  BRANCH_MANAGER: V(
    "view.dashboard", "view.products", "view.uploads", "view.imei", "view.inventory", "view.incoming", "view.sales", "view.pos",
    "view.purchases", "view.customers", "view.suppliers", "view.transfers", "view.neighbor-fills", "view.returns",
    "view.swaps", "view.repairs", "view.reconciliation", "view.finance", "view.expenses", "view.profits",
    "view.approvals", "view.staff", "view.reports", "view.notifications",
    "action.sell", "action.upload", "action.intake", "action.incoming", "action.transfer", "action.neighbor",
    "action.return", "action.swap", "action.repair", "action.recon", "action.approve", "action.finance", "action.staff"
  ),
  VAULT_MANAGER: V(
    "view.dashboard", "view.products", "view.uploads", "view.imei", "view.inventory", "view.incoming", "view.purchases",
    "view.suppliers", "view.transfers", "view.notifications",
    "action.upload", "action.intake", "action.incoming", "action.transfer"
  ),
  STOCK_UPLOADER: V(
    "view.dashboard", "view.uploads", "view.products", "view.imei", "view.inventory", "view.purchases", "view.notifications",
    "action.upload", "action.intake", "action.catalog", "action.all_branches"
  ),
  CASHIER: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.expenses", "view.finance", "view.neighbor-fills", "view.returns", "view.notifications",
    "action.sell", "action.neighbor", "action.return", "action.finance"
  ),
  SALES_EXECUTIVE: V(
    "view.dashboard", "view.pos", "view.sales", "view.customers", "view.products", "view.expenses", "view.finance", "view.neighbor-fills", "view.notifications",
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
  if ((await prisma.rolePermission.count()) < EXPECTED_ROWS) {
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
  }

  // Small shops: cashier and sales also record expenses and call people who still
  // owe us. Turn those doors on even if an older install left them closed.
  await prisma.rolePermission.updateMany({
    where: {
      role: { in: ["CASHIER", "SALES_EXECUTIVE"] },
      permKey: { in: ["view.expenses", "view.finance", "view.customers", "action.finance"] },
      allowed: false,
    },
    data: { allowed: true },
  })

  // Goods intake and shop managers must be able to load stock both ways:
  // many phones from Excel, and one phone after another on a supplier bill.
  await prisma.rolePermission.updateMany({
    where: {
      role: { in: ["BRANCH_MANAGER", "VAULT_MANAGER", "STOCK_UPLOADER"] },
      permKey: { in: ["view.uploads", "action.upload", "action.intake", "view.imei", "view.products", "view.inventory"] },
      allowed: false,
    },
    data: { allowed: true },
  })

  await prisma.rolePermission.updateMany({
    where: { role: "CEO", allowed: false },
    data: { allowed: true },
  })

  // Books desk: open every shop page for oversight, keep money posting, and
  // close floor actions that used to sit on this key ring by mistake.
  const booksViews = VIEW_PERMS.filter((row) => row.key !== "view.access").map((row) => row.key)
  await prisma.rolePermission.updateMany({
    where: {
      role: { in: ["AUDITOR", "ACCOUNTANT"] },
      permKey: { in: [...booksViews, "action.finance", "action.all_branches"] },
      allowed: false,
    },
    data: { allowed: true },
  })
  await prisma.rolePermission.updateMany({
    where: {
      role: { in: ["AUDITOR", "ACCOUNTANT"] },
      permKey: {
        in: [
          "view.access",
          "action.sell",
          "action.catalog",
          "action.upload",
          "action.intake",
          "action.incoming",
          "action.transfer",
          "action.neighbor",
          "action.return",
          "action.swap",
          "action.repair",
          "action.recon",
          "action.approve",
          "action.staff",
          "action.settings",
          "action.override_floor",
        ],
      },
      allowed: true,
    },
    data: { allowed: false },
  })
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
  if (isShopOwner(role) && (key === "action.undo" || key === "view.access")) return true
  if (key === "action.undo") return false
  const allowed = await getAllowedKeys(role)
  return allowed.has(key)
}

export async function canUndo(role: UserRole) {
  return isShopOwner(role)
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
