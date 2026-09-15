import { titleFor } from "@/components/layout/titles"
import { statusLabel } from "@/lib/status"

const RECORD_KINDS: Record<string, string> = {
  OpeningStock: "Opening Balance Record",
  Purchase: "Purchase Order / Bill",
  PurchasePayment: "Vendor Disbursement",
  IMEIRecord: "Serialized Asset (IMEI)",
  Sale: "Sales Order / Invoice",
  IncomingLot: "Inbound Shipment",
  StockTransfer: "Inter-Branch Transfer",
  NeighborFill: "External Partner Sourcing",
  ParkedSale: "On-Hold Register Order",
  AuditLog: "System Audit Log",
  RolePermission: "RBAC Permission",
  LedgerEntry: "General Ledger Entry",
  DayClose: "Register Daily Close",
  Reconciliation: "Physical Inventory Audit",
  Screen: "Interface Screen",
  Access: "Access Restriction",
  Offline: "Offline Mode",
  Backup: "Database Snapshot",
  User: "User Account",
  Payment: "Payment Transaction",
  Customer: "Customer Profile",
  Product: "Product Master SKU",
  Expense: "Operating Expense",
  Return: "Customer Return (RMA)",
  Swap: "Trade-In & Exchange",
  Repair: "Service & Repair Order",
  Notification: "System Notification",
  Supplier: "Vendor",
  Branch: "Branch Location",
}

const CHANGE_KEYS: Record<string, string> = {
  status: "Status",
  invoice: "Invoice #",
  invoiceNumber: "Invoice #",
  purchase: "Purchase Order #",
  receivedQty: "Received Quantity",
  quantity: "Quantity",
  costPrice: "Unit Cost",
  method: "Payment Method",
  collected: "Amount Collected",
  paid: "Amount Paid",
  paidAmount: "Amount Paid",
  sellPrice: "Selling Price",
  neighborCost: "Sourcing Cost",
  neighborName: "Sourcing Partner",
  neighborFill: "External Sourcing",
  payRef: "Payment Reference",
  goodsUnchanged: "Goods Unchanged",
  itemsUntouched: "Line Items Preserved",
  passwordChanged: "Password Updated",
  result: "Execution Result",
  queuedAt: "Queued Timestamp",
  created: "Created Records",
  skipped: "Skipped Records",
  errors: "Failed Lines",
  file: "File Name",
  visible: "Visibility Flag",
  lines: "Total Lines",
  role: "Assigned Role",
  name: "Designation / Name",
  customer: "Customer",
  due: "Outstanding Balance",
  balance: "Account Balance",
  outcome: "Disposition Outcome",
  faultClass: "Defect Classification",
  cost: "Cost Basis",
  businessDate: "Business Date",
  expectedCash: "Expected Till Cash",
  countedCash: "Cash Remitted",
  cosmeticGrade: "Cosmetic Grade",
  batteryHealth: "Battery Health",
  sku: "SKU / Code",
  sellingPrice: "Unit Price",
  transfer: "Stock Transfer Manifest",
  count: "Item Count",
  updated: "Modified Records",
  names: "Item Names",
  reason: "Justification Reason",
}

const HIDDEN_KEYS = new Set([
  "productId",
  "branchId",
  "customerId",
  "userId",
  "supplierId",
  "fromBranchId",
  "toBranchId",
  "deviceId",
  "offlineId",
  "saleId",
  "imeiId",
  "id",
  "filters",
  "houseId",
])

const RESULT_WORDS: Record<string, string> = {
  ok: "Success",
  denied: "Access Denied",
  vanished: "Uncommitted draft purged from device",
  sitting: "On-hold draft expired",
  unknown: "Unrecognized user identifier",
  bad_password: "Invalid authentication credentials",
  locked: "Account locked",
}

function looksLikeSecretId(value: string) {
  return /^c[a-z0-9]{20,}$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)
}

function looksLikeJson(raw: string) {
  const trimmed = raw.trim()
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))
}

function looksTechnical(message: string) {
  return /prisma|sqlite|postgres|ECONN|P20\d{2}|Unique constraint|Foreign key|Invalid `prisma|json|\/api\/|csrf|NEXTAUTH|stack/i.test(message)
}

export function recordKindLabel(entityType: string) {
  if (!entityType) return "A shop record"
  return RECORD_KINDS[entityType] ?? entityType.replace(/([a-z])([A-Z])/g, "$1 $2")
}

export function pageNameFromPath(path: string | null | undefined) {
  if (!path) return null
  const clean = path.split("?")[0]
  if (clean.startsWith("/api/auth") || clean === "/login") return "Sign in"
  if (clean.startsWith("/api/")) return "Sign in and shop work"
  const title = titleFor(clean)
  if (title === "Abu Twins") return "A shop page"
  return title
}

export function formatRecordChange(raw: string | null | undefined): string {
  if (!raw) return ""
  const text = raw.trim()
  if (!text) return ""
  if (!looksLikeJson(text)) {
    if (looksLikeSecretId(text)) return "A shop record was saved."
    return statusLabel(text)
  }
  try {
    const data = JSON.parse(text) as unknown
    const parts = describeValue(data)
    return parts.length ? parts.join(". ") + "." : "A shop record was saved."
  } catch {
    return "A shop record was saved."
  }
}

function describeValue(value: unknown, key?: string): string[] {
  if (value == null) return []
  if (typeof value === "boolean") {
    const label = key ? CHANGE_KEYS[key] ?? shopKey(key) : "This"
    if (key === "goodsUnchanged") return value ? ["The goods stayed the way they were received"] : []
    if (key === "itemsUntouched") return value ? ["Nothing on the invoice was changed"] : []
    if (key === "passwordChanged") return value ? ["The password was changed"] : []
    if (key === "visible") return [value ? "Shown to the shop" : "Hidden from the shop"]
    return [`${label}: ${value ? "Yes" : "No"}`]
  }
  if (typeof value === "number") {
    const label = key ? CHANGE_KEYS[key] ?? shopKey(key) : "Number"
    if (key === "batteryHealth") return [`${label} ${value}%`]
    return [`${label} ${value}`]
  }
  if (typeof value === "string") {
    if (!value || looksLikeSecretId(value)) return []
    const label = key ? CHANGE_KEYS[key] ?? shopKey(key) : ""
    const pretty =
      key === "result" || key === "reason"
        ? RESULT_WORDS[value] ?? statusLabel(value)
        : statusLabel(value)
    if (key === "queuedAt" || key === "at") return [`${label} ${pretty}`]
    return label ? [`${label} ${pretty}`] : [pretty]
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return []
    if (key === "names" && value.every((item) => typeof item === "string")) {
      return [`Items: ${value.filter((item) => item && !looksLikeSecretId(item)).join(", ")}`]
    }
    if (value.every((item) => typeof item === "string" && item.length >= 8 && !looksLikeSecretId(item))) {
      const label = key === "imeis" ? "IMEIs" : key ? CHANGE_KEYS[key] ?? shopKey(key) : "List"
      return [`${label}: ${value.join(", ")}`]
    }
    if (key === "imeis") return [`${value.length} IMEI${value.length === 1 ? "" : "s"}`]
    if (key === "items") return [`${value.length} item line${value.length === 1 ? "" : "s"}`]
    return [`${value.length} item${value.length === 1 ? "" : "s"}`]
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([childKey, child]) => {
      if (HIDDEN_KEYS.has(childKey)) return []
      return describeValue(child, childKey)
    })
  }
  return []
}

function shopKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

export function shopError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  if (!message || looksTechnical(message) || message.length > 180) return fallback
  return message
}
