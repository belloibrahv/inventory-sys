/**
 * How one unit on the shelf is known: by its IMEI (phones) or by its serial
 * number (tablets, laptops, and phones sold without an IMEI on the box).
 *
 * Every unit keeps its main number in `imei1`, because the till, returns,
 * transfers and swaps all look a unit up there. A serial-only unit carries the
 * same serial in `imei1` and `serialNumber`. That is how uploads, opening stock
 * and goods on the way already store them, so this reads what is there rather
 * than adding a column.
 */
export type UnitIdentityKind = "IMEI" | "SERIAL"

export const UNIT_IDENTITY_OPTIONS: Array<{ value: UnitIdentityKind; label: string }> = [
  { value: "IMEI", label: "IMEI" },
  { value: "SERIAL", label: "Serial number" },
]

export function cleanUnitCode(raw: string) {
  return raw.replace(/[\s-]/g, "").trim()
}

export function isImeiCode(value: string) {
  return /^\d{14,17}$/.test(value)
}

export function unitIdentityKind(row: { imei1: string; serialNumber: string | null }): UnitIdentityKind {
  return row.serialNumber && row.serialNumber === row.imei1 ? "SERIAL" : "IMEI"
}

export function unitIdentityLabel(kind: UnitIdentityKind) {
  return kind === "SERIAL" ? "Serial number" : "IMEI"
}

/** The number a new unit of this item is usually known by. */
export function defaultIdentityFor(tracking: string): UnitIdentityKind {
  return tracking === "SERIAL" ? "SERIAL" : "IMEI"
}

/** Returns an error sentence, or null when the number is fine for that kind. */
export function unitCodeProblem(kind: UnitIdentityKind, code: string) {
  if (!code) return kind === "SERIAL" ? "Type the serial number." : "Type the IMEI."
  if (kind === "IMEI" && !isImeiCode(code)) return `${code} is not an IMEI. An IMEI is 14 to 17 digits.`
  if (kind === "SERIAL" && (code.length < 4 || code.length > 40)) {
    return `${code} is not a serial number. A serial is 4 to 40 letters and digits.`
  }
  return null
}

/** Maps what staff chose onto the three stored columns. */
export function unitIdentityColumns(input: {
  kind: UnitIdentityKind
  imei1: string
  imei2?: string | null
  serialNumber?: string | null
}) {
  if (input.kind === "SERIAL") {
    return { imei1: input.imei1, imei2: null, serialNumber: input.imei1 }
  }
  return {
    imei1: input.imei1,
    imei2: input.imei2 || null,
    serialNumber: input.serialNumber || null,
  }
}

/** Which units still stand on a shelf, on the way, or with the engineer. */
export const LIVE_UNIT_STATUSES = [
  "RECEIVED",
  "INCOMING",
  "IN_STOCK",
  "TRANSFERRED",
  "FAULTY",
  "RETURNED",
  "REPAIRED",
] as const

export const TRACKING_OPTIONS = [
  { value: "IMEI", label: "IMEI (phones)" },
  { value: "SERIAL", label: "Serial number (tablets, laptops, some phones)" },
  { value: "NONE", label: "No number (cords, chargers, pieces)" },
] as const

export function trackingLabel(tracking: string) {
  if (tracking === "SERIAL") return "Serial number"
  if (tracking === "NONE") return "No number"
  return "IMEI"
}
