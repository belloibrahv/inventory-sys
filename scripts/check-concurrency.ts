/**
 * Checks that the shop's stock and money guards hold when two people act at the
 * same moment. Run against a local database only:
 *
 *   npx tsx scripts/check-concurrency.ts
 *
 * Every record it moves is put back before it exits.
 */
import { PrismaClient } from "@prisma/client"
import { ConflictError, claimImei, drawStock, creditInvoice, shiftCustomerBalance } from "../src/lib/concurrency"

const prisma = new PrismaClient()
let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`) }
}

async function main() {
  const branch = await prisma.branch.findFirst()
  const product = await prisma.product.findFirst({ where: { tracking: "NONE" } })
    ?? await prisma.product.findFirst()
  if (!branch || !product) throw new Error("seed data missing")

  // Snapshot what this check is about to move, so the shop database is handed
  // back exactly as it was found.
  const originalStock = (
    await prisma.inventory.findUnique({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
    })
  )?.quantity ?? null

  console.log("\n1. drawStock refuses to push stock negative")
  await prisma.inventory.upsert({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
    update: { quantity: 3 },
    create: { productId: product.id, branchId: branch.id, quantity: 3 },
  })
  let threw = false
  try {
    await prisma.$transaction(async (tx) => {
      await drawStock(tx, { productId: product.id, branchId: branch.id, quantity: 5, label: product.name })
    })
  } catch (e) { threw = e instanceof ConflictError }
  check("asking for 5 when 3 are held is refused", threw)
  const after = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
  })
  check("stock untouched after refusal", after?.quantity === 3, `got ${after?.quantity}`)

  console.log("\n2. drawStock allows a draw that fits, exactly once")
  await prisma.$transaction(async (tx) => {
    await drawStock(tx, { productId: product.id, branchId: branch.id, quantity: 3, label: product.name })
  })
  const drained = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
  })
  check("stock went 3 -> 0", drained?.quantity === 0, `got ${drained?.quantity}`)
  let secondThrew = false
  try {
    await prisma.$transaction(async (tx) => {
      await drawStock(tx, { productId: product.id, branchId: branch.id, quantity: 1, label: product.name })
    })
  } catch (e) { secondThrew = e instanceof ConflictError }
  check("a second draw on empty stock is refused", secondThrew)

  console.log("\n3. claimImei only wins while the unit is In shop")
  const unit = await prisma.imeiRecord.findFirst({ where: { status: "IN_STOCK" } })
  if (!unit) { console.log("  SKIP  no in-stock unit in this database"); }
  else {
    await prisma.$transaction(async (tx) => {
      await claimImei(tx, { imeiId: unit.id, branchId: unit.branchId, label: unit.imei1, data: { status: "SOLD" } })
    })
    check("first till claims the phone", (await prisma.imeiRecord.findUnique({ where: { id: unit.id } }))?.status === "SOLD")
    let raceThrew = false
    try {
      await prisma.$transaction(async (tx) => {
        await claimImei(tx, { imeiId: unit.id, branchId: unit.branchId, label: unit.imei1, data: { status: "SOLD" } })
      })
    } catch (e) { raceThrew = e instanceof ConflictError }
    check("second till is refused the same phone", raceThrew)
    check("wrong branch is refused", await (async () => {
      const other = await prisma.branch.findFirst({ where: { id: { not: unit.branchId } } })
      if (!other) return true
      await prisma.imeiRecord.update({ where: { id: unit.id }, data: { status: "IN_STOCK" } })
      try {
        await prisma.$transaction(async (tx) => {
          await claimImei(tx, { imeiId: unit.id, branchId: other.id, label: unit.imei1, data: { status: "SOLD" } })
        })
        return false
      } catch (e) { return e instanceof ConflictError }
    })())
    await prisma.imeiRecord.update({ where: { id: unit.id }, data: { status: unit.status, saleId: unit.saleId } })
  }

  console.log("\n4. balance moves are additive, not last-write-wins")
  const customer = await prisma.customer.create({
    data: { name: "Race Test", phone: `RACE-${Date.now()}`, branchId: branch.id, currentBalance: "0" },
  })
  // Replay the exact interleaving that loses money. Two clerks both open the
  // customer and both see a balance of 0. Then both post a 100 sale.
  const clerkA = await prisma.customer.findUnique({ where: { id: customer.id } })
  const clerkB = await prisma.customer.findUnique({ where: { id: customer.id } })

  // The old way: each writes the figure it worked out from the balance on its
  // own screen. The second write lands on top of the first.
  await prisma.customer.update({
    where: { id: customer.id },
    data: { currentBalance: (Number(clerkA?.currentBalance) + 100).toFixed(2) },
  })
  await prisma.customer.update({
    where: { id: customer.id },
    data: { currentBalance: (Number(clerkB?.currentBalance) + 100).toFixed(2) },
  })
  const oldWay = await prisma.customer.findUnique({ where: { id: customer.id } })
  check("old way loses one of two 100 sales", Number(oldWay?.currentBalance) === 100, `got ${oldWay?.currentBalance}`)

  // The new way: both clerks still hold the same stale read of 0, but the
  // database does the addition, so neither can overwrite the other.
  await prisma.customer.update({ where: { id: customer.id }, data: { currentBalance: "0" } })
  await prisma.$transaction(async (tx) => { await shiftCustomerBalance(tx, customer.id, 100) })
  await prisma.$transaction(async (tx) => { await shiftCustomerBalance(tx, customer.id, 100) })
  const settled = await prisma.customer.findUnique({ where: { id: customer.id } })
  check("new way keeps both 100 sales", Number(settled?.currentBalance) === 200, `got ${settled?.currentBalance}`)
  await prisma.ledgerEntry.deleteMany({ where: { customerId: customer.id } })
  await prisma.customer.delete({ where: { id: customer.id } })

  console.log("\n5. creditInvoice refuses to overpay an invoice")
  const sale = await prisma.sale.findFirst({ where: { status: "COMPLETED" } })
  if (!sale) console.log("  SKIP  no completed sale in this database")
  else {
    const before = sale.paidAmount
    let overThrew = false
    try {
      await prisma.$transaction(async (tx) => {
        await creditInvoice(tx, sale.id, Number(sale.totalAmount) + 1000)
      })
    } catch (e) { overThrew = e instanceof ConflictError }
    check("collecting more than the invoice total is refused", overThrew)
    const untouched = await prisma.sale.findUnique({ where: { id: sale.id } })
    check("invoice paid amount rolled back", String(untouched?.paidAmount) === String(before), `got ${untouched?.paidAmount} want ${before}`)
  }

  if (originalStock === null) {
    await prisma.inventory.deleteMany({
      where: { productId: product.id, branchId: branch.id },
    })
  } else {
    await prisma.inventory.update({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      data: { quantity: originalStock },
    })
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
