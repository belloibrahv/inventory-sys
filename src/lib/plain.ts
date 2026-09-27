import { Prisma } from "@prisma/client"

/**
 * Turns every database Decimal inside `value` into a plain number, so rows can
 * go straight to a client component. React only sends plain objects to the
 * browser; a Decimal arrives as a string with a warning in the console.
 * Dates and everything else stay as they are. Browser code reads these with
 * `money()`, which takes numbers and strings alike.
 */
export function plainMoney<T>(value: T): T {
  return convert(value) as T
}

function convert(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber()
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(convert)
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) out[key] = convert(inner)
  return out
}
