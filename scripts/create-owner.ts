/**
 * Create or reset one real login, so a shop can be handed over without the demo
 * accounts existing at all.
 *
 * The password is typed by the person running this, never stored in the repo and
 * never guessed here. The account is created with mustChangePassword, so the
 * owner sets their own on first sign-in and the one typed below stops working.
 *
 *   npx tsx scripts/create-owner.ts --email owner@abutwins.com --name "Abu Twins" \
 *     --role SUPER_ADMIN --password 'the-one-you-hand-over'
 *
 * Roles: SUPER_ADMIN, CEO, AUDITOR, ACCOUNTANT, BRANCH_MANAGER, VAULT_MANAGER,
 * STOCK_UPLOADER, CASHIER, SALES_EXECUTIVE, ENGINEER.
 * Add --branch IWO (or BOD / CHL) to tie the login to one shop.
 */
import { PrismaClient, type UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const email = (arg("email") || "").toLowerCase().trim()
  const name = arg("name") || ""
  const role = (arg("role") || "SUPER_ADMIN") as UserRole
  const password = arg("password") || ""
  const branchCode = arg("branch")

  if (!email || !name || !password) {
    throw new Error("Need --email, --name and --password. See the comment at the top of this file.")
  }
  if (password.length < 10) {
    throw new Error("Use at least 10 characters. This is a real shop login, not a demo one.")
  }

  let branchId: string | null = null
  if (branchCode) {
    const branch = await prisma.branch.findUnique({ where: { code: branchCode.toUpperCase() } })
    if (!branch) throw new Error(`No shop with code ${branchCode}. Known codes are IWO, BOD and CHL.`)
    branchId = branch.id
  }

  const hashed = await bcrypt.hash(password, 10)
  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, role, branchId, password: hashed, isActive: true, mustChangePassword: true },
    })
    console.log(`Reset ${email} as ${role}. They must set a new password on first sign-in.`)
  } else {
    await prisma.user.create({
      data: { email, name, role, branchId, password: hashed, mustChangePassword: true },
    })
    console.log(`Created ${email} as ${role}. They must set a new password on first sign-in.`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
