import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string | null | undefined, currency = "NGN") {
  const value = typeof amount === "string" ? Number(amount) : amount ?? 0
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

/** Short naira for tight spaces: ₦2.47m, ₦405k, ₦950. The full figure goes in a title. */
export function formatCurrencyShort(amount: number | string | null | undefined) {
  const value = Number(typeof amount === "string" ? Number(amount) : amount ?? 0)
  if (!Number.isFinite(value)) return "₦0"
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  const trim = (n: number) => String(Number(n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)))
  if (abs >= 1e9) return `${sign}₦${trim(abs / 1e9)}bn`
  if (abs >= 1e6) return `${sign}₦${trim(abs / 1e6)}m`
  if (abs >= 1e4) return `${sign}₦${trim(abs / 1e3)}k`
  return `${sign}₦${Math.round(abs).toLocaleString("en-NG")}`
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function money(value: unknown): number {
  if (value == null || value === "") return 0
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function labelize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function generateDocNumber(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}-${rand}`
}
