import { prisma } from "@/lib/prisma"
import { dueAfterReturns, returnedValueBySale } from "@/lib/returned-value"
import { money } from "@/lib/utils"

/**
 * What customers owe, per customer.
 *
 * All shops: each customer's balance, the figure their statement ends on.
 * One shop: what is unpaid on THAT shop's invoices, less refunds and credit
 * notes finished on them, and never more than the customer owes in all.
 * Going by the shop a customer was registered at missed buyers from
 * elsewhere who owe here, and counting a buyer's whole balance put other
 * shops' debts on this one. Home, Reports and Check the books all use this,
 * so their "customers owe" figures agree for every shop.
 */
export async function customersOwing(branchId?: string | null) {
  if (!branchId) {
    const rows = await prisma.customer.findMany({
      where: { currentBalance: { gt: 0 } },
      include: { branch: true },
      orderBy: { currentBalance: "desc" },
    })
    return rows.map((row) => ({ ...row, owed: money(row.currentBalance) }))
  }
  const open = (
    await prisma.sale.findMany({
      where: { branchId, status: "COMPLETED", customerId: { not: null } },
      select: { id: true, customerId: true, totalAmount: true, paidAmount: true },
    })
  ).filter((row) => money(row.totalAmount) > money(row.paidAmount))
  const returned = await returnedValueBySale(prisma, open.map((row) => row.id))
  const dueByCustomer = new Map<string, number>()
  for (const row of open) {
    const due = dueAfterReturns(row, returned.get(row.id) ?? 0)
    if (due > 0) dueByCustomer.set(row.customerId!, (dueByCustomer.get(row.customerId!) ?? 0) + due)
  }
  const people = await prisma.customer.findMany({ where: { id: { in: [...dueByCustomer.keys()] } }, include: { branch: true } })
  return people
    .map((person) => ({ ...person, owed: Math.min(dueByCustomer.get(person.id) ?? 0, money(person.currentBalance)) }))
    .filter((person) => person.owed > 0)
    .sort((a, b) => b.owed - a.owed)
}
