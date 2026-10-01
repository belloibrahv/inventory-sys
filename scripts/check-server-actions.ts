/**
 * Regression gate: every exported function in a "use server" file is a public
 * POST endpoint. Each must check who is signed in itself, or hand off to a
 * function that does. This fails the checks if one is added without that.
 *
 *   npx tsx scripts/check-server-actions.ts
 *
 * Found in the October 2026 assessment: applySwapApprovalDecision was exported
 * with no sign-in check and trusted the caller's user id.
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

/** Signs of a sign-in check (or a gate that performs one). */
const SIGNED_IN = /requireUser\(|getCurrentUser\(|getServerSession\(|requireUploader\(|correctionGate\(|viewer\(\)/

/**
 * Exports that do not check sign-in themselves, each with why that is safe.
 * Adding to this list needs the same care as writing the check.
 */
const REVIEWED: Record<string, string> = {
  "finance.ts:approveRequest": "delegates to decideApproval, which checks sign-in, permission and shop",
  "finance.ts:rejectRequest": "delegates to decideApproval, which checks sign-in, permission and shop",
  "finance.ts:getFinanceLedger": "delegates to getFinance, which checks sign-in and permission",
  "price-requests.ts:priceRequestLink": "builds a link string; reads and writes nothing",
}

const files = execSync(`grep -rl '^"use server"' src`, { encoding: "utf8" }).trim().split("\n").filter(Boolean)
const open: string[] = []
let total = 0
for (const file of files) {
  const source = readFileSync(file, "utf8")
  const exports = [...source.matchAll(/^export async function (\w+)\s*\(/gm)]
  exports.forEach((match, index) => {
    total += 1
    const body = source.slice(match.index, index + 1 < exports.length ? exports[index + 1].index : source.length)
    const key = `${file.split("/").pop()}:${match[1]}`
    if (!SIGNED_IN.test(body) && !REVIEWED[key]) open.push(`${file}: ${match[1]}`)
  })
}

console.log(`Server actions checked: ${total}`)
if (open.length) {
  console.error(`\nThese server actions check no sign-in (each is a public endpoint):\n  ${open.join("\n  ")}`)
  console.error("\nAdd requireUser() and a permission check, or, if it truly needs none, list it in REVIEWED with the reason.")
  process.exit(1)
}
console.log("Every server action checks sign-in or is reviewed.")
