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
    label: "Start",
    items: [
      { name: "Home", href: "/dashboard", icon: LayoutDashboard },
      { name: "How to use this", href: "/help", icon: BookOpen },
    ],
  },
  {
    label: "Stock",
    items: [
      {
        name: "Upload stock",
        href: "/uploads",
        icon: Upload,
        children: [
          {
            name: "Supplier bill",
            href: "/uploads",
            icon: PackagePlus,
            hint: "One carton today: supplier, items, IMEIs, what you paid",
          },
          {
            name: "Opening stock sheet",
            href: "/uploads/opening-stock",
            icon: FileSpreadsheet,
            hint: "Day-one stock for one shop, from the Excel sheet",
          },
          {
            name: "Old Excel & CSV",
            href: "/uploads/sheets",
            icon: ListOrdered,
            hint: "The four plain sheets: items, shelf counts, phones, customers",
          },
        ],
      },
      {
        name: "Phones & items",
        href: "/products",
        icon: Smartphone,
        children: [
          { name: "Price list", href: "/products", icon: Tags, hint: "Every model, cost, lowest price and sell price" },
          { name: "Add one item", href: "/products/new", icon: PlusCircle, hint: "Put a single new model on the list" },
          { name: "Add from a sheet", href: "/products/bulk", icon: FileSpreadsheet, hint: "Paste or upload many models at once" },
          { name: "Warranty days", href: "/products/warranty", icon: ShieldCheck, hint: "How long each item is covered" },
        ],
      },
      {
        name: "Phone numbers (IMEI)",
        href: "/imei",
        icon: ScanLine,
        children: [
          { name: "All phones", href: "/imei", icon: ScanLine, hint: "Search and follow every phone through its life" },
          { name: "Stock intake", href: "/imei/intake", icon: PackagePlus, hint: "Put a phone already in your hand on the shelf" },
        ],
      },
      { name: "Shop stock", href: "/inventory", icon: Boxes },
      { name: "Goods on the way", href: "/incoming", icon: Package },
    ],
  },
  {
    label: "Sell & buy",
    items: [
      { name: "Sales", href: "/sales", icon: ShoppingCart },
      { name: "Sell now", href: "/pos", icon: Store },
      { name: "Close the day", href: "/finance/close", icon: ClipboardCheck },
      { name: "Goods from supplier", href: "/purchases", icon: Truck },
      { name: "Customers", href: "/customers", icon: Users },
      { name: "Suppliers", href: "/suppliers", icon: Factory },
    ],
  },
  {
    label: "Daily work",
    items: [
      { name: "Shop to shop", href: "/transfers", icon: ArrowLeftRight },
      { name: "Buy from next door", href: "/neighbor-fills", icon: Handshake },
      { name: "Returns", href: "/returns", icon: Undo2 },
      { name: "Swaps", href: "/swaps", icon: Repeat2 },
      { name: "Repairs", href: "/repairs", icon: Wrench },
      { name: "Stock count", href: "/reconciliation", icon: ClipboardCheck },
    ],
  },
  {
    label: "Money",
    items: [
      { name: "Money in & out", href: "/finance", icon: Wallet },
      { name: "Check the books", href: "/audit/books", icon: Scale },
      { name: "Profit", href: "/profits", icon: TrendingUp },
      { name: "Expenses", href: "/expenses", icon: Receipt },
      { name: "Waiting for yes", href: "/approvals", icon: BadgeCheck },
    ],
  },
  {
    label: "Shop & people",
    items: [
      { name: "Shops", href: "/branches", icon: GitBranch },
      { name: "Staff", href: "/staff", icon: UserRoundCog },
      { name: "Who can see what", href: "/staff/access", icon: Shield },
      { name: "Reports", href: "/reports", icon: BarChart3 },
      { name: "Who did what", href: "/audit", icon: ScrollText },
      { name: "Alerts", href: "/notifications", icon: Bell },
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        children: [
          { name: "Shop details", href: "/settings", icon: Building2, hint: "Name, phone and address printed on receipts" },
          { name: "Selling rules", href: "/settings/rules", icon: SlidersHorizontal, hint: "Lowest-price rule, low stock warning, warranty" },
          { name: "Backup", href: "/settings/backup", icon: DatabaseBackup, hint: "Download a copy of everything. Main admin only" },
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
