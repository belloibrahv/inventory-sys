/**
 * Cash in the till and named banks when the shops started using the software.
 * This is not opening stock. Opening stock is phones and pieces on the shelf.
 */

export function digitsOfAccount(raw: string) {
  return String(raw || "").replace(/\D/g, "")
}

export function displayBankName(raw: string) {
  return raw.trim().replace(/\s+/g, " ")
}

export function displayAccountNumber(raw: string) {
  return digitsOfAccount(raw)
}

export function listedBankClash(
  rows: Array<{ id?: string; accountNumber: string }>,
  accountNumber: string,
  exceptId?: string,
): string | null {
  const digits = digitsOfAccount(accountNumber)
  if (digits.length < 8) return "Type the full account number."
  const same = rows.find((row) => {
    if (exceptId && row.id === exceptId) return false
    return digitsOfAccount(row.accountNumber) === digits
  })
  if (same) return "That account number is already on the books. Open that bank instead of adding it again."
  return null
}
