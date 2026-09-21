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
  Gauge,
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
    label: "Start",
    items: [
      { name: "Home", href: "/dashboard", icon: LayoutDashboard },
      { name: "Business today", href: "/owner", icon: Gauge },
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
            hint: "Add phones one by one or many on one supplier bill",
          },
          {
            name: "Many at once (Excel)",
            href: "/uploads/opening-stock",
            icon: FileSpreadsheet,
            hint: "Put a whole shop on the system from one Excel file",
          },
          {
            name: "Old Excel sheets",
            href: "/uploads/sheets",
            icon: ListOrdered,
            hint: "Step-by-step sheets for items, stock, IMEIs, and customers",
          },
        ],
      },
      { name: "Correct & close opening stock", href: "/opening-stock", icon: Lock },
      {
        name: "Phones & items",
        href: "/products",
        icon: Smartphone,
        children: [
          { name: "Price list", href: "/products", icon: Tags, hint: "Names, cost, lowest price, and selling price" },
          { name: "Brands", href: "/products/brands", icon: Factory, hint: "Brand names and kinds of items" },
          { name: "Add one item", href: "/products/new", icon: PlusCircle, hint: "Register one new model" },
          { name: "Add from a sheet", href: "/products/bulk", icon: FileSpreadsheet, hint: "Add many names from Excel" },
          { name: "Warranty days", href: "/products/warranty", icon: ShieldCheck, hint: "Default warranty days on an item" },
        ],
      },
      {
        name: "Phone numbers (IMEI)",
        href: "/imei",
        icon: ScanLine,
        children: [
          { name: "All phone numbers", href: "/imei", icon: ScanLine, hint: "Find any phone by IMEI and see its life" },
          { name: "One phone at a time", href: "/imei/intake", icon: PackagePlus, hint: "Put one phone already in your hand onto the shelf" },
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
      { name: "Balance the till", href: "/finance/close", icon: ClipboardCheck },
      { name: "Goods from supplier", href: "/purchases", icon: Truck },
      { name: "Customers & money owed", href: "/customers", icon: Users },
      { name: "Suppliers", href: "/suppliers", icon: Factory },
    ],
  },
  {
    label: "Daily work",
    items: [
      { name: "Shop to shop (Stock Transfer)", href: "/transfers", icon: ArrowLeftRight },
      { name: "Stock Outsourcing (Neighbour shop fill)", href: "/neighbor-fills", icon: Handshake },
      { name: "Returns", href: "/returns", icon: Undo2 },
      { name: "Swap Deal", href: "/swaps", icon: Repeat2 },
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
      { name: "Shop expenses", href: "/expenses", icon: Receipt },
      { name: "Needs approval", href: "/approvals", icon: BadgeCheck },
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
          { name: "Shop details", href: "/settings", icon: Building2, hint: "Shop name, phone, and address on invoices" },
          { name: "Selling rules", href: "/settings/rules", icon: SlidersHorizontal, hint: "Lowest price, low stock, and warranty days" },
          { name: "Shop backup", href: "/settings/backup", icon: DatabaseBackup, hint: "Download a copy of the shop records" },
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
