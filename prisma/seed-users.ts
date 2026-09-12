import { PrismaClient, type UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const BRANCHES = [
  {
    name: "Iwo Road, Ibadan",
    code: "IWO",
    address: "Iwo Road, Ibadan, Oyo State",
    phone: "07062454854",
    email: "iwo@abutwins.com",
    isHq: true,
  },
  {
    name: "Bodija, Ibadan",
    code: "BOD",
    address: "Bodija, Ibadan, Oyo State",
    phone: "07062454854",
    email: "bodija@abutwins.com",
    isHq: false,
  },
  {
    name: "Challenge, Ibadan",
    code: "CHL",
    address: "Challenge, Ibadan, Oyo State",
    phone: "07062454854",
    email: "challenge@abutwins.com",
    isHq: false,
  },
] as const

const RETIRED = ["LOS", "ABJ", "PHC"]

const SETTINGS = [
  { key: "company.name", value: "Abu Twins", description: "Legal trading name" },
  { key: "company.product", value: "Abu Twins Softskills", description: "Product name" },
  { key: "company.phone", value: "07062454854", description: "Phone on invoices" },
  { key: "company.address", value: "Iwo Road, Ibadan, Oyo State", description: "Address on invoices" },
  { key: "company.email", value: "hello@abutwins.com", description: "Email on invoices" },
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
  { email: "uploader@abutwins.com", password: "uploader123", name: "Data Uploader", role: "STOCK_UPLOADER" },
  { email: "ceo@abutwins.com", password: "ceo123", name: "Abu Twins", role: "CEO" },
  { email: "auditor@abutwins.com", password: "auditor123", name: "Amaka Okonkwo", role: "AUDITOR" },
  { email: "accountant@abutwins.com", password: "accountant123", name: "Chinedu Bassey", role: "ACCOUNTANT", branchCode: "IWO" },
  { email: "manager@abutwins.com", password: "manager123", name: "Halima Yusuf", role: "BRANCH_MANAGER", branchCode: "IWO" },
  { email: "vault@abutwins.com", password: "vault123", name: "Ibrahim Lawal", role: "VAULT_MANAGER", branchCode: "IWO" },
  { email: "cashier@abutwins.com", password: "cashier123", name: "Blessing Adeyemi", role: "CASHIER", branchCode: "IWO" },
  { email: "sales@abutwins.com", password: "sales123", name: "Tunde Adebayo", role: "SALES_EXECUTIVE", branchCode: "IWO" },
  { email: "engineer@abutwins.com", password: "engineer123", name: "Kelechi Nwosu", role: "ENGINEER", branchCode: "IWO" },
  { email: "challenge.manager@abutwins.com", password: "manager123", name: "Fatima Sule", role: "BRANCH_MANAGER", branchCode: "CHL" },
  { email: "challenge.vault@abutwins.com", password: "vault123", name: "Segun Oyelaran", role: "VAULT_MANAGER", branchCode: "CHL" },
  { email: "challenge.cashier@abutwins.com", password: "cashier123", name: "Ngozi Eze", role: "CASHIER", branchCode: "CHL" },
  { email: "challenge.sales@abutwins.com", password: "sales123", name: "Musa Danjuma", role: "SALES_EXECUTIVE", branchCode: "CHL" },
  { email: "challenge.engineer@abutwins.com", password: "engineer123", name: "Yemi Ogunleye", role: "ENGINEER", branchCode: "CHL" },

  { email: "bodija.manager@abutwins.com", password: "manager123", name: "Aisha Bello", role: "BRANCH_MANAGER", branchCode: "BOD" },
  { email: "bodija.vault@abutwins.com", password: "vault123", name: "Emeka Obi", role: "VAULT_MANAGER", branchCode: "BOD" },
  { email: "bodija.cashier@abutwins.com", password: "cashier123", name: "Folake Adisa", role: "CASHIER", branchCode: "BOD" },
  { email: "bodija.sales@abutwins.com", password: "sales123", name: "Sadiq Abubakar", role: "SALES_EXECUTIVE", branchCode: "BOD" },
  { email: "bodija.engineer@abutwins.com", password: "engineer123", name: "Chidera Okafor", role: "ENGINEER", branchCode: "BOD" },
]

const SEED_DEMO_USERS = process.env.SEED_DEMO_USERS === "true"

async function main() {
  console.log(
    SEED_DEMO_USERS
      ? "Seeding Ibadan shops, settings and the demo role logins..."
      : "Seeding Ibadan shops, settings and role permissions..."
  )

  const branches = new Map<string, string>()
  for (const branch of BRANCHES) {
    const row = await prisma.branch.upsert({
      where: { code: branch.code },
      update: {
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        email: branch.email,
        isActive: true,
        isHq: branch.isHq,
      },
      create: branch,
    })
    branches.set(row.code, row.id)
  }

  await prisma.branch.updateMany({
    where: { code: { in: RETIRED } },
    data: { isActive: false, isHq: false },
  })

  const hqId = branches.get("IWO")
  const challengeId = branches.get("CHL")
  const oldAbuja = await prisma.user.findUnique({ where: { email: "abuja.manager@abutwins.com" } })
  const challengeLogin = await prisma.user.findUnique({ where: { email: "challenge.manager@abutwins.com" } })
  if (oldAbuja && !challengeLogin && challengeId) {
    await prisma.user.update({
      where: { id: oldAbuja.id },
      data: { email: "challenge.manager@abutwins.com", branchId: challengeId, name: "Fatima Sule", isActive: true },
    })
    console.log("moved abuja.manager to Challenge")
  }
  if (hqId) {
    await prisma.user.updateMany({
      where: { branch: { code: { in: RETIRED } } },
      data: { branchId: hqId },
    })
  }

  // The demo logins (admin123, cashier123 and the rest) must never be created on
  // a real shop's database. This script also sets up the branches, the company
  // settings and the role permissions, and the deploy needs those on every boot,
  // so only the user block is gated rather than the whole script.
  //
  // Set SEED_DEMO_USERS=true for a throwaway local or staging database.
  if (!SEED_DEMO_USERS) {
    console.log("Skipping demo logins. Set SEED_DEMO_USERS=true to create them on a throwaway database.")
  }

  for (const user of SEED_DEMO_USERS ? USERS : []) {
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

  // One-off changes to what a job may do.
  //
  // ensureRolePermissions only fills in rows that are missing. It never changes
  // a row that is already there, because Super Admin's own ticks on Who can see
  // what must survive a deploy. So a change of mind about a default needs its
  // own step, and each one runs exactly once. A Super Admin who later ticks the
  // box back on keeps it.
  const REVISIONS: Array<{ key: string; why: string; apply: () => Promise<void> }> = [
    {
      key: "perm.revision.central_catalog",
      why: "The item list is loaded centrally by the stock uploader, so shop managers and goods intake no longer add items or change prices.",
      apply: async () => {
        await prisma.rolePermission.updateMany({
          where: { role: { in: ["BRANCH_MANAGER", "VAULT_MANAGER"] }, permKey: "action.catalog" },
          data: { allowed: false },
        })
      },
    },
    {
      key: "perm.revision.upload_only_roles",
      why: "Loading the item list and the stock from a sheet is the stock uploader's job, so the CEO and every other role no longer has it.",
      apply: async () => {
        await prisma.rolePermission.updateMany({
          where: {
            role: { notIn: ["SUPER_ADMIN", "STOCK_UPLOADER"] },
            permKey: { in: ["action.upload", "view.uploads"] },
          },
          data: { allowed: false },
        })
      },
    },
    {
      key: "perm.revision.books_desk_shared",
      why: "Records checker and accountant share one books desk: both can check records and post money.",
      apply: async () => {
        const { BOOKS_DESK_KEYS } = await import("../src/lib/permissions")
        for (const role of ["AUDITOR", "ACCOUNTANT"] as const) {
          for (const permKey of BOOKS_DESK_KEYS) {
            await prisma.rolePermission.upsert({
              where: { role_permKey: { role, permKey } },
              update: { allowed: true },
              create: { role, permKey, allowed: true },
            })
          }
        }
      },
    },
  ]

  for (const revision of REVISIONS) {
    const done = await prisma.setting.findUnique({ where: { key: revision.key } })
    if (done) continue
    await revision.apply()
    await prisma.setting.create({
      data: { key: revision.key, value: new Date().toISOString(), description: revision.why },
    })
    console.log(`applied ${revision.key}`)
  }

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
