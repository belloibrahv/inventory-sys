/**
 * Set every real staff seat to a known LOCAL password so you can test every
 * role on your machine before pushing to GitHub.
 *
 * These passwords are for localhost only. They must never be used on Railway.
 *
 *   npx tsx scripts/seed-local-logins.ts
 *
 * Refuses to run if DATABASE_URL looks like a remote Postgres / Railway host,
 * unless you pass --i-know-this-is-local.
 */
import { PrismaClient } from "@prisma/client"
import * as bcrypt from "bcryptjs"
import { SEATS } from "./staff-roster"
import { ROLE_LABELS } from "../src/lib/roles"

const prisma = new PrismaClient()

/** One easy password for every local seat. Change nothing here for day-to-day testing. */
export const LOCAL_TEST_PASSWORD = "Test1234!"

function looksRemote(url: string) {
  const lower = url.toLowerCase()
  if (lower.startsWith("file:")) return false
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) return false
  if (lower.includes("railway") || lower.includes("amazonaws") || lower.includes("supabase") || lower.includes("neon.tech")) {
    return true
  }
  return lower.startsWith("postgres") || lower.startsWith("postgresql")
}

async function main() {
  const url = process.env.DATABASE_URL || ""
  const forced = process.argv.includes("--i-know-this-is-local")
  if (!url) throw new Error("DATABASE_URL is not set")
  if (looksRemote(url) && !forced) {
    throw new Error(
      "This script looks like it would touch a remote database. Use a local SQLite DATABASE_URL, or pass --i-know-this-is-local if you are sure."
    )
  }

  const branches = await prisma.branch.findMany({ select: { id: true, code: true } })
  const branchId = new Map(branches.map((b) => [b.code, b.id]))
  const hash = await bcrypt.hash(LOCAL_TEST_PASSWORD, 10)

  const rows: string[][] = [["Role", "Shop", "Name", "Email", "Password"]]

  for (const seat of SEATS) {
    if (seat.branchCode && !branchId.has(seat.branchCode)) {
      throw new Error(`No shop with code ${seat.branchCode}. Run db seed first.`)
    }
    const email = seat.email.toLowerCase()
    const data = {
      name: seat.name,
      role: seat.role,
      branchId: seat.branchCode ? branchId.get(seat.branchCode)! : null,
      password: hash,
      isActive: true,
      // Local testing: do not force a password change on every sign-in.
      mustChangePassword: false,
    }
    await prisma.user.upsert({
      where: { email },
      update: data,
      create: { email, ...data },
    })
    rows.push([
      ROLE_LABELS[seat.role],
      seat.branchCode ?? "All shops",
      seat.name,
      email,
      LOCAL_TEST_PASSWORD,
    ])
  }

  const width = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
  console.log("\nLOCAL ONLY — same password for every seat. Never use these on production.\n")
  console.log(`Sign in at http://localhost:3000/login\n`)
  for (const row of rows) {
    console.log("  " + row.map((c, i) => c.padEnd(width[i])).join("  "))
  }
  console.log(`\n${SEATS.length} local seats ready. Password for all: ${LOCAL_TEST_PASSWORD}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
