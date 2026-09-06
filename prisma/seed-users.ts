import { PrismaClient, type UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const BRANCHES = [
  {
    name: "Computer Village HQ",
    code: "LOS",
    address: "14 Otigba Street, Computer Village, Ikeja, Lagos",
    phone: "+234 803 111 2201",
    email: "lagos@abutwins.com",
  },
  {
    name: "Wuse II",
    code: "ABJ",
    address: "Plot 42 Ademola Adetokunbo Crescent, Wuse II, Abuja",
    phone: "+234 809 222 3302",
    email: "abuja@abutwins.com",
  },
  {
    name: "Trans Amadi",
    code: "PHC",
    address: "21 Trans Amadi Industrial Layout, Port Harcourt",
    phone: "+234 806 333 4403",
    email: "ph@abutwins.com",
  },
] as const

const SETTINGS = [
  { key: "company.name", value: "Abu Twins", description: "Legal trading name" },
  { key: "company.product", value: "Abu Twins Softskills", description: "Product name" },
  { key: "company.currency", value: "NGN", description: "Default currency" },
  { key: "sales.allow_below_minimum", value: "false", description: "Require approval below min price" },
  { key: "inventory.low_stock_threshold", value: "3", description: "Default low stock" },
] as const

type SeedUser = {
  email: string
  password: string
  name: string
  role: UserRole
  branchCode?: string
}

const USERS: SeedUser[] = [
  { email: "admin@abutwins.com", password: "admin123", name: "TechVaults Admin", role: "SUPER_ADMIN" },
  { email: "ceo@abutwins.com", password: "ceo123", name: "Abu Twins", role: "CEO" },
  { email: "auditor@abutwins.com", password: "auditor123", name: "Amaka Okonkwo", role: "AUDITOR" },
  { email: "accountant@abutwins.com", password: "accountant123", name: "Chinedu Bassey", role: "ACCOUNTANT", branchCode: "LOS" },
  { email: "manager@abutwins.com", password: "manager123", name: "Halima Yusuf", role: "BRANCH_MANAGER", branchCode: "LOS" },
  { email: "vault@abutwins.com", password: "vault123", name: "Ibrahim Lawal", role: "VAULT_MANAGER", branchCode: "LOS" },
  { email: "cashier@abutwins.com", password: "cashier123", name: "Blessing Adeyemi", role: "CASHIER", branchCode: "LOS" },
  { email: "sales@abutwins.com", password: "sales123", name: "Tunde Adebayo", role: "SALES_EXECUTIVE", branchCode: "LOS" },
  { email: "engineer@abutwins.com", password: "engineer123", name: "Kelechi Nwosu", role: "ENGINEER", branchCode: "LOS" },
  { email: "abuja.manager@abutwins.com", password: "manager123", name: "Fatima Sule", role: "BRANCH_MANAGER", branchCode: "ABJ" },
]

async function main() {
  console.log("Seeding production users...")

  const branches = new Map<string, string>()
  for (const branch of BRANCHES) {
    const row = await prisma.branch.upsert({
      where: { code: branch.code },
      update: { name: branch.name, address: branch.address, phone: branch.phone, email: branch.email, isActive: true },
      create: branch,
    })
    branches.set(row.code, row.id)
  }

  for (const user of USERS) {
    const email = user.email.toLowerCase()
    const branchId = user.branchCode ? branches.get(user.branchCode) ?? null : null
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: user.name, role: user.role, branchId, isActive: true },
      })
      console.log(`updated ${email}`)
      continue
    }
    await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(user.password, 10),
        name: user.name,
        role: user.role,
        branchId,
      },
    })
    console.log(`created ${email}`)
  }

  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    })
  }

  const { ensureRolePermissions } = await import("../src/lib/permissions")
  await ensureRolePermissions()

  console.log("User seed complete.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
