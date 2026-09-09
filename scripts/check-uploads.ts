/**
 * Checks that a sheet is read the way the shop expects.
 *
 *   npx tsx scripts/check-uploads.ts
 *
 * No database. This only exercises the checking, which is the part that decides
 * whether a shop gets loaded correctly.
 */
import { planCustomers, planImeis, planStock, type CatalogItem, type ShopRef } from "../src/lib/upload-plan"

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const ITEMS: CatalogItem[] = [
  { id: "p1", sku: "PIX-9", name: "Pixel 9 Pro", tracking: "IMEI" },
  { id: "p2", sku: "CHG-65", name: "Anker 65W", tracking: "NONE" },
  { id: "p3", sku: "DUP-A", name: "Twin Name", tracking: "IMEI" },
  { id: "p4", sku: "DUP-B", name: "Twin Name", tracking: "IMEI" },
]
const SHOPS: ShopRef[] = [
  { id: "b1", name: "Iwo Road, Ibadan", code: "IWO" },
  { id: "b2", name: "Bodija, Ibadan", code: "BOD" },
]

console.log("\n1. A good phones sheet")
let r = planImeis(
  [
    { imei: "860000000000101", "item code": "PIX-9", shop: "BOD", notes: "container 12" },
    { imei: "860000000000102", "item code": "PIX-9", shop: "Bodija" },
    { imei: "860000000000103", "item code": "PIX-9", shop: "Iwo Road, Ibadan" },
  ],
  ITEMS,
  SHOPS
)
check("three phones planned", r.rows.length === 3, `got ${r.rows.length}`)
check("no problems raised", r.problems.length === 0, r.problems.join(" | "))
check("shop short code understood", r.rows[0].branchId === "b2")
check("shop short name understood", r.rows[1].branchId === "b2")
check("shop full name understood", r.rows[2].branchId === "b1")
check("notes carried through", r.rows[0].notes === "container 12")

console.log("\n2. Column names staff might actually type")
r = planImeis([{ IMEI1: "860000000000201", SKU: "PIX-9", Branch: "IWO" }], ITEMS, SHOPS)
check("IMEI1 / SKU / Branch all understood", r.rows.length === 1, r.problems.join(" | "))
r = planImeis([{ "Phone ": "860000000000202", "Item Code": "PIX-9", "  store": "IWO" }], ITEMS, SHOPS)
check("odd spacing and capitals understood", r.rows.length === 1, r.problems.join(" | "))

console.log("\n3. A sheet that should be refused")
r = planImeis(
  [
    { imei: "860000000000301", "item code": "NOPE", shop: "BOD" },
    { imei: "12345", "item code": "PIX-9", shop: "BOD" },
    { imei: "860000000000303", "item code": "PIX-9", shop: "LAGOS" },
    { imei: "860000000000304", "item code": "PIX-9", shop: "BOD" },
    { imei: "860000000000304", "item code": "PIX-9", shop: "BOD" },
    { imei: "860000000000306", "item code": "CHG-65", shop: "BOD" },
    { imei: "", "item code": "PIX-9", shop: "BOD" },
    { imei: "860000000000308", name: "Twin Name", shop: "BOD" },
  ],
  ITEMS,
  SHOPS
)
check("unknown item caught", r.problems.some((p) => p.includes("not on the item list")))
check("short IMEI caught", r.problems.some((p) => p.includes("too short")))
check("unknown shop caught", r.problems.some((p) => p.includes("not one of our shops")))
check("same IMEI twice caught", r.problems.some((p) => p.includes("twice")))
check("accessory on the phones sheet caught", r.problems.some((p) => p.includes("no IMEI or serial")))
check("missing IMEI caught", r.problems.some((p) => p.includes("put the IMEI")))
check("two items with one name caught", r.problems.some((p) => p.includes("more than one item")))
check("line numbers match the spreadsheet", r.problems[0].startsWith("Line 2"), r.problems[0])

console.log("\n4. Blank rows at the bottom of a sheet are ignored")
r = planImeis(
  [{ imei: "860000000000401", "item code": "PIX-9", shop: "BOD" }, { imei: "", "item code": "", shop: "" }, {}],
  ITEMS,
  SHOPS
)
check("one row planned, no complaints about the blanks", r.rows.length === 1 && r.problems.length === 0, r.problems.join(" | "))

console.log("\n5. Shelf counts")
let s = planStock(
  [
    { "item code": "CHG-65", shop: "BOD", quantity: "40", minimum: "5" },
    { "item code": "CHG-65", shop: "IWO", quantity: "0" },
  ],
  ITEMS,
  SHOPS
)
check("two shelf lines planned", s.rows.length === 2, s.problems.join(" | "))
check("zero is a valid count", s.rows[1].quantity === 0)
check("alert level carried through", s.rows[0].minStock === 5)

s = planStock(
  [
    { "item code": "PIX-9", shop: "BOD", quantity: "5" },
    { "item code": "CHG-65", shop: "BOD", quantity: "-2" },
    { "item code": "CHG-65", shop: "BOD", quantity: "2.5" },
    { "item code": "CHG-65", shop: "BOD", quantity: "plenty" },
  ],
  ITEMS,
  SHOPS
)
check("phone on the shelf sheet caught", s.problems.some((p) => p.includes("counted by IMEI")))
check("negative count caught", s.problems.some((p) => p.includes("whole number")))
check("half a piece caught", s.problems.filter((p) => p.includes("whole number")).length >= 2)
check("words instead of a number caught", s.problems.filter((p) => p.includes("whole number")).length === 3, s.problems.join(" | "))

console.log("\n6. Customers")
let c = planCustomers(
  [
    { name: "Chidi Okeke", phone: "08031234567", shop: "BOD", "credit limit": "250000" },
    { name: "No Phone", phone: "", shop: "BOD" },
    { name: "", phone: "08039999999", shop: "BOD" },
    { name: "Twice", phone: "08031234567", shop: "BOD" },
  ],
  SHOPS
)
check("good customer planned", c.rows.length === 1, `got ${c.rows.length}`)
check("credit limit read", c.rows[0].creditLimit === 250000)
check("missing phone caught", c.problems.some((p) => p.includes("needs a phone")))
check("missing name caught", c.problems.some((p) => p.includes("needs a name")))
check("same phone twice caught", c.problems.some((p) => p.includes("twice")))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
