/**
 * Checks that the Abu Twins opening stock workbook is read the way the shop fills it.
 *
 *   npx tsx scripts/check-opening-stock.ts
 */
import { readFileSync } from "node:fs"
import XLSX from "xlsx"
import { classifyOpeningIdentity, planOpeningStock } from "../src/lib/opening-stock"

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass += 1
    console.log(`  PASS  ${name}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}  ${detail}`)
  }
}

console.log("\n1. Identity rules")
check("phone IMEI", classifyOpeningIdentity("PHONES", "123456789098765").kind === "imei")
check("phone rejects piece count", classifyOpeningIdentity("PHONES", "20").kind === "bad")
check("accessory piece count", classifyOpeningIdentity("ACCESSORIES", "20").kind === "qty")
check("laptop serial", classifyOpeningIdentity("LAPTOPS", "WW1222345667").kind === "serial")
check("screen piece count", classifyOpeningIdentity("SCREEN", "12").kind === "qty")

console.log("\n2. Client sample workbook")
const path = "/Users/kudirat/Downloads/ABU-TWINS OPENING STOCK TEMPLATE( BRANCH).xlsx"
const workbook = XLSX.read(readFileSync(path), { type: "buffer" })
const sheets = workbook.SheetNames.map((sheetName) => {
  const sheet = workbook.Sheets[sheetName]
  const grid = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as string[][]).map(
    (line) => line.map((cell) => String(cell ?? "").trim())
  )
  return { sheet: sheetName, grid }
})
const plan = planOpeningStock(sheets)
console.log("  products", plan.products.length, "units", plan.units.length, "qty lines", plan.quantities.length)
if (plan.problems.length) console.log("  problems:", plan.problems)
check("no problems on the sample", plan.problems.length === 0, plan.problems.join(" | "))
check("sample has products", plan.products.length >= 8, `got ${plan.products.length}`)
check("sample has phone/laptop units", plan.units.length >= 5, `got ${plan.units.length}`)
check("sample has piece lines", plan.quantities.length >= 4, `got ${plan.quantities.length}`)
check(
  "TYPE-C cords counted as pieces",
  plan.quantities.some((row) => row.quantity === 20),
  JSON.stringify(plan.quantities)
)
check(
  "iPhone IMEI booked",
  plan.units.some((row) => row.identity.kind === "imei" && row.identity.value === "123456789098765")
)
check(
  "MacBook serial booked",
  plan.units.some((row) => row.identity.kind === "serial" && row.identity.value === "WW1222345667")
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
