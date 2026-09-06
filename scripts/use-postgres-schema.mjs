import { readFileSync, writeFileSync } from "node:fs"

const path = new URL("../prisma/schema.prisma", import.meta.url)
const source = readFileSync(path, "utf8")
const next = source.replace('provider = "sqlite"', 'provider = "postgresql"')

if (next === source) {
  throw new Error("Could not switch Prisma provider to postgresql")
}

writeFileSync(path, next)
console.log("Prisma datasource set to postgresql")
