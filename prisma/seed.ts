import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // Create Super Admin
  const superAdminPassword = await bcrypt.hash('admin123', 10)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@abutwins.com' },
    update: {},
    create: {
      email: 'admin@abutwins.com',
      password: superAdminPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })
  console.log('Created Super Admin:', superAdmin.email)

  // Create CEO
  const ceoPassword = await bcrypt.hash('ceo123', 10)
  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@abutwins.com' },
    update: {},
    create: {
      email: 'ceo@abutwins.com',
      password: ceoPassword,
      name: 'CEO',
      role: 'CEO',
      isActive: true,
    },
  })
  console.log('Created CEO:', ceo.email)

  // Create Main Branch
  const mainBranch = await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      name: 'Main Branch',
      code: 'MAIN',
      address: '123 Main Street, Lagos',
      phone: '+234 123 456 7890',
      email: 'main@abutwins.com',
      isActive: true,
    },
  })
  console.log('Created Main Branch:', mainBranch.name)

  // Create Branch Manager
  const managerPassword = await bcrypt.hash('manager123', 10)
  const branchManager = await prisma.user.upsert({
    where: { email: 'manager@abutwins.com' },
    update: {},
    create: {
      email: 'manager@abutwins.com',
      password: managerPassword,
      name: 'Branch Manager',
      role: 'BRANCH_MANAGER',
      branchId: mainBranch.id,
      isActive: true,
    },
  })
  console.log('Created Branch Manager:', branchManager.email)

  // Create Auditor
  const auditorPassword = await bcrypt.hash('auditor123', 10)
  const auditor = await prisma.user.upsert({
    where: { email: 'auditor@abutwins.com' },
    update: {},
    create: {
      email: 'auditor@abutwins.com',
      password: auditorPassword,
      name: 'Auditor',
      role: 'AUDITOR',
      isActive: true,
    },
  })
  console.log('Created Auditor:', auditor.email)

  // Create Accountant
  const accountantPassword = await bcrypt.hash('accountant123', 10)
  const accountant = await prisma.user.upsert({
    where: { email: 'accountant@abutwins.com' },
    update: {},
    create: {
      email: 'accountant@abutwins.com',
      password: accountantPassword,
      name: 'Accountant',
      role: 'ACCOUNTANT',
      isActive: true,
    },
  })
  console.log('Created Accountant:', accountant.email)

  // Create Vault Manager
  const vaultManagerPassword = await bcrypt.hash('vault123', 10)
  const vaultManager = await prisma.user.upsert({
    where: { email: 'vault@abutwins.com' },
    update: {},
    create: {
      email: 'vault@abutwins.com',
      password: vaultManagerPassword,
      name: 'Vault Manager',
      role: 'VAULT_MANAGER',
      branchId: mainBranch.id,
      isActive: true,
    },
  })
  console.log('Created Vault Manager:', vaultManager.email)

  // Create Cashier
  const cashierPassword = await bcrypt.hash('cashier123', 10)
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@abutwins.com' },
    update: {},
    create: {
      email: 'cashier@abutwins.com',
      password: cashierPassword,
      name: 'Cashier',
      role: 'CASHIER',
      branchId: mainBranch.id,
      isActive: true,
    },
  })
  console.log('Created Cashier:', cashier.email)

  // Create Sales Executive
  const salesPassword = await bcrypt.hash('sales123', 10)
  const salesExecutive = await prisma.user.upsert({
    where: { email: 'sales@abutwins.com' },
    update: {},
    create: {
      email: 'sales@abutwins.com',
      password: salesPassword,
      name: 'Sales Executive',
      role: 'SALES_EXECUTIVE',
      branchId: mainBranch.id,
      isActive: true,
    },
  })
  console.log('Created Sales Executive:', salesExecutive.email)

  // Create Engineer
  const engineerPassword = await bcrypt.hash('engineer123', 10)
  const engineer = await prisma.user.upsert({
    where: { email: 'engineer@abutwins.com' },
    update: {},
    create: {
      email: 'engineer@abutwins.com',
      password: engineerPassword,
      name: 'Engineer',
      role: 'ENGINEER',
      branchId: mainBranch.id,
      isActive: true,
    },
  })
  console.log('Created Engineer:', engineer.email)

  // Create sample categories
  const smartphoneCategory = await prisma.category.upsert({
    where: { name: 'Smartphones' },
    update: {},
    create: {
      name: 'Smartphones',
      description: 'Mobile phones and smartphones',
    },
  })
  console.log('Created Category:', smartphoneCategory.name)

  const tabletsCategory = await prisma.category.upsert({
    where: { name: 'Tablets' },
    update: {},
    create: {
      name: 'Tablets',
      description: 'Tablet devices',
    },
  })
  console.log('Created Category:', tabletsCategory.name)

  // Create sample brands
  const samsungBrand = await prisma.brand.upsert({
    where: { name: 'Samsung' },
    update: {},
    create: {
      name: 'Samsung',
    },
  })
  console.log('Created Brand:', samsungBrand.name)

  const appleBrand = await prisma.brand.upsert({
    where: { name: 'Apple' },
    update: {},
    create: {
      name: 'Apple',
    },
  })
  console.log('Created Brand:', appleBrand.name)

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })