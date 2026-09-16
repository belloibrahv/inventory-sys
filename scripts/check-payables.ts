/**
 * Checks that unpaid supplier uploads and opening stock are told apart,
 * and that owed houses group by the same name.
 *
 *   npx tsx scripts/check-payables.ts
 *
 * No database. This only exercises the payable rules used by Reports,
 * Home, Money in and out, Check the books, and Suppliers.
 */
import {
  groupOwedHouses,
  isOpeningStockPurchase,
  isTrueOpeningStockNotes,
  paymentFromUploadNotes,
} from "../src/lib/purchase-money"

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}  ${detail}`)
  }
}

console.log("\n1. Opening stock is never money owed")
check(
  "OPEN- invoice is opening stock",
  isOpeningStockPurchase({ invoiceNumber: "OPEN-IWO-20260916" })
)
check(
  "OpeningStock record is opening stock",
  isOpeningStockPurchase({ invoiceNumber: "PO-123", openingStock: { id: "os1" } })
)
check(
  "Supplier carton PO is a payable",
  !isOpeningStockPurchase({ invoiceNumber: "PO-123", notes: "Unpaid invoice. Balance: ₦2,000,000." })
)
check(
  "Opening Excel notes stay opening stock",
  isTrueOpeningStockNotes(
    "Loaded from the opening stock Excel sheet. This is the shop's opening stock value. It is not a supplier bill to pay."
  )
)

console.log("\n2. Upload notes restore the real balance")
const unpaid = paymentFromUploadNotes("Uploaded on Stock Upload. Unpaid invoice. Balance: ₦2,000,000.", 2_000_000)
check("unpaid stays 0", unpaid.method === "UNPAID" && unpaid.paid === 0, JSON.stringify(unpaid))

const paid = paymentFromUploadNotes(
  "Uploaded on Stock Upload. This bill was paid in full when the stock was loaded.",
  2_000_000
)
check("paid in full keeps the total", paid.method === "PAID_ON_UPLOAD" && paid.paid === 2_000_000, JSON.stringify(paid))

const partial = paymentFromUploadNotes(
  "Uploaded on Stock Upload. Partial payment of ₦500,000 on upload. Balance: ₦1,500,000.",
  2_000_000
)
check("partial keeps 500,000", partial.method === "PARTIAL_PAYMENT" && partial.paid === 500_000, JSON.stringify(partial))

const iris = paymentFromUploadNotes("Unpaid invoice. Balance: ₦2,000,000.", 2_000_000)
check("IRIS test carton is unpaid", iris.paid === 0 && iris.method === "UNPAID")

console.log("\n3. Still owed groups by house name")
const houses = groupOwedHouses([
  { id: "a", invoice: "PO-1", supplier: "IRIS", shop: "IWO", owed: 1_200_000 },
  { id: "b", invoice: "PO-2", supplier: "iris", shop: "BOD", owed: 800_000 },
  { id: "c", invoice: "PO-3", supplier: "IDAL", shop: "IWO", owed: 50_000 },
])
check("IRIS and iris become one house", houses.length === 2, `got ${houses.length}`)
const irisHouse = houses.find((row) => row.name.toLowerCase() === "iris")
check("IRIS amount is 2,000,000", Boolean(irisHouse && irisHouse.owed === 2_000_000), JSON.stringify(irisHouse))
check("IRIS has two bills inside", Boolean(irisHouse && irisHouse.bills.length === 2))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
