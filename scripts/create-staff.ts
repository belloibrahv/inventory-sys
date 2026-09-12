/**
 * Create the real Abu Twins logins, one per role per shop.
 *
 * Every password is generated here at random, never written into the repo, and
 * every account is created with mustChangePassword, so the generated one only
 * survives until the person first signs in. The list is printed once, for the
 * owner to hand out; it cannot be recovered afterwards.
 *
 *   npx tsx scripts/create-staff.ts            # show the roster, create nothing
 *   npx tsx scripts/create-staff.ts --apply
 */
import { randomBytes } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import * as bcrypt from "bcryptjs"
import { SEATS } from "./staff-roster"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
/**
 * Re-issue a password for a seat that already exists.
 *
 * Off by default, and that default matters: this script is a seed, so it gets
 * re-run. Silently minting a new password for everyone on each run would lock
 * out every person who had already set their own.
 */
const RESET = process.argv.includes("--reset")

/** Readable but unguessable: 18 characters of base64url from the system CSPRNG. */
function newPassword() {
  return randomBytes(14).toString("base64url")
}

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, code: true } })
  const branchId = new Map(branches.map((b) => [b.code, b.id]))

  for (const seat of SEATS) {
    if (seat.branchCode && !branchId.has(seat.branchCode)) {
      throw new Error(`No shop with code ${seat.branchCode}. Known: ${[...branchId.keys()].join(", ")}`)
    }
  }

  if (!APPLY) {
    console.log("DRY RUN - nothing created. Seats that would be made:\n")
    for (const seat of SEATS) {
      console.log(`  ${seat.role.padEnd(16)} ${(seat.branchCode ?? "ALL").padEnd(4)} ${seat.email}  (${seat.name})`)
    }
    console.log(
      `\n${SEATS.length} seats. Re-run with --apply to create the missing ones.` +
        " Existing seats keep their password unless you add --reset."
    )
    return
  }

  const handout: string[][] = [["Name", "Email", "Role", "Shop", "First password"]]
  let created = 0
  let updated = 0
  let untouched = 0

  for (const seat of SEATS) {
    const email = seat.email.toLowerCase()
    const branch = seat.branchCode ? branchId.get(seat.branchCode)! : null
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing && !RESET) {
      // Keep the seat's name, role and shop in step with the roster, but never
      // touch a password that is already in somebody's hands.
      if (existing.name !== seat.name || existing.role !== seat.role || existing.branchId !== branch) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { name: seat.name, role: seat.role, branchId: branch, isActive: true },
        })
        updated += 1
        handout.push([seat.name, email, seat.role, seat.branchCode ?? "All shops", "unchanged (role updated)"])
      } else {
        untouched += 1
        handout.push([seat.name, email, seat.role, seat.branchCode ?? "All shops", "unchanged (already set up)"])
      }
      continue
    }

    const password = newPassword()
    const data = {
      name: seat.name,
      role: seat.role,
      branchId: branch,
      password: await bcrypt.hash(password, 10),
      isActive: true,
      mustChangePassword: true,
    }
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data })
      updated += 1
    } else {
      await prisma.user.create({ data: { email, ...data } })
      created += 1
    }
    handout.push([seat.name, email, seat.role, seat.branchCode ?? "All shops", password])
  }

  const width = handout[0].map((_, i) => Math.max(...handout.map((r) => r[i].length)))
  console.log("\nHand these out once. Each person must set their own password on first sign-in.\n")
  for (const row of handout) console.log("  " + row.map((c, i) => c.padEnd(width[i])).join("  "))
  console.log(`\n${SEATS.length} seats: ${created} created, ${updated} updated, ${untouched} left alone.`)
  if (untouched && !RESET) {
    console.log("Passwords already in use were not changed. Use --reset to issue new ones.")
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
