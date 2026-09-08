/**
 * Checks that one shop cannot read another shop's records.
 *
 *   npx tsx scripts/check-branch-isolation.ts
 *
 * Nothing is changed. This only reports.
 */
import { PrismaClient } from "@prisma/client"
import { canReachBranch, branchFilter } from "../src/lib/branch-scope"

const prisma = new PrismaClient()
let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`) }
}

async function main() {
  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } })
  if (branches.length < 2) {
    console.log("Needs at least two active shops to test against.")
    await prisma.$disconnect()
    return
  }
  const [shopA, shopB] = branches
  console.log(`\nShop A: ${shopA.name}   Shop B: ${shopB.name}\n`)

  const cashierAtA = { role: "CASHIER" as const, branchId: shopA.id }
  const managerAtA = { role: "BRANCH_MANAGER" as const, branchId: shopA.id }
  const superAdmin = { role: "SUPER_ADMIN" as const, branchId: null }
  const ceo = { role: "CEO" as const, branchId: null }

  console.log("A shop role stays inside its own shop")
  check("cashier reaches own shop", await canReachBranch(cashierAtA, shopA.id))
  check("cashier is refused the other shop", !(await canReachBranch(cashierAtA, shopB.id)))
  check("manager reaches own shop", await canReachBranch(managerAtA, shopA.id))
  check("manager is refused the other shop", !(await canReachBranch(managerAtA, shopB.id)))

  console.log("\nHead office reaches every shop")
  check("super admin reaches shop A", await canReachBranch(superAdmin, shopA.id))
  check("super admin reaches shop B", await canReachBranch(superAdmin, shopB.id))
  check("CEO reaches shop B", await canReachBranch(ceo, shopB.id))

  console.log("\nThe shop selector cannot be used to widen what staff see")
  check("cashier asking for shop B still gets shop A", (await branchFilter(cashierAtA, shopB.id)) === shopA.id,
    `got ${await branchFilter(cashierAtA, shopB.id)}`)
  check("super admin asking for shop B gets shop B", (await branchFilter(superAdmin, shopB.id)) === shopB.id)
  check("super admin asking for nothing gets every shop", (await branchFilter(superAdmin)) === undefined)
  check("cashier asking for nothing gets own shop", (await branchFilter(cashierAtA)) === shopA.id)

  console.log("\nRecords with no shop on them stay reachable")
  check("a record with no shop is reachable by a cashier", await canReachBranch(cashierAtA, null))

  console.log(`\n${pass} passed, ${fail} failed`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
