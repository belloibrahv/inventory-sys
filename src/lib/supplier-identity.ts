import { prisma } from "@/lib/prisma"
import { displayPartyName, partyNameKey, partyPhoneKey } from "@/lib/party-key"

export async function findDuplicateSupplier(input: {
  name: string
  phone?: string
  ignoreId?: string
}): Promise<{ error: string } | null> {
  const name = displayPartyName(input.name)
  const nameKey = partyNameKey(name)
  if (!nameKey) return { error: "Type the supplier name." }

  const rows = await prisma.supplier.findMany({
    where: input.ignoreId ? { id: { not: input.ignoreId } } : undefined,
    select: { id: true, name: true, phone: true, isActive: true },
  })

  const sameName = rows.find((row) => partyNameKey(row.name) === nameKey)
  if (sameName) {
    return {
      error: sameName.isActive
        ? `${sameName.name} is already on the books. Pick that name from the list. Do not add it again.`
        : `${sameName.name} is already on the books but locked. Ask the main admin to open it again. Do not add it a second time.`,
    }
  }

  const phoneKey = partyPhoneKey(input.phone || "")
  if (phoneKey) {
    const samePhone = rows.find((row) => partyPhoneKey(row.phone) === phoneKey)
    if (samePhone) {
      return {
        error: `That phone number already belongs to ${samePhone.name}. Use that supplier, or type a different phone.`,
      }
    }
  }

  return null
}
