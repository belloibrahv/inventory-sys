type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted"

const map: Record<string, Tone> = {
  COMPLETED: "success",
  APPROVED: "success",
  RECEIVED: "success",
  INCOMING: "warning",
  COMING: "warning",
  ARRIVED: "success",
  PAID: "success",
  DELIVERED: "success",
  IN_STOCK: "success",
  ACTIVE: "success",
  PENDING: "warning",
  IN_PROGRESS: "warning",
  IN_TRANSIT: "warning",
  WAITING_PARTS: "warning",
  PARTIAL_RECEIVED: "warning",
  ORDERED: "info",
  DIAGNOSING: "info",
  REPAIRING: "info",
  TRANSFERRED: "info",
  CREDIT: "info",
  REJECTED: "danger",
  CANCELLED: "danger",
  REFUNDED: "danger",
  FAULTY: "danger",
  DISPOSED: "danger",
  OVERDUE: "danger",
  SOLD: "muted",
  RETURNED: "warning",
  SWAPPED: "info",
  REPAIRED: "info",
  LOGIN: "info",
  LOGOUT: "muted",
  CREATE: "success",
  UPDATE: "info",
  DELETE: "danger",
  EXPORT: "warning",
  IMPORT: "info",
  DENIED: "danger",
  VIEW: "muted",
  HIGH: "danger",
}

const labels: Record<string, string> = {
  COMPLETED: "Done",
  APPROVED: "Approved",
  RECEIVED: "Received",
  INCOMING: "Coming",
  COMING: "Coming",
  ARRIVED: "In shop",
  PAID: "Paid",
  DELIVERED: "Delivered to customer",
  IN_STOCK: "In shop",
  ACTIVE: "Active",
  PENDING: "Waiting",
  IN_PROGRESS: "Ongoing",
  IN_TRANSIT: "On the way",
  WAITING_PARTS: "Waiting for parts",
  PARTIAL_RECEIVED: "Part received",
  ORDERED: "Ordered",
  DIAGNOSING: "Checking",
  REPAIRING: "Repairing",
  TRANSFERRED: "Sent to another shop",
  CREDIT: "On credit",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  FAULTY: "Faulty",
  DISPOSED: "Written off",
  OVERDUE: "Overdue",
  SOLD: "Sold",
  RETURNED: "Returned",
  SWAPPED: "Swapped",
  REPAIRED: "Repaired",
  BRAND_NEW: "Brand new",
  OPEN_BOX: "Open box",
  UK_USED: "UK used",
  REFURBISHED: "Refurbished",
  SWAP_DEVICE: "Swap phone",
  REPAIR_DEVICE: "Repair phone",
  LOGIN: "Sign in",
  LOGOUT: "Sign out",
  CREATE: "Created",
  UPDATE: "Changed",
  DELETE: "Deleted",
  EXPORT: "Downloaded",
  IMPORT: "Uploaded",
  DENIED: "Blocked",
  VIEW: "Opened",
  APPROVE: "Approved",
  REJECT: "Rejected",
}

export function statusTone(status: string): Tone {
  return map[status] ?? "muted"
}

export function statusLabel(status: string) {
  return labels[status] ?? status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export type BadgeTone = Tone
