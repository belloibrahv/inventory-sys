import { readFileSync, writeFileSync } from "node:fs"

const url = process.env.DATABASE_URL || ""
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)
const path = new URL("../prisma/schema.prisma", import.meta.url)
const source = readFileSync(path, "utf8")

if (!url.startsWith("postgres") && !onRailway) {
  console.log("Keeping Prisma sqlite for local database")
  process.exit(0)
}

const next = source.replace('provider = "sqlite"', 'provider = "postgresql"')

if (next === source) {
  throw new Error("Could not switch Prisma provider to postgresql")
}

writeFileSync(path, next)
console.log("Prisma datasource set to postgresql")
