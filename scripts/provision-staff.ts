/**
 * Creates the real staff logins for the three Abu Twins shops from a roster
 * file, and prints the first-time passwords to hand out.
 *
 *   npx tsx scripts/provision-staff.ts              reads the roster and reports
 *   npx tsx scripts/provision-staff.ts --apply      writes the logins
 *
 * It reports by default and changes nothing until --apply is passed, so it is
 * safe to run against the live shop database to see what it would do.
 *
 * What it does:
 *   - checks every name, email, role and shop code before writing anything
 *   - gives each new person their own strong first-time password
 *   - forces a password change on first sign in
 *   - never touches the password of someone who already has a login
 *   - can be run again after adding people to the roster
 *
 * The roster lives in prisma/staff-roster.json.
 */
import { randomInt } from "node:crypto"
import { readFileSync } from "node:fs"
import { PrismaClient, UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

type RosterEntry = {
  name: string
  email: string
  role: string
  shop?: string | null
  note?: string
}

/** Roles that run the whole business rather than one shop. */
const HEAD_OFFICE: UserRole[] = ["SUPER_ADMIN", "CEO", "AUDITOR", "ACCOUNTANT"]

/**
 * Letters and digits a tired person can read off a slip of paper and type on a
 * phone without guessing. No O/0, no I/l/1.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function firstTimePassword() {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")
  return `${block()}-${block()}-${block()}`
}

async function main() {
  let roster: RosterEntry[]
  try {
    roster = JSON.parse(readFileSync(new URL("../prisma/staff-roster.json", import.meta.url), "utf8"))
  } catch {
    console.error("Could not read prisma/staff-roster.json. Fill it in first.")
    process.exit(1)
  }
  if (!Array.isArray(roster) || !roster.length) {
    console.error("The roster is empty. Add the staff for each shop, then run this again.")
    process.exit(1)
  }

  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } })
  const byCode = new Map(branches.map((row) => [row.code.toUpperCase(), row]))
  const validRoles = new Set(Object.values(UserRole) as string[])

  // Check the whole roster before writing any of it, so a typo on the last line
  // cannot leave half the shop with logins and half without.
  const problems: string[] = []
  const seen = new Set<string>()
  const planned: Array<{ entry: RosterEntry; email: string; role: UserRole; branchId: string | null; shopLabel: string }> = []

  roster.forEach((entry, index) => {
    const line = `Line ${index + 1}`
    const name = String(entry.name ?? "").trim()
    const email = String(entry.email ?? "").trim().toLowerCase()
    const role = String(entry.role ?? "").trim().toUpperCase()
    const shop = String(entry.shop ?? "").trim().toUpperCase()

    if (!name) problems.push(`${line}: no name.`)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push(`${line}: ${entry.email ?? "(blank)"} is not an email address.`)
    if (seen.has(email)) problems.push(`${line}: ${email} is on the roster twice.`)
    seen.add(email)
    if (!validRoles.has(role)) {
      problems.push(`${line}: ${entry.role ?? "(blank)"} is not a role. Use one of ${[...validRoles].join(", ")}.`)
      return
    }
    const needsShop = !HEAD_OFFICE.includes(role as UserRole)
    if (needsShop && !shop) {
      problems.push(`${line}: ${name} is a ${role} and must be given a shop (${[...byCode.keys()].join(", ")}).`)
      return
    }
    if (shop && !byCode.has(shop)) {
      problems.push(`${line}: ${shop} is not one of our shops (${[...byCode.keys()].join(", ")}).`)
      return
    }
    planned.push({
      entry,
      email,
      role: role as UserRole,
      branchId: needsShop ? byCode.get(shop)!.id : null,
      shopLabel: needsShop ? byCode.get(shop)!.name : "Head office",
    })
  })

  if (problems.length) {
    console.error(`\nThe roster has ${problems.length} problem(s). Nothing was written.\n`)
    problems.forEach((row) => console.error(`  ${row}`))
    process.exit(1)
  }

  const existing = await prisma.user.findMany({
    where: { email: { in: planned.map((row) => row.email) } },
    select: { id: true, email: true, name: true },
  })
  const existingByEmail = new Map(existing.map((row) => [row.email, row]))

  const toCreate = planned.filter((row) => !existingByEmail.has(row.email))
  const toUpdate = planned.filter((row) => existingByEmail.has(row.email))

  console.log(`\nShops: ${branches.map((b) => `${b.code} ${b.name}`).join("  |  ")}`)
  console.log(`\nRoster: ${planned.length} people. ${toCreate.length} new login(s), ${toUpdate.length} already on the system.\n`)

  for (const row of planned) {
    const mark = existingByEmail.has(row.email) ? "update" : "new   "
    console.log(`  ${mark}  ${row.entry.name.padEnd(24)} ${row.role.padEnd(16)} ${row.shopLabel}`)
  }

  if (!APPLY) {
    console.log("\nNothing was written. Run again with --apply to create these logins.")
    await prisma.$disconnect()
    return
  }

  const handout: Array<{ Name: string; Shop: string; Role: string; Email: string; "First password": string }> = []

  for (const row of planned) {
    const found = existingByEmail.get(row.email)
    if (found) {
      // Someone already signed in with this address. Their name, role and shop
      // are brought in line with the roster, but their password is left alone.
      await prisma.user.update({
        where: { id: found.id },
        data: { name: row.entry.name.trim(), role: row.role, branchId: row.branchId, isActive: true },
      })
      continue
    }
    const password = firstTimePassword()
    await prisma.user.create({
      data: {
        email: row.email,
        name: row.entry.name.trim(),
        password: await bcrypt.hash(password, 10),
        role: row.role,
        branchId: row.branchId,
        isActive: true,
        mustChangePassword: true,
      },
    })
    handout.push({
      Name: row.entry.name.trim(),
      Shop: row.shopLabel,
      Role: row.role,
      Email: row.email,
      "First password": password,
    })
  }

  if (handout.length) {
    console.log("\nFirst-time passwords. Hand each person their own line, then keep this off any shared screen.")
    console.log("Each person is asked to set their own password the first time they sign in.\n")
    console.table(handout)
    console.log("These passwords are not stored anywhere and cannot be shown again.")
    console.log("If a slip is lost, remove that person on the Staff screen and run this again.")
  }
  console.log(`\nDone. ${handout.length} login(s) created, ${toUpdate.length} brought in line with the roster.`)
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
