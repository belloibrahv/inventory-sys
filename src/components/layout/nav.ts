import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  ClipboardCheck,
  DatabaseBackup,
  Factory,
  FileSpreadsheet,
  GitBranch,
  Handshake,
  LayoutDashboard,
  ListOrdered,
  Lock,
  Package,
  PackagePlus,
  PlusCircle,
  Receipt,
  Repeat2,
  Scale,
  ScanLine,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  SlidersHorizontal,
  Store,
  Tags,
  TrendingUp,
  Truck,
  Undo2,
  Upload,
  UserRoundCog,
  Users,
  Wallet,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * One section of a bigger screen, living on its own route.
 *
 * Screens like Upload stock used to stack four unrelated jobs on one page and
 * staff scrolled past three of them to reach the one they came for. Each job is
 * its own route now, and the routes show up twice: folded under the parent in
 * the sidebar, and as a tab strip at the top of the screen.
 */
export type NavChild = {
  name: string
  href: string
  icon?: LucideIcon
  /** One line under the tab, so the split is self-explaining. */
  hint?: string
}

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  children?: NavChild[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Documentation", href: "/help", icon: BookOpen },
    ],
  },
  {
    label: "Inventory Management",
    items: [
      {
        name: "Data Import",
        href: "/uploads",
        icon: Upload,
        children: [
          {
            name: "Purchase Invoices",
            href: "/uploads",
            icon: PackagePlus,
            hint: "Inbound vendor shipment invoice, line items, and serial numbers",
          },
          {
            name: "Opening Stock Sheet",
            href: "/uploads/opening-stock",
            icon: FileSpreadsheet,
            hint: "Initial stock balance upload for a branch from spreadsheet",
          },
          {
            name: "Legacy Migration",
            href: "/uploads/sheets",
            icon: ListOrdered,
            hint: "Tabular data migration: products, stock balances, serials, customers",
          },
        ],
      },
      { name: "Opening Balance Audit", href: "/opening-stock", icon: Lock },
      {
        name: "Product Catalog",
        href: "/products",
        icon: Smartphone,
        children: [
          { name: "SKU Directory & Pricing", href: "/products", icon: Tags, hint: "Item master, unit cost, floor price, and MSRP" },
          { name: "Categories & Brands", href: "/products/brands", icon: Factory, hint: "Manage product hierarchies, brand masters, and classifications" },
          { name: "New Product Entry", href: "/products/new", icon: PlusCircle, hint: "Register an individual new SKU in the catalog" },
          { name: "Bulk Catalog Ingestion", href: "/products/bulk", icon: FileSpreadsheet, hint: "Batch import product catalog via CSV/Excel" },
          { name: "Warranty Policies", href: "/products/warranty", icon: ShieldCheck, hint: "Manufacturer and retailer warranty terms" },
        ],
      },
      {
        name: "Serialized Assets (IMEI)",
        href: "/imei",
        icon: ScanLine,
        children: [
          { name: "Serialized Assets Register", href: "/imei", icon: ScanLine, hint: "Lifecycle tracking and audit trail for serialized units" },
          { name: "Serial Intake", href: "/imei/intake", icon: PackagePlus, hint: "Physical device serialization and inventory intake" },
        ],
      },
      { name: "Stock on Hand", href: "/inventory", icon: Boxes },
      { name: "Inbound Shipments", href: "/incoming", icon: Package },
    ],
  },
  {
    label: "Sales & Procurement",
    items: [
      { name: "Sales Orders", href: "/sales", icon: ShoppingCart },
      { name: "Point of Sale (POS)", href: "/pos", icon: Store },
      { name: "Daily Register Close", href: "/finance/close", icon: ClipboardCheck },
      { name: "Purchase Orders", href: "/purchases", icon: Truck },
      { name: "Customers & money owed", href: "/customers", icon: Users },
      { name: "Vendors & Suppliers", href: "/suppliers", icon: Factory },
    ],
  },
  {
    label: "Operations & Logistics",
    items: [
      { name: "Stock Transfers", href: "/transfers", icon: ArrowLeftRight },
      { name: "External Sourcing", href: "/neighbor-fills", icon: Handshake },
      { name: "Customer Returns (RMA)", href: "/returns", icon: Undo2 },
      { name: "Swap Deal", href: "/swaps", icon: Repeat2 },
      { name: "Service & Repairs", href: "/repairs", icon: Wrench },
      { name: "Inventory Audit", href: "/reconciliation", icon: ClipboardCheck },
    ],
  },
  {
    label: "Financial Accounting",
    items: [
      { name: "Money in & out", href: "/finance", icon: Wallet },
      { name: "Financial Audit Pack", href: "/audit/books", icon: Scale },
      { name: "Profit", href: "/profits", icon: TrendingUp },
      { name: "Shop expenses", href: "/expenses", icon: Receipt },
      { name: "Approval Workflows", href: "/approvals", icon: BadgeCheck },
    ],
  },
  {
    label: "Administration & Security",
    items: [
      { name: "Branch Locations", href: "/branches", icon: GitBranch },
      { name: "User Management", href: "/staff", icon: UserRoundCog },
      { name: "Access Control (RBAC)", href: "/staff/access", icon: Shield },
      { name: "Business Reports", href: "/reports", icon: BarChart3 },
      { name: "Audit Trail", href: "/audit", icon: ScrollText },
      { name: "System Alerts", href: "/notifications", icon: Bell },
      {
        name: "System Configuration",
        href: "/settings",
        icon: Settings,
        children: [
          { name: "Branch Profile", href: "/settings", icon: Building2, hint: "Legal entity, contact details, and receipt header metadata" },
          { name: "Operational Controls", href: "/settings/rules", icon: SlidersHorizontal, hint: "Pricing thresholds, safety stock rules, and warranty defaults" },
          { name: "Data Backup", href: "/settings/backup", icon: DatabaseBackup, hint: "Full database snapshot export for disaster recovery" },
        ],
      },
    ],
  },
]

/** Flat list of every destination, parents and children alike. */
export const navDestinations = navGroups.flatMap((group) =>
  group.items.flatMap((item) => [
    { name: item.name, href: item.href, parent: null as string | null },
    ...(item.children ?? [])
      .filter((child) => child.href !== item.href)
      .map((child) => ({ name: child.name, href: child.href, parent: item.name })),
  ])
)

/** True when `pathname` sits on this item or anywhere under it. */
export function isOnItem(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The children strip to draw above a screen, or null when the screen is not
 * part of a split area. Child order decides tab order.
 */
export function childrenForPath(pathname: string): { parent: NavItem; children: NavChild[] } | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!item.children?.length) continue
      if (isOnItem(pathname, item.href) || item.children.some((child) => isOnItem(pathname, child.href))) {
        return { parent: item, children: item.children }
      }
    }
  }
  return null
}
