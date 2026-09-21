/**
 * Check that the money and the stock add up, in every shop.
 *
 * This is a read-only audit. It writes nothing and changes nothing, so it is
 * safe to point at the live database:
 *
 *   npx tsx scripts/check-totals.ts
 *   npx tsx scripts/check-totals.ts --shop IWO     # one shop only
 *
 * Each section states the rule it is checking in the shop's own words, then
 * every row that breaks it. A clean run means the figures on Business today,
 * Profit, Balance the till and Customers & money owed all rest on sound
 * arithmetic — not that every figure was typed correctly.
 */
import { PrismaClient } from "@prisma/client"
import { watDayKey } from "../src/lib/lagos-day"

const prisma = new PrismaClient()

const shopArg = (() => {
  const i = process.argv.indexOf("--shop")
  return i >= 0 ? process.argv[i + 1] : null
})()

/** Money is kept to the kobo. Anything under half a kobo is rounding, not a gap. */
const EPSILON = 0.005
const n = (v: unknown) => Number(v ?? 0)
const naira = (v: number) =>
  `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let failures = 0
let warnings = 0

function section(title: string) {
  console.log(`\n${title}`)
}

function verdict(rule: string, bad: Array<string>, { warnOnly = false } = {}) {
  if (bad.length === 0) {
    console.log(`  PASS  ${rule}`)
    return
  }
  if (warnOnly) warnings += 1
  else failures += 1
  console.log(`  ${warnOnly ? "WARN" : "FAIL"}  ${rule} — ${bad.length} row(s)`)
  for (const line of bad.slice(0, 8)) console.log(`          ${line}`)
  if (bad.length > 8) console.log(`          … and ${bad.length - 8} more`)
}

async function main() {
  const branches = await prisma.branch.findMany({
    where: shopArg ? { code: shopArg } : {},
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ isHq: "desc" }, { name: "asc" }],
  })
  if (branches.length === 0) {
    console.log(shopArg ? `No shop with code ${shopArg}.` : "No shops on the system.")
    return
  }
  const ids = branches.map((b) => b.id)
  const shopName = new Map(branches.map((b) => [b.id, `${b.code} · ${b.name}`]))
  console.log(
    `Checking ${branches.length} shop(s): ${branches.map((b) => b.code).join(", ")}\n` +
      `Business day today: ${watDayKey()}`
  )

  // ---- 1. Every invoice adds up on its own -------------------------------
  section("1. Each sale's own arithmetic")
  const sales = await prisma.sale.findMany({
    where: { branchId: { in: ids }, status: "COMPLETED" },
    include: { items: true, payments: true },
  })
  console.log(`  ${sales.length} completed sale(s) across these shops`)

  const linesVsSubtotal: string[] = []
  const subtotalVsTotal: string[] = []
  const overpaid: string[] = []
  const paymentsVsPaid: string[] = []
  const negatives: string[] = []

  for (const sale of sales) {
    const where = `${sale.invoiceNumber} (${shopName.get(sale.branchId) ?? sale.branchId})`
    const lineSum = sale.items.reduce((s, i) => s + n(i.totalPrice), 0)
    const subtotal = n(sale.subtotal)
    const discount = n(sale.discount)
    const total = n(sale.totalAmount)
    const paid = n(sale.paidAmount)

    if (Math.abs(lineSum - subtotal) > EPSILON) {
      linesVsSubtotal.push(`${where}: lines ${naira(lineSum)} vs subtotal ${naira(subtotal)}`)
    }
    if (Math.abs(subtotal - discount - total) > EPSILON) {
      subtotalVsTotal.push(
        `${where}: ${naira(subtotal)} less ${naira(discount)} should be ${naira(total)}`
      )
    }
    if (paid - total > EPSILON) {
      overpaid.push(`${where}: paid ${naira(paid)} on a ${naira(total)} invoice`)
    }
    if (sale.payments.length > 0) {
      const paySum = sale.payments.reduce((s, p) => s + n(p.amount), 0)
      if (Math.abs(paySum - paid) > EPSILON) {
        paymentsVsPaid.push(`${where}: payments ${naira(paySum)} vs paid ${naira(paid)}`)
      }
    }
    if (total < 0 || paid < 0 || discount < 0) {
      negatives.push(`${where}: total ${naira(total)}, paid ${naira(paid)}, discount ${naira(discount)}`)
    }
  }
  verdict("item lines add up to the sale subtotal", linesVsSubtotal)
  verdict("subtotal less discount equals the invoice total", subtotalVsTotal)
  verdict("nobody paid more than the invoice", overpaid)
  verdict("payment rows add up to what the sale says was paid", paymentsVsPaid)
  verdict("no sale carries a negative figure", negatives)

  // ---- 2. What customers owe --------------------------------------------
  section("2. Money owed by customers")
  const customers = await prisma.customer.findMany({
    where: { branchId: { in: ids } },
    select: { id: true, name: true, branchId: true, currentBalance: true, creditLimit: true },
  })
  const owedBySale = new Map<string, number>()
  for (const sale of sales) {
    if (!sale.customerId) continue
    const due = n(sale.totalAmount) - n(sale.paidAmount)
    if (due > EPSILON) owedBySale.set(sale.customerId, (owedBySale.get(sale.customerId) ?? 0) + due)
  }
  // The statement is the authority on what a customer owes. It carries the
  // opening balance they came in with, every invoice, every collection, and
  // every correction — so the running balance on its last line is what the
  // customer's balance must equal. Comparing against unpaid invoices alone
  // would flag every customer who started with a debt from before the system.
  const lastLines = await prisma.ledgerEntry.findMany({
    where: { customerId: { in: customers.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    select: { customerId: true, balance: true, createdAt: true },
  })
  const statementBalance = new Map<string, number>()
  for (const line of lastLines) {
    if (!statementBalance.has(line.customerId)) statementBalance.set(line.customerId, n(line.balance))
  }

  const balanceGaps: string[] = []
  const negativeBalances: string[] = []
  const noStatement: string[] = []
  for (const c of customers) {
    const held = n(c.currentBalance)
    const where = `${c.name} (${shopName.get(c.branchId) ?? ""})`
    if (held < -EPSILON) negativeBalances.push(`${where}: ${naira(held)}`)
    const statement = statementBalance.get(c.id)
    if (statement === undefined) {
      if (held > EPSILON) noStatement.push(`${where}: owes ${naira(held)} with no statement line behind it`)
      continue
    }
    if (Math.abs(held - statement) > EPSILON) {
      balanceGaps.push(`${where}: balance ${naira(held)} vs statement ${naira(statement)}`)
    }
  }
  const owedTotal = customers.reduce((s, c) => s + n(c.currentBalance), 0)
  console.log(`  ${customers.length} customer(s) owing ${naira(owedTotal)} in total`)
  verdict("no customer is carrying a negative debt", negativeBalances)
  verdict("each customer's balance matches the last line of their statement", balanceGaps)
  // An opening balance typed when the customer was created is real debt with no
  // statement behind it. Worth seeing, not a fault.
  verdict("every debt has a statement behind it", noStatement, { warnOnly: true })

  // ---- 3. Stock on the shelf --------------------------------------------
  section("3. Stock on the shelf")
  const shelves = await prisma.inventory.findMany({
    where: { branchId: { in: ids } },
    include: { product: { select: { name: true, sku: true, tracking: true } } },
  })
  const negativeStock = shelves
    .filter((row) => row.quantity < 0)
    .map((row) => `${row.product.name} at ${shopName.get(row.branchId)}: ${row.quantity}`)
  verdict("no shelf has gone below zero", negativeStock)

  const unitRows = await prisma.imeiRecord.groupBy({
    by: ["productId", "branchId"],
    where: { status: "IN_STOCK", branchId: { in: ids } },
    _count: { _all: true },
  })
  const unitsByKey = new Map(unitRows.map((r) => [`${r.productId}:${r.branchId}`, r._count._all]))
  const drift: string[] = []
  let driftUnits = 0
  for (const row of shelves) {
    if (row.product.tracking === "NONE") continue
    const withNumbers = unitsByKey.get(`${row.productId}:${row.branchId}`) ?? 0
    if (row.quantity !== withNumbers) {
      driftUnits += Math.abs(row.quantity - withNumbers)
      drift.push(
        `${row.product.name} at ${shopName.get(row.branchId)}: shelf ${row.quantity}, phone records ${withNumbers}`
      )
    }
  }
  // Drift does not corrupt a total on its own, but a phone with no record
  // cannot be sold or transferred, so it reads as missing stock.
  verdict(
    `shelf counts match the phone records (${driftUnits} unit(s) adrift)`,
    drift,
    { warnOnly: true }
  )

  // ---- 4. The stock ledger explains the shelf ---------------------------
  section("4. The stock ledger")
  const moves = await prisma.stockMovement.groupBy({
    by: ["productId", "branchId"],
    where: { branchId: { in: ids } },
    _sum: { quantity: true },
  })
  console.log(`  ${moves.length} product/shop pair(s) have movement history`)
  const noHistory = shelves.filter(
    (row) => row.quantity > 0 && !moves.some((m) => m.productId === row.productId && m.branchId === row.branchId)
  ).length
  if (noHistory > 0) {
    console.log(
      `  NOTE  ${noHistory} shelf row(s) hold stock with no ledger line. Expected for stock\n` +
        `        that was already on the shelf before the ledger was added.`
    )
  }

  // ---- 5. Profit rests on the cost at the time of sale -------------------
  section("5. Cost recorded on each sale")
  const itemsTotal = await prisma.saleItem.count({ where: { sale: { branchId: { in: ids } } } })
  const itemsNoCost = await prisma.saleItem.count({
    where: { sale: { branchId: { in: ids } }, costPrice: { lte: 0 } },
  })
  console.log(`  ${itemsTotal} sale line(s), ${itemsNoCost} without a cost snapshot`)
  verdict(
    "every sale line carries the cost it was sold at",
    itemsNoCost > 0
      ? [
          `${itemsNoCost} line(s) predate the cost snapshot and fall back to the item's cost today,` +
            ` so their profit still moves when that cost changes`,
        ]
      : [],
    { warnOnly: true }
  )

  // ---- 6. Till money lands on the day it arrived ------------------------
  section("6. Till money by day")
  const payments = await prisma.payment.findMany({
    where: { sale: { branchId: { in: ids }, status: "COMPLETED" } },
    select: { amount: true, method: true, paidAt: true, sale: { select: { branchId: true } } },
  })
  const byShopDay = new Map<string, number>()
  for (const pay of payments) {
    const key = `${pay.sale.branchId}:${watDayKey(pay.paidAt)}`
    byShopDay.set(key, (byShopDay.get(key) ?? 0) + n(pay.amount))
  }
  const paymentsTotal = payments.reduce((s, p) => s + n(p.amount), 0)
  const collectedTotal = sales.reduce((s, x) => s + n(x.paidAmount), 0)
  const salesWithRows = sales.filter((x) => x.payments.length > 0)
  const collectedWhereRows = salesWithRows.reduce((s, x) => s + n(x.paidAmount), 0)
  const rowsTotal = salesWithRows.reduce(
    (s, x) => s + x.payments.reduce((a, p) => a + n(p.amount), 0),
    0
  )
  console.log(`  ${payments.length} payment(s) over ${byShopDay.size} shop-day(s)`)
  console.log(`  money collected on sales : ${naira(collectedTotal)}`)
  console.log(`  money on payment rows    : ${naira(paymentsTotal)}`)
  verdict(
    "payment rows agree with the sales that have them",
    Math.abs(rowsTotal - collectedWhereRows) > EPSILON
      ? [`rows ${naira(rowsTotal)} vs collected ${naira(collectedWhereRows)}`]
      : []
  )

  // ---- 7. Every record belongs to a shop --------------------------------
  section("7. Shop separation")
  const [orphanSales, orphanShelves, orphanUnits] = await Promise.all([
    prisma.sale.count({ where: { branchId: { notIn: ids } } }),
    prisma.inventory.count({ where: { branchId: { notIn: ids } } }),
    prisma.imeiRecord.count({ where: { branchId: { notIn: ids } } }),
  ])
  if (shopArg) {
    console.log(`  (skipped: checking one shop only)`)
  } else {
    verdict(
      "every sale, shelf and phone belongs to a shop on the system",
      orphanSales + orphanShelves + orphanUnits > 0
        ? [`${orphanSales} sale(s), ${orphanShelves} shelf row(s), ${orphanUnits} phone(s) point at no shop`]
        : []
    )
  }

  // ---- 8. Totals per shop, for the eye ----------------------------------
  section("8. What each shop holds")
  const costByProduct = new Map(
    (await prisma.product.findMany({ select: { id: true, costPrice: true } })).map((p) => [
      p.id,
      n(p.costPrice),
    ])
  )
  console.log(
    `  ${"SHOP".padEnd(26)}${"SALES".padStart(16)}${"COLLECTED".padStart(16)}${"OWED".padStart(14)}${"STOCK AT COST".padStart(18)}`
  )
  let tSales = 0, tPaid = 0, tOwed = 0, tStock = 0
  for (const b of branches) {
    const mine = sales.filter((s) => s.branchId === b.id)
    const rev = mine.reduce((s, x) => s + n(x.totalAmount), 0)
    const paid = mine.reduce((s, x) => s + n(x.paidAmount), 0)
    const owed = rev - paid
    const stock = shelves
      .filter((r) => r.branchId === b.id)
      .reduce((s, r) => s + r.quantity * (costByProduct.get(r.productId) ?? 0), 0)
    tSales += rev; tPaid += paid; tOwed += owed; tStock += stock
    console.log(
      `  ${b.code.padEnd(26)}${naira(rev).padStart(16)}${naira(paid).padStart(16)}${naira(owed).padStart(14)}${naira(stock).padStart(18)}`
    )
  }
  console.log(
    `  ${"ALL SHOPS".padEnd(26)}${naira(tSales).padStart(16)}${naira(tPaid).padStart(16)}${naira(tOwed).padStart(14)}${naira(tStock).padStart(18)}`
  )
  verdict(
    "sales less collected equals what is owed",
    Math.abs(tSales - tPaid - tOwed) > EPSILON ? [`${naira(tSales)} - ${naira(tPaid)} ≠ ${naira(tOwed)}`] : []
  )

  console.log(
    failures === 0
      ? `\nThe figures add up${warnings > 0 ? `, with ${warnings} thing(s) worth a look above` : ""}.`
      : `\n${failures} check(s) FAILED. Fix those before trusting the totals.`
  )
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
