const COMPANY_TAIL = /\b(ltd|limited|llc|inc|incorporated|co|company)\b/g

/**
 * How we compare a supplier (or neighboring shop) so "Shenzhen Tech",
 * "shenzhen  tech", and "Shenzhen Tech Ltd" are treated as the same name.
 */
export function partyNameKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(COMPANY_TAIL, " ")
    .replace(/[^a-z0-9]+/g, "")
}

export function displayPartyName(raw: string) {
  return raw.trim().replace(/\s+/g, " ")
}

export function partyPhoneKey(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("234") && digits.length >= 12) return digits.slice(-10)
  if (digits.startsWith("0") && digits.length >= 10) return digits.replace(/^0+/, "")
  return digits
}

/** Client-side check against the supplier list already on the screen. */
export function listedSupplierClash(
  rows: Array<{ name: string; phone?: string | null }>,
  name: string,
  phone?: string,
): string | null {
  const nameKey = partyNameKey(name)
  if (!nameKey) return "Type the supplier name."
  const sameName = rows.find((row) => partyNameKey(row.name) === nameKey)
  if (sameName) {
    return `${sameName.name} is already on the books. Pick that name from the list. Do not add it again.`
  }
  const phoneKey = partyPhoneKey(phone || "")
  if (phoneKey) {
    const samePhone = rows.find((row) => partyPhoneKey(row.phone || "") === phoneKey)
    if (samePhone) {
      return `That phone number already belongs to ${samePhone.name}. Use that supplier, or type a different phone.`
    }
  }
  return null
}

/**
 * Fold supplier (or customer) rows that are the same house: same name after
 * tidy-up, or the same phone with 0 / 234 in front.
 */
export function groupByPartyIdentity<T extends { id: string; name: string; phone?: string | null }>(rows: T[]): T[][] {
  const parent = new Map<string, string>()
  function find(id: string) {
    let current = id
    const seen = new Set<string>()
    while (parent.get(current) && parent.get(current) !== current && !seen.has(current)) {
      seen.add(current)
      current = parent.get(current)!
    }
    return current
  }
  function union(a: string, b: string) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const row of rows) parent.set(row.id, row.id)

  const byName = new Map<string, string>()
  const byPhone = new Map<string, string>()
  for (const row of rows) {
    const nameKey = partyNameKey(row.name)
    if (nameKey) {
      const seen = byName.get(nameKey)
      if (seen) union(row.id, seen)
      else byName.set(nameKey, row.id)
    }
    const phoneKey = partyPhoneKey(row.phone || "")
    if (phoneKey) {
      const seen = byPhone.get(phoneKey)
      if (seen) union(row.id, seen)
      else byPhone.set(phoneKey, row.id)
    }
  }

  const buckets = new Map<string, T[]>()
  for (const row of rows) {
    const root = find(row.id)
    const list = buckets.get(root) ?? []
    list.push(row)
    buckets.set(root, list)
  }
  return Array.from(buckets.values())
}
