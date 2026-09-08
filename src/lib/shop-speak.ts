import { titleFor } from "@/components/layout/titles"
import { statusLabel } from "@/lib/status"

const RECORD_KINDS: Record<string, string> = {
  Purchase: "Supplier bill",
  PurchasePayment: "Supplier payment",
  IMEIRecord: "Phone IMEI",
  Sale: "Invoice",
  IncomingLot: "Goods on the way",
  StockTransfer: "Shop to shop",
  NeighborFill: "Neighbor shop fill",
  ParkedSale: "Parked sale",
  AuditLog: "Who did what",
  RolePermission: "Who can see what",
  LedgerEntry: "Money movement",
  DayClose: "Close the day",
  Reconciliation: "Stock count",
  Screen: "Screen",
  Access: "Blocked page",
  Offline: "Line down",
  Backup: "Shop backup",
  User: "Staff",
  Payment: "Payment",
  Customer: "Customer",
  Product: "Phone or item",
  Expense: "Expense",
  Return: "Return",
  Swap: "Swap",
  Repair: "Repair",
  Notification: "Alert",
  Supplier: "Supplier",
  Branch: "Shop",
}

const CHANGE_KEYS: Record<string, string> = {
  status: "Status",
  invoice: "Invoice",
  invoiceNumber: "Invoice",
  purchase: "Supplier bill",
  receivedQty: "Arrived",
  quantity: "Quantity",
  costPrice: "Cost",
  method: "Paid by",
  collected: "Collected",
  paid: "Paid",
  paidAmount: "Paid",
  sellPrice: "Sell price",
  neighborCost: "Neighbor cost",
  neighborName: "Neighboring shop",
  neighborFill: "Neighbor fill",
  payRef: "Payment number",
  goodsUnchanged: "Goods",
  itemsUntouched: "Invoice items",
  passwordChanged: "Password",
  result: "Result",
  queuedAt: "Parked at",
  created: "Added",
  skipped: "Skipped",
  errors: "Lines that failed",
  file: "File",
  visible: "Shown to the shop",
  lines: "Lines",
  role: "Job",
  name: "Name",
  customer: "Customer",
  due: "Still owed",
  balance: "Balance",
  outcome: "Outcome",
  faultClass: "Fault",
  cost: "Cost",
  businessDate: "Shop day",
  expectedCash: "Expected cash",
  countedCash: "Counted cash",
  cosmeticGrade: "Grade",
  batteryHealth: "Battery",
  sku: "Item code",
  sellingPrice: "Sell price",
  transfer: "Shop to shop send",
  count: "How many",
  updated: "Items updated",
  names: "Items",
  reason: "Reason",
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
  ok: "Worked",
  denied: "Blocked",
  vanished: "The parked sale left this device",
  sitting: "The parked sale sat too long",
  unknown: "Login not recognised",
  bad_password: "Wrong password",
  locked: "Login is locked",
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
  if (!entityType) return "Shop record"
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
    if (key === "goodsUnchanged") return value ? ["Goods stayed as received"] : []
    if (key === "itemsUntouched") return value ? ["Items on the invoice were not changed"] : []
    if (key === "passwordChanged") return value ? ["Password was changed"] : []
    if (key === "visible") return [value ? "Shown to the shop floor" : "Hidden from the shop floor"]
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
