/**
 * Bulk study data for Iwo Road, Bodija, and Challenge.
 *
 * Safe upsert by SKU / phone / invoice / IMEI. Does not wipe.
 * Covers phones, UK-used and new laptops, accessories, 12+ suppliers,
 * purchases, sales, incoming, transfers, returns, repairs, neighbor fills,
 * expenses, day closes, and alerts.
 *
 * npm run db:seed-demo
 * railway ssh -- npm run db:seed-demo
 */
import {
  PrismaClient,
  type ProductCondition,
  type ProductTracking,
  type ExpenseCategory,
} from "@prisma/client"

const prisma = new PrismaClient()

type ShopCode = "IWO" | "BOD" | "CHL"

function naira(value: number) {
  return value.toFixed(2)
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function watDay(daysBack: number) {
  const d = daysAgo(daysBack)
  // Approximate WAT calendar day as YYYY-MM-DD from local UTC+1 shift.
  const wat = new Date(d.getTime() + 60 * 60 * 1000)
  return wat.toISOString().slice(0, 10)
}

function studyImei(shop: ShopCode, seq: number) {
  const digit = shop === "IWO" ? "1" : shop === "BOD" ? "2" : "3"
  return `359900${digit}${String(seq).padStart(8, "0")}`
}

async function upsertBrand(name: string) {
  return (
    (await prisma.brand.findFirst({ where: { name } })) ||
    (await prisma.brand.create({ data: { name } }))
  )
}

async function upsertCategory(name: string) {
  return (
    (await prisma.category.findFirst({ where: { name } })) ||
    (await prisma.category.create({ data: { name } }))
  )
}

async function upsertSupplier(data: {
  name: string
  phone: string
  contactPerson: string
  email: string
  address: string
  country: string
  city: string
  kind?: "SUPPLIER" | "NEIGHBOR"
}) {
  const existing = await prisma.supplier.findFirst({ where: { phone: data.phone } })
  if (existing) {
    return prisma.supplier.update({
      where: { id: existing.id },
      data: { ...data, kind: data.kind ?? "SUPPLIER", isActive: true },
    })
  }
  return prisma.supplier.create({
    data: { ...data, kind: data.kind ?? "SUPPLIER" },
  })
}

async function upsertCustomer(data: {
  name: string
  phone: string
  branchId: string
  email?: string
  address?: string
  creditLimit?: number
}) {
  const existing = await prisma.customer.findUnique({ where: { phone: data.phone } })
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        branchId: data.branchId,
        email: data.email ?? existing.email,
        address: data.address ?? existing.address,
        creditLimit: data.creditLimit != null ? naira(data.creditLimit) : existing.creditLimit,
      },
    })
  }
  return prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone,
      branchId: data.branchId,
      email: data.email ?? null,
      address: data.address ?? null,
      creditLimit: naira(data.creditLimit ?? 0),
    },
  })
}

async function upsertProduct(data: {
  sku: string
  name: string
  brandId: string
  categoryId: string
  tracking: ProductTracking
  condition: ProductCondition
  color?: string
  storage?: string
  costPrice: number
  minimumPrice: number
  sellingPrice: number
  warrantyDays?: number
  description?: string
}) {
  const payload = {
    name: data.name,
    brandId: data.brandId,
    categoryId: data.categoryId,
    tracking: data.tracking,
    condition: data.condition,
    color: data.color ?? null,
    storage: data.storage ?? null,
    costPrice: naira(data.costPrice),
    minimumPrice: naira(data.minimumPrice),
    sellingPrice: naira(data.sellingPrice),
    warrantyDays: data.warrantyDays ?? 365,
    description: data.description ?? "Bulk study stock for Abu Twins",
    isActive: true,
  }
  const existing = await prisma.product.findUnique({ where: { sku: data.sku } })
  if (existing) return prisma.product.update({ where: { id: existing.id }, data: payload })
  return prisma.product.create({ data: { sku: data.sku, ...payload } })
}

async function main() {
  console.log("Loading bulk Ibadan study data (safe upsert)...")

  const branches = await prisma.branch.findMany({
    where: { code: { in: ["IWO", "BOD", "CHL"] }, isActive: true },
  })
  const byCode = Object.fromEntries(branches.map((b) => [b.code, b])) as Record<
    ShopCode,
    (typeof branches)[number]
  >
  if (!byCode.IWO || !byCode.BOD || !byCode.CHL) {
    throw new Error("IWO, BOD, and CHL must exist. Run db:seed-users first.")
  }
  const allBranchIds = [byCode.IWO.id, byCode.BOD.id, byCode.CHL.id]

  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [
          "admin@abutwins.com",
          "uploader@abutwins.com",
          "cashier@abutwins.com",
          "sales@abutwins.com",
          "accountant@abutwins.com",
          "manager@abutwins.com",
          "vault@abutwins.com",
          "engineer@abutwins.com",
          "bodija.cashier@abutwins.com",
          "bodija.manager@abutwins.com",
          "bodija.vault@abutwins.com",
          "bodija.engineer@abutwins.com",
          "challenge.cashier@abutwins.com",
          "challenge.manager@abutwins.com",
          "challenge.vault@abutwins.com",
          "challenge.engineer@abutwins.com",
        ],
      },
    },
  })
  const userByEmail = Object.fromEntries(users.map((u) => [u.email, u]))
  const need = (email: string) => {
    const u = userByEmail[email]
    if (!u) throw new Error(`Missing ${email}`)
    return u
  }

  // ——— Brands & categories ———
  const brandNames = [
    "Apple",
    "Samsung",
    "Tecno",
    "Infinix",
    "Xiaomi",
    "Dell",
    "HP",
    "Lenovo",
    "Anker",
    "Oraimo",
    "Baseus",
    "Generic",
  ]
  const brands: Record<string, { id: string }> = {}
  for (const name of brandNames) brands[name] = await upsertBrand(name)

  const cats: Record<string, { id: string }> = {}
  for (const name of ["Phones", "Laptops", "Accessories", "Screens", "Power"]) {
    cats[name] = await upsertCategory(name)
  }

  // ——— 12+ suppliers (bulk houses) ———
  const supplierDefs = [
    { name: "Dubai Phone House", phone: "+971500001001", contactPerson: "Hassan Al Farsi", email: "orders@dubaiphone.ae", address: "Al Ras, Deira", country: "UAE", city: "Dubai" },
    { name: "Shenzhen Mobile Link", phone: "+8613800010002", contactPerson: "Li Wei", email: "export@szmobile.cn", address: "Huaqiangbei", country: "China", city: "Shenzhen" },
    { name: "Alaba Twin Supplies", phone: "+2348025552001", contactPerson: "Tunde Bakare", email: "tunde@alabatwin.ng", address: "Alaba International", country: "Nigeria", city: "Lagos" },
    { name: "UK Used Device Hub", phone: "+447700900101", contactPerson: "James Okoro", email: "james@ukusedhub.co.uk", address: "Tottenham Court Road", country: "United Kingdom", city: "London" },
    { name: "Guangzhou Screen Factory", phone: "+8613900010003", contactPerson: "Chen Mei", email: "screens@gzfactory.cn", address: "Baiyun District", country: "China", city: "Guangzhou" },
    { name: "Ikeja Computer Plaza Co", phone: "+2348035552002", contactPerson: "Chioma Nwosu", email: "chioma@ikejaplaza.ng", address: "Computer Village", country: "Nigeria", city: "Lagos" },
    { name: "Hong Kong Gadget Export", phone: "+85290001004", contactPerson: "Wong Kai", email: "sales@hkgadget.hk", address: "Sham Shui Po", country: "Hong Kong", city: "Hong Kong" },
    { name: "Accra West Africa Phones", phone: "+233200001005", contactPerson: "Kwame Mensah", email: "kwame@awaphones.gh", address: "Circle", country: "Ghana", city: "Accra" },
    { name: "Dell Partner Nigeria", phone: "+2348055552003", contactPerson: "Femi Ade", email: "femi@dellpartner.ng", address: "Victoria Island", country: "Nigeria", city: "Lagos" },
    { name: "Anker Official Grey", phone: "+8613700010006", contactPerson: "Zhao Rui", email: "grey@anker-export.cn", address: "Shenzhen", country: "China", city: "Shenzhen" },
    { name: "Ibadan Bulk Accessories", phone: "+2348065552004", contactPerson: "Sola Akin", email: "sola@ibadanbulk.ng", address: "Challenge Market", country: "Nigeria", city: "Ibadan" },
    { name: "Apple Grey Line Dubai", phone: "+971500001007", contactPerson: "Omar Haddad", email: "omar@applegrey.ae", address: "Bur Dubai", country: "UAE", city: "Dubai" },
    { name: "Next Door Gadget (Neighbor)", phone: "+2348035553001", contactPerson: "Bola Ade", email: "bola@nextdoor.ng", address: "Beside Iwo Road", country: "Nigeria", city: "Ibadan", kind: "NEIGHBOR" as const },
    { name: "Bodija Corner Phones (Neighbor)", phone: "+2348035553002", contactPerson: "Yemi Lawal", email: "yemi@bodijacorner.ng", address: "Bodija Market edge", country: "Nigeria", city: "Ibadan", kind: "NEIGHBOR" as const },
  ]
  const suppliers = []
  for (const s of supplierDefs) suppliers.push(await upsertSupplier(s))
  const [
    dubai,
    china,
    alaba,
    ukUsed,
    gzScreen,
    ikeja,
    hk,
    accra,
    dellNg,
    anker,
    ibadanBulk,
    appleGrey,
    neighborIwo,
    neighborBod,
  ] = suppliers

  // ——— Catalog: flagship phones, UK MacBooks, Dell/HP, accessories ———
  type PDef = {
    sku: string
    name: string
    brand: string
    category: string
    tracking: ProductTracking
    condition: ProductCondition
    color?: string
    storage?: string
    cost: number
    min: number
    sell: number
    warranty?: number
  }

  const catalog: PDef[] = [
    // iPhones
    { sku: "BULK-IP17PM-256", name: "iPhone 17 Pro Max 256GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Cosmic Orange", storage: "256GB", cost: 1_650_000, min: 1_780_000, sell: 1_850_000 },
    { sku: "BULK-IP17PM-512", name: "iPhone 17 Pro Max 512GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Deep Blue", storage: "512GB", cost: 1_950_000, min: 2_100_000, sell: 2_250_000 },
    { sku: "BULK-IP17P-256", name: "iPhone 17 Pro 256GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Silver", storage: "256GB", cost: 1_420_000, min: 1_520_000, sell: 1_620_000 },
    { sku: "BULK-IP17-128", name: "iPhone 17 128GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Black", storage: "128GB", cost: 980_000, min: 1_080_000, sell: 1_150_000 },
    { sku: "BULK-IP16PM-256", name: "iPhone 16 Pro Max 256GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Desert Titanium", storage: "256GB", cost: 1_380_000, min: 1_480_000, sell: 1_580_000 },
    { sku: "BULK-IP16P-128", name: "iPhone 16 Pro 128GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Black Titanium", storage: "128GB", cost: 1_150_000, min: 1_250_000, sell: 1_350_000 },
    { sku: "BULK-IP16-128", name: "iPhone 16 128GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Teal", storage: "128GB", cost: 820_000, min: 900_000, sell: 980_000 },
    { sku: "BULK-IP15PM-256", name: "iPhone 15 Pro Max 256GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Natural Titanium", storage: "256GB", cost: 1_120_000, min: 1_220_000, sell: 1_320_000 },
    { sku: "BULK-IP15-128", name: "iPhone 15 128GB", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Blue", storage: "128GB", cost: 720_000, min: 800_000, sell: 880_000 },
    { sku: "BULK-IP15-128-UK", name: "iPhone 15 128GB UK Used", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "UK_USED", color: "Pink", storage: "128GB", cost: 480_000, min: 540_000, sell: 595_000 },
    { sku: "BULK-IP14-128-UK", name: "iPhone 14 128GB UK Used", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "UK_USED", color: "Midnight", storage: "128GB", cost: 380_000, min: 430_000, sell: 475_000 },
    { sku: "BULK-IP13-128-RF", name: "iPhone 13 128GB Refurbished", brand: "Apple", category: "Phones", tracking: "IMEI", condition: "REFURBISHED", color: "Starlight", storage: "128GB", cost: 290_000, min: 340_000, sell: 385_000 },
    // Samsung / Android volume
    { sku: "BULK-S24U-256", name: "Samsung Galaxy S24 Ultra 256GB", brand: "Samsung", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Titanium Gray", storage: "256GB", cost: 980_000, min: 1_080_000, sell: 1_180_000 },
    { sku: "BULK-S24-256", name: "Samsung Galaxy S24 256GB", brand: "Samsung", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Onyx Black", storage: "256GB", cost: 680_000, min: 760_000, sell: 845_000 },
    { sku: "BULK-A55-128", name: "Samsung Galaxy A55 128GB", brand: "Samsung", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Awesome Navy", storage: "128GB", cost: 245_000, min: 280_000, sell: 315_000 },
    { sku: "BULK-NOTE13P-256", name: "Redmi Note 13 Pro 256GB", brand: "Xiaomi", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Black", storage: "256GB", cost: 195_000, min: 230_000, sell: 255_000 },
    { sku: "BULK-CAMON30-256", name: "Tecno Camon 30 256GB", brand: "Tecno", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Basaltic Dark", storage: "256GB", cost: 145_000, min: 168_000, sell: 185_000 },
    { sku: "BULK-SPARK20-128", name: "Tecno Spark 20 128GB", brand: "Tecno", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "White", storage: "128GB", cost: 85_000, min: 98_000, sell: 112_000 },
    { sku: "BULK-HOT40-256", name: "Infinix Hot 40 256GB", brand: "Infinix", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Green", storage: "256GB", cost: 98_000, min: 115_000, sell: 128_000 },
    { sku: "BULK-NOTE30-256", name: "Infinix Note 30 256GB", brand: "Infinix", category: "Phones", tracking: "IMEI", condition: "BRAND_NEW", color: "Gold", storage: "256GB", cost: 125_000, min: 145_000, sell: 165_000 },
    // Laptops — serial
    { sku: "BULK-MBA-M2-256-BN", name: "MacBook Air M2 256GB", brand: "Apple", category: "Laptops", tracking: "SERIAL", condition: "BRAND_NEW", color: "Midnight", storage: "256GB", cost: 980_000, min: 1_080_000, sell: 1_180_000 },
    { sku: "BULK-MBA-M2-256-UK", name: "MacBook Air M2 256GB UK Used", brand: "Apple", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Starlight", storage: "256GB", cost: 620_000, min: 700_000, sell: 780_000 },
    { sku: "BULK-MBP14-M3-512-UK", name: "MacBook Pro 14 M3 512GB UK Used", brand: "Apple", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Space Black", storage: "512GB", cost: 1_150_000, min: 1_280_000, sell: 1_420_000 },
    { sku: "BULK-MBA-M1-256-UK", name: "MacBook Air M1 256GB UK Used", brand: "Apple", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Silver", storage: "256GB", cost: 420_000, min: 480_000, sell: 545_000 },
    { sku: "BULK-DELL-XPS13-512", name: "Dell XPS 13 512GB", brand: "Dell", category: "Laptops", tracking: "SERIAL", condition: "BRAND_NEW", color: "Platinum", storage: "512GB", cost: 780_000, min: 880_000, sell: 980_000 },
    { sku: "BULK-DELL-LAT5420-UK", name: "Dell Latitude 5420 UK Used", brand: "Dell", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Black", storage: "256GB", cost: 280_000, min: 330_000, sell: 385_000 },
    { sku: "BULK-HP-ELITE840-UK", name: "HP EliteBook 840 G8 UK Used", brand: "HP", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Silver", storage: "512GB", cost: 310_000, min: 360_000, sell: 420_000 },
    { sku: "BULK-LEN-T14-UK", name: "Lenovo ThinkPad T14 UK Used", brand: "Lenovo", category: "Laptops", tracking: "SERIAL", condition: "UK_USED", color: "Black", storage: "512GB", cost: 295_000, min: 345_000, sell: 405_000 },
    // Accessories / power / screens — piece count
    { sku: "BULK-CORD-TYPEC", name: "Type-C charger cord", brand: "Generic", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "Black", cost: 1_500, min: 2_000, sell: 2_500, warranty: 90 },
    { sku: "BULK-CORD-LIGHT", name: "Lightning cord", brand: "Generic", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "White", cost: 1_800, min: 2_500, sell: 3_500, warranty: 90 },
    { sku: "BULK-CHG-20W", name: "20W USB-C wall charger", brand: "Anker", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "White", cost: 8_500, min: 11_000, sell: 14_000, warranty: 180 },
    { sku: "BULK-CHG-65W", name: "65W GaN charger", brand: "Baseus", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "Black", cost: 18_000, min: 24_000, sell: 32_000, warranty: 180 },
    { sku: "BULK-PB-20000", name: "Oraimo 20000mAh power bank", brand: "Oraimo", category: "Power", tracking: "NONE", condition: "BRAND_NEW", color: "Black", cost: 12_000, min: 16_000, sell: 22_000, warranty: 180 },
    { sku: "BULK-CASE-IP16", name: "iPhone 16 clear case", brand: "Generic", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "Clear", cost: 2_500, min: 4_000, sell: 6_500, warranty: 30 },
    { sku: "BULK-CASE-IP17PM", name: "iPhone 17 Pro Max silicone case", brand: "Generic", category: "Accessories", tracking: "NONE", condition: "BRAND_NEW", color: "Navy", cost: 4_500, min: 7_000, sell: 12_000, warranty: 30 },
    { sku: "BULK-EAR-BUDS3", name: "Galaxy Buds3", brand: "Samsung", category: "Accessories", tracking: "SERIAL", condition: "BRAND_NEW", color: "White", cost: 42_000, min: 52_000, sell: 68_000, warranty: 180 },
    { sku: "BULK-AIRPODS-PRO2", name: "AirPods Pro 2", brand: "Apple", category: "Accessories", tracking: "SERIAL", condition: "BRAND_NEW", color: "White", cost: 185_000, min: 210_000, sell: 245_000, warranty: 365 },
    { sku: "BULK-SCR-IP15", name: "iPhone 15 screen (OEM)", brand: "Apple", category: "Screens", tracking: "NONE", condition: "BRAND_NEW", cost: 45_000, min: 55_000, sell: 68_000, warranty: 90 },
    { sku: "BULK-SCR-IP16", name: "iPhone 16 screen (OEM)", brand: "Apple", category: "Screens", tracking: "NONE", condition: "BRAND_NEW", cost: 58_000, min: 72_000, sell: 95_000, warranty: 90 },
    { sku: "BULK-SCR-S24", name: "Galaxy S24 screen", brand: "Samsung", category: "Screens", tracking: "NONE", condition: "BRAND_NEW", cost: 52_000, min: 68_000, sell: 88_000, warranty: 90 },
  ]

  const products: Record<string, Awaited<ReturnType<typeof upsertProduct>>> = {}
  for (const row of catalog) {
    products[row.sku] = await upsertProduct({
      sku: row.sku,
      name: row.name,
      brandId: brands[row.brand].id,
      categoryId: cats[row.category].id,
      tracking: row.tracking,
      condition: row.condition,
      color: row.color,
      storage: row.storage,
      costPrice: row.cost,
      minimumPrice: row.min,
      sellingPrice: row.sell,
      warrantyDays: row.warranty,
    })
  }

  for (const p of Object.values(products)) {
    for (const branchId of allBranchIds) {
      await prisma.inventory.upsert({
        where: { productId_branchId: { productId: p.id, branchId } },
        update: {},
        create: { productId: p.id, branchId, quantity: 0, minStock: 2 },
      })
    }
  }

  // ——— Customers (many named buyers per shop) ———
  const customerSeeds = [
    ...Array.from({ length: 8 }, (_, i) => ({
      name: ["Adewale Okonkwo", "Funmilayo Adebayo", "Chinedu Obi", "Blessing Lawal", "Segun Ayo", "Maryam Bello", "Kunle Peters", "Grace Okafor"][i],
      phone: `0803111${String(1001 + i).padStart(4, "0")}`,
      shop: "IWO" as ShopCode,
      credit: i % 3 === 0 ? 500_000 : 0,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      name: ["Tunde Salami", "Ngozi Eze", "Ifeanyi Okoro", "Amina Yusuf", "Bayo Fashola", "Rita Okeke", "Dayo Martins"][i],
      phone: `0803222${String(1001 + i).padStart(4, "0")}`,
      shop: "BOD" as ShopCode,
      credit: i % 2 === 0 ? 200_000 : 0,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      name: ["Kemi Oladipo", "Ibrahim Yusuf", "Sade Ajayi", "Paul Nwosu", "Halima Garba", "Tony Eke", "Zainab Musa"][i],
      phone: `0803333${String(1001 + i).padStart(4, "0")}`,
      shop: "CHL" as ShopCode,
      credit: i === 0 ? 150_000 : 0,
    })),
  ]
  const customersByPhone: Record<string, { id: string }> = {}
  for (const c of customerSeeds) {
    customersByPhone[c.phone] = await upsertCustomer({
      name: c.name,
      phone: c.phone,
      branchId: byCode[c.shop].id,
      address: `${c.shop === "IWO" ? "Iwo Road" : c.shop === "BOD" ? "Bodija" : "Challenge"}, Ibadan`,
      creditLimit: c.credit,
    })
  }

  // ——— Bulk In shop units (phones + serial laptops/earbuds) ———
  // Per shop counts: flagships moderate, volume Android high, UK used good stock.
  type StockLine = { sku: string; supplierId: string; iwo: number; bod: number; chl: number; seqBase: number }
  const stockLines: StockLine[] = [
    { sku: "BULK-IP17PM-256", supplierId: appleGrey.id, iwo: 12, bod: 8, chl: 10, seqBase: 1100 },
    { sku: "BULK-IP17PM-512", supplierId: dubai.id, iwo: 6, bod: 4, chl: 4, seqBase: 1200 },
    { sku: "BULK-IP17P-256", supplierId: appleGrey.id, iwo: 10, bod: 6, chl: 8, seqBase: 1300 },
    { sku: "BULK-IP17-128", supplierId: dubai.id, iwo: 14, bod: 10, chl: 12, seqBase: 1400 },
    { sku: "BULK-IP16PM-256", supplierId: appleGrey.id, iwo: 10, bod: 8, chl: 8, seqBase: 1500 },
    { sku: "BULK-IP16P-128", supplierId: dubai.id, iwo: 12, bod: 8, chl: 10, seqBase: 1600 },
    { sku: "BULK-IP16-128", supplierId: hk.id, iwo: 16, bod: 12, chl: 14, seqBase: 1700 },
    { sku: "BULK-IP15PM-256", supplierId: dubai.id, iwo: 8, bod: 6, chl: 6, seqBase: 1800 },
    { sku: "BULK-IP15-128", supplierId: alaba.id, iwo: 18, bod: 14, chl: 16, seqBase: 1900 },
    { sku: "BULK-IP15-128-UK", supplierId: ukUsed.id, iwo: 15, bod: 12, chl: 12, seqBase: 2000 },
    { sku: "BULK-IP14-128-UK", supplierId: ukUsed.id, iwo: 20, bod: 16, chl: 18, seqBase: 2100 },
    { sku: "BULK-IP13-128-RF", supplierId: ikeja.id, iwo: 12, bod: 10, chl: 10, seqBase: 2200 },
    { sku: "BULK-S24U-256", supplierId: china.id, iwo: 8, bod: 6, chl: 6, seqBase: 2300 },
    { sku: "BULK-S24-256", supplierId: china.id, iwo: 14, bod: 10, chl: 12, seqBase: 2400 },
    { sku: "BULK-A55-128", supplierId: alaba.id, iwo: 25, bod: 20, chl: 22, seqBase: 2500 },
    { sku: "BULK-NOTE13P-256", supplierId: china.id, iwo: 22, bod: 18, chl: 20, seqBase: 2600 },
    { sku: "BULK-CAMON30-256", supplierId: accra.id, iwo: 30, bod: 28, chl: 32, seqBase: 2700 },
    { sku: "BULK-SPARK20-128", supplierId: alaba.id, iwo: 35, bod: 30, chl: 34, seqBase: 2800 },
    { sku: "BULK-HOT40-256", supplierId: ibadanBulk.id, iwo: 28, bod: 32, chl: 30, seqBase: 2900 },
    { sku: "BULK-NOTE30-256", supplierId: china.id, iwo: 18, bod: 16, chl: 16, seqBase: 3000 },
    { sku: "BULK-MBA-M2-256-BN", supplierId: dubai.id, iwo: 4, bod: 2, chl: 3, seqBase: 3100 },
    { sku: "BULK-MBA-M2-256-UK", supplierId: ukUsed.id, iwo: 8, bod: 6, chl: 7, seqBase: 3200 },
    { sku: "BULK-MBP14-M3-512-UK", supplierId: ukUsed.id, iwo: 3, bod: 2, chl: 2, seqBase: 3300 },
    { sku: "BULK-MBA-M1-256-UK", supplierId: ukUsed.id, iwo: 10, bod: 8, chl: 8, seqBase: 3400 },
    { sku: "BULK-DELL-XPS13-512", supplierId: dellNg.id, iwo: 5, bod: 3, chl: 4, seqBase: 3500 },
    { sku: "BULK-DELL-LAT5420-UK", supplierId: ukUsed.id, iwo: 12, bod: 10, chl: 10, seqBase: 3600 },
    { sku: "BULK-HP-ELITE840-UK", supplierId: ukUsed.id, iwo: 10, bod: 8, chl: 8, seqBase: 3700 },
    { sku: "BULK-LEN-T14-UK", supplierId: ukUsed.id, iwo: 9, bod: 7, chl: 7, seqBase: 3800 },
    { sku: "BULK-EAR-BUDS3", supplierId: china.id, iwo: 15, bod: 12, chl: 12, seqBase: 3900 },
    { sku: "BULK-AIRPODS-PRO2", supplierId: appleGrey.id, iwo: 10, bod: 8, chl: 8, seqBase: 4000 },
  ]

  let unitsCreated = 0
  const unitIdsBySkuShop = new Map<string, string[]>()

  for (const line of stockLines) {
    const product = products[line.sku]
    const counts: Array<[ShopCode, number]> = [
      ["IWO", line.iwo],
      ["BOD", line.bod],
      ["CHL", line.chl],
    ]
    for (const [shop, count] of counts) {
      const ids: string[] = []
      const batch: Array<{
        imei1: string
        imei2: string
        serialNumber: string
        productId: string
        branchId: string
        supplierId: string
        status: "IN_STOCK"
        notes: string
      }> = []
      for (let i = 0; i < count; i++) {
        const seq = line.seqBase + (shop === "IWO" ? 0 : shop === "BOD" ? 400 : 800) + i
        const imei1 = studyImei(shop, seq)
        const existing = await prisma.imeiRecord.findUnique({ where: { imei1 }, select: { id: true } })
        if (existing) {
          ids.push(existing.id)
          continue
        }
        batch.push({
          imei1,
          imei2: studyImei(shop, seq + 50_000),
          serialNumber: `${line.sku}-${shop}-${seq}`,
          productId: product.id,
          branchId: byCode[shop].id,
          supplierId: line.supplierId,
          status: "IN_STOCK",
          notes: "Bulk study stock",
        })
      }
      if (batch.length) {
        await prisma.imeiRecord.createMany({ data: batch })
        unitsCreated += batch.length
        const created = await prisma.imeiRecord.findMany({
          where: { imei1: { in: batch.map((b) => b.imei1) } },
          select: { id: true, imei1: true },
        })
        ids.push(...created.map((c) => c.id))
      }
      unitIdsBySkuShop.set(`${line.sku}:${shop}`, ids)
    }
  }

  // Piece accessories — bulk shelf counts
  const pieceStock: Array<{ sku: string; iwo: number; bod: number; chl: number }> = [
    { sku: "BULK-CORD-TYPEC", iwo: 120, bod: 90, chl: 100 },
    { sku: "BULK-CORD-LIGHT", iwo: 80, bod: 60, chl: 70 },
    { sku: "BULK-CHG-20W", iwo: 45, bod: 35, chl: 40 },
    { sku: "BULK-CHG-65W", iwo: 25, bod: 18, chl: 20 },
    { sku: "BULK-PB-20000", iwo: 40, bod: 30, chl: 35 },
    { sku: "BULK-CASE-IP16", iwo: 60, bod: 45, chl: 50 },
    { sku: "BULK-CASE-IP17PM", iwo: 35, bod: 28, chl: 30 },
    { sku: "BULK-SCR-IP15", iwo: 18, bod: 12, chl: 14 },
    { sku: "BULK-SCR-IP16", iwo: 14, bod: 10, chl: 12 },
    { sku: "BULK-SCR-S24", iwo: 10, bod: 8, chl: 8 },
  ]
  for (const row of pieceStock) {
    for (const shop of ["IWO", "BOD", "CHL"] as ShopCode[]) {
      const qty = shop === "IWO" ? row.iwo : shop === "BOD" ? row.bod : row.chl
      await prisma.inventory.upsert({
        where: { productId_branchId: { productId: products[row.sku].id, branchId: byCode[shop].id } },
        update: { quantity: qty, minStock: 10, lastStockCheck: new Date() },
        create: {
          productId: products[row.sku].id,
          branchId: byCode[shop].id,
          quantity: qty,
          minStock: 10,
          lastStockCheck: new Date(),
        },
      })
    }
  }

  // Sync IMEI product inventory to In shop counts
  for (const line of stockLines) {
    for (const shop of ["IWO", "BOD", "CHL"] as ShopCode[]) {
      const inShop = await prisma.imeiRecord.count({
        where: { productId: products[line.sku].id, branchId: byCode[shop].id, status: "IN_STOCK" },
      })
      await prisma.inventory.upsert({
        where: { productId_branchId: { productId: products[line.sku].id, branchId: byCode[shop].id } },
        update: { quantity: inShop, minStock: 3, lastStockCheck: new Date() },
        create: { productId: products[line.sku].id, branchId: byCode[shop].id, quantity: inShop, minStock: 3 },
      })
    }
  }

  async function ensurePurchase(opts: {
    invoiceNumber: string
    supplierId: string
    shop: ShopCode
    userEmail: string
    total: number
    paid: number
    source?: string | null
    notes: string
    days: number
    lines: Array<{ sku: string; qty: number; cost: number }>
    linkKeys?: string[]
  }) {
    const existing = await prisma.purchase.findUnique({ where: { invoiceNumber: opts.invoiceNumber } })
    if (existing) return existing
    const purchase = await prisma.purchase.create({
      data: {
        invoiceNumber: opts.invoiceNumber,
        supplierId: opts.supplierId,
        branchId: byCode[opts.shop].id,
        userId: need(opts.userEmail).id,
        status: "RECEIVED",
        totalAmount: naira(opts.total),
        paidAmount: naira(opts.paid),
        paymentMethod: opts.paid > 0 ? "TRANSFER" : null,
        source: opts.source ?? null,
        sessionOpen: false,
        receivedDate: daysAgo(opts.days),
        createdAt: daysAgo(opts.days),
        notes: opts.notes,
        items: {
          create: opts.lines.map((l) => ({
            productId: products[l.sku].id,
            quantity: l.qty,
            receivedQty: l.qty,
            costPrice: naira(l.cost),
            totalAmount: naira(l.qty * l.cost),
          })),
        },
      },
    })
    if (opts.linkKeys?.length) {
      const ids = opts.linkKeys.flatMap((k) => unitIdsBySkuShop.get(k) ?? []).slice(0, 80)
      if (ids.length) {
        await prisma.imeiRecord.updateMany({ where: { id: { in: ids } }, data: { purchaseId: purchase.id } })
      }
    }
    return purchase
  }

  // Supplier bills — paid, unpaid, partial, upload-stock labelled
  await ensurePurchase({
    invoiceNumber: "BULK-PO-IWO-DUBAI-01",
    supplierId: appleGrey.id,
    shop: "IWO",
    userEmail: "uploader@abutwins.com",
    total: 12 * 1_650_000 + 10 * 1_420_000,
    paid: 12 * 1_650_000 + 10 * 1_420_000,
    source: "UPLOAD_STOCK",
    notes: "Bulk upload · Dubai/Apple grey · iPhone 17 Pro Max + Pro · Paid",
    days: 12,
    lines: [
      { sku: "BULK-IP17PM-256", qty: 12, cost: 1_650_000 },
      { sku: "BULK-IP17P-256", qty: 10, cost: 1_420_000 },
    ],
    linkKeys: ["BULK-IP17PM-256:IWO", "BULK-IP17P-256:IWO"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-IWO-CHINA-OWED",
    supplierId: china.id,
    shop: "IWO",
    userEmail: "vault@abutwins.com",
    total: 14 * 680_000 + 25 * 245_000,
    paid: 0,
    source: "UPLOAD_STOCK",
    notes: "Bulk upload · Not paid yet · S24 + A55 carton",
    days: 5,
    lines: [
      { sku: "BULK-S24-256", qty: 14, cost: 680_000 },
      { sku: "BULK-A55-128", qty: 25, cost: 245_000 },
    ],
    linkKeys: ["BULK-S24-256:IWO", "BULK-A55-128:IWO"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-IWO-UK-LAPTOPS",
    supplierId: ukUsed.id,
    shop: "IWO",
    userEmail: "uploader@abutwins.com",
    total: 8 * 620_000 + 12 * 280_000 + 10 * 310_000,
    paid: 2_000_000,
    notes: "UK used MacBooks + Dell + HP · Part paid",
    days: 8,
    lines: [
      { sku: "BULK-MBA-M2-256-UK", qty: 8, cost: 620_000 },
      { sku: "BULK-DELL-LAT5420-UK", qty: 12, cost: 280_000 },
      { sku: "BULK-HP-ELITE840-UK", qty: 10, cost: 310_000 },
    ],
    linkKeys: ["BULK-MBA-M2-256-UK:IWO", "BULK-DELL-LAT5420-UK:IWO", "BULK-HP-ELITE840-UK:IWO"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-BOD-VOLUME-01",
    supplierId: alaba.id,
    shop: "BOD",
    userEmail: "bodija.vault@abutwins.com",
    total: 28 * 98_000 + 30 * 85_000 + 14 * 720_000,
    paid: 28 * 98_000 + 30 * 85_000 + 14 * 720_000,
    source: "UPLOAD_STOCK",
    notes: "Bodija volume · Hot 40 + Spark + iPhone 15 · Paid",
    days: 9,
    lines: [
      { sku: "BULK-HOT40-256", qty: 28, cost: 98_000 },
      { sku: "BULK-SPARK20-128", qty: 30, cost: 85_000 },
      { sku: "BULK-IP15-128", qty: 14, cost: 720_000 },
    ],
    linkKeys: ["BULK-HOT40-256:BOD", "BULK-SPARK20-128:BOD", "BULK-IP15-128:BOD"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-BOD-UK-OWED",
    supplierId: ukUsed.id,
    shop: "BOD",
    userEmail: "bodija.manager@abutwins.com",
    total: 12 * 480_000 + 6 * 620_000,
    paid: 0,
    notes: "UK used iPhone 15 + MacBook Air · Not paid",
    days: 3,
    lines: [
      { sku: "BULK-IP15-128-UK", qty: 12, cost: 480_000 },
      { sku: "BULK-MBA-M2-256-UK", qty: 6, cost: 620_000 },
    ],
    linkKeys: ["BULK-IP15-128-UK:BOD", "BULK-MBA-M2-256-UK:BOD"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-CHL-FLAGSHIP",
    supplierId: dubai.id,
    shop: "CHL",
    userEmail: "challenge.vault@abutwins.com",
    total: 10 * 1_650_000 + 12 * 980_000,
    paid: 10 * 1_650_000 + 12 * 980_000,
    source: "UPLOAD_STOCK",
    notes: "Challenge flagship carton · iPhone 17 Pro Max + iPhone 17 · Paid",
    days: 7,
    lines: [
      { sku: "BULK-IP17PM-256", qty: 10, cost: 1_650_000 },
      { sku: "BULK-IP17-128", qty: 12, cost: 980_000 },
    ],
    linkKeys: ["BULK-IP17PM-256:CHL", "BULK-IP17-128:CHL"],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-CHL-ACC-01",
    supplierId: anker.id,
    shop: "CHL",
    userEmail: "uploader@abutwins.com",
    total: 40 * 8_500 + 35 * 12_000 + 20 * 18_000,
    paid: 500_000,
    notes: "Accessories + power · Part paid",
    days: 4,
    lines: [
      { sku: "BULK-CHG-20W", qty: 40, cost: 8_500 },
      { sku: "BULK-PB-20000", qty: 35, cost: 12_000 },
      { sku: "BULK-CHG-65W", qty: 20, cost: 18_000 },
    ],
  })
  await ensurePurchase({
    invoiceNumber: "BULK-PO-IWO-SCREENS",
    supplierId: gzScreen.id,
    shop: "IWO",
    userEmail: "vault@abutwins.com",
    total: 18 * 45_000 + 14 * 58_000,
    paid: 18 * 45_000 + 14 * 58_000,
    notes: "OEM screens carton · Paid",
    days: 6,
    lines: [
      { sku: "BULK-SCR-IP15", qty: 18, cost: 45_000 },
      { sku: "BULK-SCR-IP16", qty: 14, cost: 58_000 },
    ],
  })

  // ——— Sales across shops ———
  async function ensureSale(opts: {
    invoice: string
    shop: ShopCode
    userEmail: string
    customerPhone: string
    sku: string
    price: number
    method: "CASH" | "TRANSFER" | "POS" | "CREDIT"
    paid: number
    days: number
  }) {
    if (await prisma.sale.findUnique({ where: { invoiceNumber: opts.invoice } })) return
    const pool = unitIdsBySkuShop.get(`${opts.sku}:${opts.shop}`) ?? []
    let imeiId: string | null = null
    for (const id of pool) {
      const row = await prisma.imeiRecord.findUnique({ where: { id }, select: { id: true, status: true } })
      if (row?.status === "IN_STOCK") {
        imeiId = row.id
        break
      }
    }
    if (!imeiId) {
      console.log(`  skip sale ${opts.invoice}: no In shop unit for ${opts.sku}@${opts.shop}`)
      return
    }
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: opts.invoice,
        branchId: byCode[opts.shop].id,
        userId: need(opts.userEmail).id,
        customerId: customersByPhone[opts.customerPhone].id,
        saleType: "RETAIL",
        status: "COMPLETED",
        subtotal: naira(opts.price),
        totalAmount: naira(opts.price),
        paidAmount: naira(opts.paid),
        paymentMethod: opts.method,
        saleDate: daysAgo(opts.days),
        notes: "Bulk study sale",
        items: {
          create: {
            productId: products[opts.sku].id,
            imeiId,
            quantity: 1,
            unitPrice: naira(opts.price),
            totalPrice: naira(opts.price),
          },
        },
        payments:
          opts.paid > 0
            ? {
                create: {
                  amount: naira(opts.paid),
                  method: opts.method === "CREDIT" ? "TRANSFER" : opts.method,
                  paidAt: daysAgo(opts.days),
                },
              }
            : undefined,
      },
    })
    await prisma.imeiRecord.update({
      where: { id: imeiId },
      data: { status: "SOLD", customerId: customersByPhone[opts.customerPhone].id, saleId: sale.id },
    })
    await prisma.inventory.update({
      where: { productId_branchId: { productId: products[opts.sku].id, branchId: byCode[opts.shop].id } },
      data: { quantity: { decrement: 1 } },
    })
    if (opts.paid > 0) {
      await prisma.financeEntry.create({
        data: {
          branchId: byCode[opts.shop].id,
          account: opts.method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: naira(opts.paid),
          reference: opts.invoice,
          description: `Sale ${opts.invoice}`,
          createdAt: daysAgo(opts.days),
        },
      })
    }
    if (opts.paid < opts.price) {
      await prisma.ledgerEntry.create({
        data: {
          customerId: customersByPhone[opts.customerPhone].id,
          type: "SALE",
          amount: naira(opts.price - opts.paid),
          balance: naira(opts.price - opts.paid),
          reference: opts.invoice,
          description: `Balance on ${opts.invoice}`,
          createdAt: daysAgo(opts.days),
        },
      })
    }
  }

  const salesPlan = [
    { invoice: "BULK-INV-IWO-2001", shop: "IWO" as ShopCode, userEmail: "cashier@abutwins.com", customerPhone: "08031111001", sku: "BULK-IP17PM-256", price: 1_850_000, method: "TRANSFER" as const, paid: 1_850_000, days: 1 },
    { invoice: "BULK-INV-IWO-2002", shop: "IWO" as ShopCode, userEmail: "sales@abutwins.com", customerPhone: "08031111002", sku: "BULK-IP16-128", price: 980_000, method: "POS" as const, paid: 980_000, days: 2 },
    { invoice: "BULK-INV-IWO-2003", shop: "IWO" as ShopCode, userEmail: "cashier@abutwins.com", customerPhone: "08031111003", sku: "BULK-S24-256", price: 845_000, method: "CASH" as const, paid: 845_000, days: 2 },
    { invoice: "BULK-INV-IWO-2004", shop: "IWO" as ShopCode, userEmail: "cashier@abutwins.com", customerPhone: "08031111004", sku: "BULK-MBA-M2-256-UK", price: 780_000, method: "TRANSFER" as const, paid: 780_000, days: 3 },
    { invoice: "BULK-INV-IWO-2005", shop: "IWO" as ShopCode, userEmail: "sales@abutwins.com", customerPhone: "08031111005", sku: "BULK-CAMON30-256", price: 185_000, method: "CREDIT" as const, paid: 50_000, days: 1 },
    { invoice: "BULK-INV-IWO-2006", shop: "IWO" as ShopCode, userEmail: "cashier@abutwins.com", customerPhone: "08031111006", sku: "BULK-IP15-128-UK", price: 595_000, method: "POS" as const, paid: 595_000, days: 4 },
    { invoice: "BULK-INV-IWO-2007", shop: "IWO" as ShopCode, userEmail: "cashier@abutwins.com", customerPhone: "08031111007", sku: "BULK-AIRPODS-PRO2", price: 245_000, method: "CASH" as const, paid: 245_000, days: 1 },
    { invoice: "BULK-INV-BOD-2001", shop: "BOD" as ShopCode, userEmail: "bodija.cashier@abutwins.com", customerPhone: "08032221001", sku: "BULK-HOT40-256", price: 128_000, method: "CASH" as const, paid: 128_000, days: 1 },
    { invoice: "BULK-INV-BOD-2002", shop: "BOD" as ShopCode, userEmail: "bodija.cashier@abutwins.com", customerPhone: "08032221002", sku: "BULK-IP15-128", price: 880_000, method: "TRANSFER" as const, paid: 880_000, days: 2 },
    { invoice: "BULK-INV-BOD-2003", shop: "BOD" as ShopCode, userEmail: "bodija.cashier@abutwins.com", customerPhone: "08032221003", sku: "BULK-A55-128", price: 315_000, method: "POS" as const, paid: 315_000, days: 3 },
    { invoice: "BULK-INV-BOD-2004", shop: "BOD" as ShopCode, userEmail: "bodija.cashier@abutwins.com", customerPhone: "08032221004", sku: "BULK-DELL-LAT5420-UK", price: 385_000, method: "TRANSFER" as const, paid: 200_000, days: 2 },
    { invoice: "BULK-INV-BOD-2005", shop: "BOD" as ShopCode, userEmail: "bodija.cashier@abutwins.com", customerPhone: "08032221005", sku: "BULK-SPARK20-128", price: 112_000, method: "CASH" as const, paid: 112_000, days: 1 },
    { invoice: "BULK-INV-CHL-2001", shop: "CHL" as ShopCode, userEmail: "challenge.cashier@abutwins.com", customerPhone: "08033331001", sku: "BULK-IP17PM-256", price: 1_850_000, method: "TRANSFER" as const, paid: 1_850_000, days: 1 },
    { invoice: "BULK-INV-CHL-2002", shop: "CHL" as ShopCode, userEmail: "challenge.cashier@abutwins.com", customerPhone: "08033331002", sku: "BULK-IP17-128", price: 1_150_000, method: "POS" as const, paid: 1_150_000, days: 2 },
    { invoice: "BULK-INV-CHL-2003", shop: "CHL" as ShopCode, userEmail: "challenge.cashier@abutwins.com", customerPhone: "08033331003", sku: "BULK-NOTE13P-256", price: 255_000, method: "CASH" as const, paid: 255_000, days: 3 },
    { invoice: "BULK-INV-CHL-2004", shop: "CHL" as ShopCode, userEmail: "challenge.cashier@abutwins.com", customerPhone: "08033331004", sku: "BULK-HP-ELITE840-UK", price: 420_000, method: "TRANSFER" as const, paid: 420_000, days: 2 },
    { invoice: "BULK-INV-CHL-2005", shop: "CHL" as ShopCode, userEmail: "challenge.cashier@abutwins.com", customerPhone: "08033331005", sku: "BULK-EAR-BUDS3", price: 68_000, method: "CASH" as const, paid: 68_000, days: 1 },
  ]
  for (const s of salesPlan) await ensureSale(s)

  // ——— Goods on the way (Coming) ———
  async function ensureIncoming(lotNumber: string, shop: ShopCode, supplierId: string, userEmail: string, days: number, lines: Array<{ sku: string; qty: number }>) {
    if (await prisma.incomingLot.findUnique({ where: { lotNumber } })) return
    await prisma.incomingLot.create({
      data: {
        lotNumber,
        branchId: byCode[shop].id,
        supplierId,
        userId: need(userEmail).id,
        status: "COMING",
        visible: true,
        expectedDate: daysAgo(-days),
        notes: "Bulk study · still on the road",
        items: {
          create: lines.map((l) => ({
            productId: products[l.sku].id,
            quantity: l.qty,
            identity: products[l.sku].tracking === "NONE" ? "NONE" : products[l.sku].tracking === "SERIAL" ? "SERIAL" : "IMEI",
          })),
        },
      },
    })
    for (const l of lines) {
      await prisma.inventory.update({
        where: { productId_branchId: { productId: products[l.sku].id, branchId: byCode[shop].id } },
        data: { incomingQty: { increment: l.qty } },
      })
    }
  }
  await ensureIncoming("BULK-IN-IWO-01", "IWO", dubai.id, "vault@abutwins.com", 5, [
    { sku: "BULK-IP17PM-512", qty: 8 },
    { sku: "BULK-IP16PM-256", qty: 10 },
  ])
  await ensureIncoming("BULK-IN-BOD-01", "BOD", china.id, "bodija.vault@abutwins.com", 3, [
    { sku: "BULK-S24U-256", qty: 6 },
    { sku: "BULK-NOTE13P-256", qty: 20 },
  ])
  await ensureIncoming("BULK-IN-CHL-01", "CHL", ukUsed.id, "challenge.vault@abutwins.com", 7, [
    { sku: "BULK-MBP14-M3-512-UK", qty: 4 },
    { sku: "BULK-IP14-128-UK", qty: 15 },
  ])

  // ——— Shop to shop transfer (completed) ———
  if (!(await prisma.stockTransfer.findUnique({ where: { transferNumber: "BULK-TR-IWO-CHL-01" } }))) {
    const moveSku = "BULK-CORD-TYPEC"
    const qty = 20
    await prisma.stockTransfer.create({
      data: {
        transferNumber: "BULK-TR-IWO-CHL-01",
        fromBranchId: byCode.IWO.id,
        toBranchId: byCode.CHL.id,
        userId: need("manager@abutwins.com").id,
        status: "RECEIVED",
        notes: "Bulk study · cords sent to Challenge",
        sentAt: daysAgo(4),
        receivedAt: daysAgo(3),
        items: { create: { productId: products[moveSku].id, quantity: qty, receivedQty: qty } },
      },
    })
    await prisma.inventory.update({
      where: { productId_branchId: { productId: products[moveSku].id, branchId: byCode.IWO.id } },
      data: { quantity: { decrement: qty } },
    })
    await prisma.inventory.update({
      where: { productId_branchId: { productId: products[moveSku].id, branchId: byCode.CHL.id } },
      data: { quantity: { increment: qty } },
    })
  }
  if (!(await prisma.stockTransfer.findUnique({ where: { transferNumber: "BULK-TR-BOD-IWO-02" } }))) {
    await prisma.stockTransfer.create({
      data: {
        transferNumber: "BULK-TR-BOD-IWO-02",
        fromBranchId: byCode.BOD.id,
        toBranchId: byCode.IWO.id,
        userId: need("bodija.manager@abutwins.com").id,
        status: "PENDING",
        notes: "Bulk study · pending confirmation at Iwo Road",
        sentAt: daysAgo(1),
        items: { create: { productId: products["BULK-PB-20000"].id, quantity: 10, receivedQty: 0 } },
      },
    })
  }

  // ——— Neighbor fills ———
  async function ensureNeighborFill(fillNumber: string, shop: ShopCode, neighborId: string, customerPhone: string, sku: string, cost: number, sell: number, status: "OPEN" | "SOLD") {
    if (await prisma.neighborFill.findUnique({ where: { fillNumber } })) return
    let saleId: string | null = null
    if (status === "SOLD") {
      const inv = `BULK-INV-NF-${fillNumber.slice(-4)}`
      if (!(await prisma.sale.findUnique({ where: { invoiceNumber: inv } }))) {
        const sale = await prisma.sale.create({
          data: {
            invoiceNumber: inv,
            branchId: byCode[shop].id,
            userId: need(shop === "IWO" ? "cashier@abutwins.com" : shop === "BOD" ? "bodija.cashier@abutwins.com" : "challenge.cashier@abutwins.com").id,
            customerId: customersByPhone[customerPhone].id,
            saleType: "RETAIL",
            status: "COMPLETED",
            subtotal: naira(sell),
            totalAmount: naira(sell),
            paidAmount: naira(sell),
            paymentMethod: "TRANSFER",
            saleDate: daysAgo(2),
            notes: "Neighbor fill",
            items: {
              create: {
                productId: products[sku].id,
                quantity: 1,
                unitPrice: naira(sell),
                totalPrice: naira(sell),
              },
            },
            payments: { create: { amount: naira(sell), method: "TRANSFER", paidAt: daysAgo(2) } },
          },
        })
        saleId = sale.id
        await prisma.financeEntry.create({
          data: {
            branchId: byCode[shop].id,
            account: "BANK",
            type: "INCOME",
            amount: naira(sell),
            reference: inv,
            description: `Neighbor fill ${fillNumber}`,
            createdAt: daysAgo(2),
          },
        })
        await prisma.financeEntry.create({
          data: {
            branchId: byCode[shop].id,
            account: "CASH",
            type: "EXPENSE",
            amount: naira(cost),
            reference: `${fillNumber}-PAY`,
            description: `Paid neighbor ${fillNumber}`,
            createdAt: daysAgo(2),
          },
        })
      }
    }
    await prisma.neighborFill.create({
      data: {
        fillNumber,
        branchId: byCode[shop].id,
        neighborName: neighborId === neighborIwo.id ? neighborIwo.name : neighborBod.name,
        neighborPhone: neighborId === neighborIwo.id ? neighborIwo.phone : neighborBod.phone,
        supplierId: neighborId,
        customerId: customersByPhone[customerPhone].id,
        productId: products[sku].id,
        imei1: studyImei(shop, 9000 + Number(fillNumber.replace(/\D/g, "").slice(-3) || "1")),
        neighborCost: naira(cost),
        sellPrice: naira(sell),
        profit: naira(sell - cost),
        moneySentToNeighbor: status === "SOLD" ? naira(cost) : naira(0),
        saleId,
        status,
        paymentMethod: status === "SOLD" ? "TRANSFER" : null,
        notes: "Bulk study neighbor fill",
        userId: need(shop === "IWO" ? "cashier@abutwins.com" : "bodija.cashier@abutwins.com").id,
        soldAt: status === "SOLD" ? daysAgo(2) : null,
        settledAt: status === "SOLD" ? daysAgo(2) : null,
      },
    })
  }
  await ensureNeighborFill("BULK-NF-IWO-01", "IWO", neighborIwo.id, "08031111008", "BULK-IP16-128", 900_000, 980_000, "SOLD")
  await ensureNeighborFill("BULK-NF-IWO-02", "IWO", neighborIwo.id, "08031111001", "BULK-IP15-128", 800_000, 880_000, "OPEN")
  await ensureNeighborFill("BULK-NF-BOD-01", "BOD", neighborBod.id, "08032221006", "BULK-A55-128", 280_000, 315_000, "SOLD")

  // ——— Repair + return ———
  {
    const repairImei = (unitIdsBySkuShop.get("BULK-IP14-128-UK:IWO") ?? [])[5]
    if (repairImei && !(await prisma.repair.findUnique({ where: { repairNumber: "BULK-RP-IWO-01" } }))) {
      await prisma.imeiRecord.update({ where: { id: repairImei }, data: { status: "FAULTY", notes: "Screen crack · study repair" } })
      await prisma.repair.create({
        data: {
          repairNumber: "BULK-RP-IWO-01",
          imeiId: repairImei,
          customerId: customersByPhone["08031111002"].id,
          branchId: byCode.IWO.id,
          userId: need("engineer@abutwins.com").id,
          issue: "Broken screen after drop",
          diagnosis: "Needs OEM screen",
          repairCost: naira(68_000),
          status: "REPAIRING",
          estimatedCompletion: daysAgo(-3),
          notes: "Bulk study repair",
        },
      })
    }
  }
  {
    const sold = await prisma.sale.findUnique({
      where: { invoiceNumber: "BULK-INV-IWO-2003" },
      include: { items: true },
    })
    if (sold?.items[0]?.imeiId && !(await prisma.stockReturn.findUnique({ where: { returnNumber: "BULK-RT-IWO-01" } }))) {
      await prisma.stockReturn.create({
        data: {
          returnNumber: "BULK-RT-IWO-01",
          customerId: customersByPhone["08031111003"].id,
          saleId: sold.id,
          imeiId: sold.items[0].imeiId,
          branchId: byCode.IWO.id,
          userId: need("cashier@abutwins.com").id,
          reason: "CUSTOMER_DISSATISFACTION",
          outcome: "REFUND",
          refundAmount: naira(845_000),
          status: "PENDING",
          notes: "Bulk study return awaiting approval",
        },
      })
    }
  }

  // ——— Expenses ———
  const expenses: Array<{ num: string; shop: ShopCode; cat: ExpenseCategory; amount: number; desc: string; days: number; email: string }> = [
    { num: "BULK-EXP-IWO-01", shop: "IWO", cat: "RENT", amount: 850_000, desc: "Iwo Road shop rent", days: 15, email: "accountant@abutwins.com" },
    { num: "BULK-EXP-IWO-02", shop: "IWO", cat: "FUEL", amount: 48_000, desc: "Generator diesel", days: 2, email: "manager@abutwins.com" },
    { num: "BULK-EXP-IWO-03", shop: "IWO", cat: "UTILITIES", amount: 65_000, desc: "NEPA / prepaid meter", days: 5, email: "manager@abutwins.com" },
    { num: "BULK-EXP-BOD-01", shop: "BOD", cat: "RENT", amount: 450_000, desc: "Bodija shop rent", days: 15, email: "bodija.manager@abutwins.com" },
    { num: "BULK-EXP-BOD-02", shop: "BOD", cat: "TRANSPORT", amount: 22_000, desc: "Courier to Iwo Road", days: 3, email: "bodija.manager@abutwins.com" },
    { num: "BULK-EXP-CHL-01", shop: "CHL", cat: "RENT", amount: 400_000, desc: "Challenge shop rent", days: 15, email: "challenge.manager@abutwins.com" },
    { num: "BULK-EXP-CHL-02", shop: "CHL", cat: "MISCELLANEOUS", amount: 18_000, desc: "POS paper and bags", days: 1, email: "challenge.manager@abutwins.com" },
    { num: "BULK-EXP-CHL-03", shop: "CHL", cat: "MARKETING", amount: 35_000, desc: "Roadside banner", days: 6, email: "challenge.manager@abutwins.com" },
  ]
  for (const e of expenses) {
    if (await prisma.expense.findUnique({ where: { expenseNumber: e.num } })) continue
    await prisma.expense.create({
      data: {
        expenseNumber: e.num,
        branchId: byCode[e.shop].id,
        userId: need(e.email).id,
        category: e.cat,
        amount: naira(e.amount),
        description: e.desc,
        date: daysAgo(e.days),
        approvedBy: need(e.email).id,
        approvedAt: daysAgo(e.days),
      },
    })
    await prisma.financeEntry.create({
      data: {
        branchId: byCode[e.shop].id,
        account: "CASH",
        type: "EXPENSE",
        amount: naira(e.amount),
        reference: e.num,
        description: e.desc,
        createdAt: daysAgo(e.days),
      },
    })
  }

  // ——— Day closes (yesterday) so Sell now can open ———
  for (const shop of ["IWO", "BOD", "CHL"] as ShopCode[]) {
    const businessDate = watDay(1)
    const existing = await prisma.dayClose.findFirst({ where: { branchId: byCode[shop].id, businessDate } })
    if (existing) continue
    const manager =
      shop === "IWO" ? "manager@abutwins.com" : shop === "BOD" ? "bodija.manager@abutwins.com" : "challenge.manager@abutwins.com"
    await prisma.dayClose.create({
      data: {
        branchId: byCode[shop].id,
        userId: need(manager).id,
        closeDate: daysAgo(1),
        businessDate,
        expectedCash: naira(150_000),
        countedCash: naira(150_000),
        variance: naira(0),
        transferTotal: naira(500_000),
        posTotal: naira(300_000),
        creditTotal: naira(50_000),
        saleCount: 3,
        notes: "Bulk study · prior day closed",
      },
    })
  }

  // ——— Stock count with variance ———
  if (!(await prisma.reconciliation.findFirst({ where: { notes: "BULK-RECON-IWO-01" } }))) {
    const recon = await prisma.reconciliation.create({
      data: {
        branchId: byCode.IWO.id,
        userId: need("manager@abutwins.com").id,
        startDate: daysAgo(1),
        endDate: daysAgo(1),
        status: "PENDING_APPROVAL",
        totalExpected: naira(117),
        totalCounted: naira(113),
        variance: naira(-4),
        notes: "BULK-RECON-IWO-01",
        items: {
          create: [
            {
              productId: products["BULK-CORD-TYPEC"].id,
              expectedQty: 100,
              countedQty: 96,
              variance: -4,
              varianceValue: naira(-4 * 1_500),
              reason: "Short on shelf count",
            },
            {
              productId: products["BULK-IP15-128"].id,
              expectedQty: 17,
              countedQty: 17,
              variance: 0,
              varianceValue: naira(0),
            },
          ],
        },
      },
    })
    await prisma.approval.create({
      data: {
        type: "RECONCILIATION",
        status: "PENDING",
        requestedBy: need("manager@abutwins.com").id,
        entityType: "Reconciliation",
        entityId: recon.id,
        reason: "Cord count short by 4 · study approval",
      },
    })
  }

  // ——— Notifications ———
  const notifSeeds = [
    {
      title: "BULK-NOTE-LOW-IWO",
      userId: () => need("manager@abutwins.com").id,
      message: "Type-C cords are running low after the Challenge transfer. Reorder from Ibadan Bulk Accessories.",
      type: "LOW_STOCK" as const,
      actionUrl: "/inventory",
    },
    {
      title: "BULK-NOTE-TRANSFER",
      userId: () => need("manager@abutwins.com").id,
      message: "Bodija sent power banks (BULK-TR-BOD-IWO-02). Confirm arrival on Shop to shop.",
      type: "TRANSFER" as const,
      actionUrl: "/transfers",
    },
    {
      title: "BULK-NOTE-OWED",
      userId: () => need("accountant@abutwins.com").id,
      message: "Supplier bills still owed: BULK-PO-IWO-CHINA-OWED and BULK-PO-BOD-UK-OWED.",
      type: "DUE_PAYMENT" as const,
      actionUrl: "/purchases",
    },
  ]
  for (const n of notifSeeds) {
    if (await prisma.notification.findFirst({ where: { title: n.title } })) continue
    await prisma.notification.create({
      data: {
        userId: n.userId(),
        title: n.title,
        message: n.message,
        type: n.type,
        actionUrl: n.actionUrl,
      },
    })
  }

  await prisma.setting.upsert({
    where: { key: "demo.ibadan.study" },
    update: { value: new Date().toISOString() },
    create: { key: "demo.ibadan.study", value: new Date().toISOString(), description: "Bulk Ibadan study data last loaded" },
  })

  const summary = await Promise.all(
    (["IWO", "BOD", "CHL"] as ShopCode[]).map(async (code) => {
      const id = byCode[code].id
      const [phonesIn, sales, purchases, customers, productsActive] = await Promise.all([
        prisma.imeiRecord.count({ where: { branchId: id, status: "IN_STOCK" } }),
        prisma.sale.count({ where: { branchId: id } }),
        prisma.purchase.count({ where: { branchId: id } }),
        prisma.customer.count({ where: { branchId: id } }),
        prisma.product.count({ where: { isActive: true, sku: { startsWith: "BULK-" } } }),
      ])
      return { code, phonesIn, sales, purchases, customers, productsActive }
    })
  )
  const supplierCount = await prisma.supplier.count({ where: { isActive: true } })

  console.log(`New In shop units created this run: ${unitsCreated}`)
  console.log(`Active BULK catalog SKUs: ${summary[0]?.productsActive ?? 0}`)
  console.log(`Suppliers on books: ${supplierCount}`)
  for (const row of summary) {
    console.log(
      `  ${row.code}: ${row.phonesIn} units In shop · ${row.sales} sales · ${row.purchases} bills · ${row.customers} customers`
    )
  }
  console.log("Covered: Upload/PO trail, Coming lots, transfers, neighbor fills, sales, repairs, returns, expenses, day closes, approvals, alerts.")
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
