/**
 * Safe study data for the three Ibadan shops.
 *
 * Does NOT wipe anything. Upserts by natural keys (SKU, phone, invoice, IMEI).
 * Safe to re-run on production. Requires seed-users shops IWO / BOD / CHL first.
 *
 * Run: npm run db:seed-demo
 * Prod: railway run npm run db:seed-demo
 */
import { PrismaClient, type ProductCondition, type ProductTracking } from "@prisma/client"

const prisma = new PrismaClient()

function naira(value: number) {
  return value.toFixed(2)
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/** Stable study IMEIs so re-runs skip duplicates. 15 digits. */
function studyImei(shopCode: string, seq: number) {
  const shop = shopCode === "IWO" ? "1" : shopCode === "BOD" ? "2" : "3"
  return `359900${shop}${String(seq).padStart(8, "0")}`
}

async function upsertBrand(name: string) {
  const existing = await prisma.brand.findFirst({ where: { name } })
  if (existing) return existing
  return prisma.brand.create({ data: { name } })
}

async function upsertCategory(name: string) {
  const existing = await prisma.category.findFirst({ where: { name } })
  if (existing) return existing
  return prisma.category.create({ data: { name } })
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
      data: {
        name: data.name,
        contactPerson: data.contactPerson,
        email: data.email,
        address: data.address,
        country: data.country,
        city: data.city,
        kind: data.kind ?? "SUPPLIER",
        isActive: true,
      },
    })
  }
  return prisma.supplier.create({
    data: {
      name: data.name,
      phone: data.phone,
      contactPerson: data.contactPerson,
      email: data.email,
      address: data.address,
      country: data.country,
      city: data.city,
      kind: data.kind ?? "SUPPLIER",
    },
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
  const existing = await prisma.product.findUnique({ where: { sku: data.sku } })
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
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
        description: data.description ?? existing.description,
        isActive: true,
      },
    })
  }
  return prisma.product.create({
    data: {
      sku: data.sku,
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
      description: data.description ?? "Study data for Abu Twins shops",
    },
  })
}

async function ensureInventoryZero(productId: string, branchIds: string[]) {
  for (const branchId of branchIds) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId } },
      update: {},
      create: { productId, branchId, quantity: 0, minStock: 2 },
    })
  }
}

async function main() {
  console.log("Loading Ibadan study data (safe upsert, no wipe)...")

  const branches = await prisma.branch.findMany({
    where: { code: { in: ["IWO", "BOD", "CHL"] }, isActive: true },
  })
  const byCode = Object.fromEntries(branches.map((b) => [b.code, b])) as Record<
    string,
    (typeof branches)[number]
  >
  if (!byCode.IWO || !byCode.BOD || !byCode.CHL) {
    throw new Error("IWO, BOD, and CHL shops must exist first. Run: npm run db:seed-users")
  }

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
          "bodija.cashier@abutwins.com",
          "bodija.manager@abutwins.com",
          "bodija.vault@abutwins.com",
          "challenge.cashier@abutwins.com",
          "challenge.manager@abutwins.com",
          "challenge.vault@abutwins.com",
        ],
      },
    },
  })
  const userByEmail = Object.fromEntries(users.map((u) => [u.email, u]))
  const need = (email: string) => {
    const u = userByEmail[email]
    if (!u) throw new Error(`Missing user ${email}. Run db:seed-users first.`)
    return u
  }

  const [apple, samsung, tecno, infinix, generic] = await Promise.all([
    upsertBrand("Apple"),
    upsertBrand("Samsung"),
    upsertBrand("Tecno"),
    upsertBrand("Infinix"),
    upsertBrand("Generic"),
  ])
  const [phones, laptops, accessories, screens] = await Promise.all([
    upsertCategory("Phones"),
    upsertCategory("Laptops"),
    upsertCategory("Accessories"),
    upsertCategory("Screens"),
  ])

  const dubai = await upsertSupplier({
    name: "Dubai Phone House",
    phone: "+971500001001",
    contactPerson: "Hassan Al Farsi",
    email: "orders@dubaiphone.ae",
    address: "Al Ras, Deira, Dubai",
    country: "UAE",
    city: "Dubai",
  })
  const china = await upsertSupplier({
    name: "Shenzhen Mobile Link",
    phone: "+8613800010002",
    contactPerson: "Li Wei",
    email: "export@szmobile.cn",
    address: "Huaqiangbei, Shenzhen",
    country: "China",
    city: "Shenzhen",
  })
  const lagos = await upsertSupplier({
    name: "Alaba Twin Supplies",
    phone: "+2348025552001",
    contactPerson: "Tunde Bakare",
    email: "tunde@alabatwin.ng",
    address: "Alaba International, Lagos",
    country: "Nigeria",
    city: "Lagos",
  })
  const neighbor = await upsertSupplier({
    name: "Next Door Gadget (Neighbor)",
    phone: "+2348035553001",
    contactPerson: "Bola Ade",
    email: "bola@nextdoor.ng",
    address: "Beside Iwo Road shop",
    country: "Nigeria",
    city: "Ibadan",
    kind: "NEIGHBOR",
  })

  const ip17 = await upsertProduct({
    sku: "DEMO-IP17PM-256",
    name: "iPhone 17 Pro Max 256GB",
    brandId: apple.id,
    categoryId: phones.id,
    tracking: "IMEI",
    condition: "BRAND_NEW",
    color: "Cosmic Orange",
    storage: "256GB",
    costPrice: 1_650_000,
    minimumPrice: 1_780_000,
    sellingPrice: 1_850_000,
    description: "Study phone · flagship",
  })
  const ip15 = await upsertProduct({
    sku: "DEMO-IP15-128",
    name: "iPhone 15 128GB",
    brandId: apple.id,
    categoryId: phones.id,
    tracking: "IMEI",
    condition: "BRAND_NEW",
    color: "Black",
    storage: "128GB",
    costPrice: 780_000,
    minimumPrice: 860_000,
    sellingPrice: 920_000,
  })
  const s24 = await upsertProduct({
    sku: "DEMO-S24-256",
    name: "Samsung Galaxy S24 256GB",
    brandId: samsung.id,
    categoryId: phones.id,
    tracking: "IMEI",
    condition: "BRAND_NEW",
    color: "Onyx Black",
    storage: "256GB",
    costPrice: 720_000,
    minimumPrice: 800_000,
    sellingPrice: 865_000,
  })
  const camon = await upsertProduct({
    sku: "DEMO-CAMON30-256",
    name: "Tecno Camon 30 256GB",
    brandId: tecno.id,
    categoryId: phones.id,
    tracking: "IMEI",
    condition: "BRAND_NEW",
    color: "Basaltic Dark",
    storage: "256GB",
    costPrice: 145_000,
    minimumPrice: 168_000,
    sellingPrice: 185_000,
  })
  const hot = await upsertProduct({
    sku: "DEMO-HOT40-256",
    name: "Infinix Hot 40 256GB",
    brandId: infinix.id,
    categoryId: phones.id,
    tracking: "IMEI",
    condition: "BRAND_NEW",
    color: "Green",
    storage: "256GB",
    costPrice: 98_000,
    minimumPrice: 115_000,
    sellingPrice: 128_000,
  })
  const macbook = await upsertProduct({
    sku: "DEMO-MBA-M2-256",
    name: "MacBook Air M2 256GB",
    brandId: apple.id,
    categoryId: laptops.id,
    tracking: "SERIAL",
    condition: "BRAND_NEW",
    color: "Midnight",
    storage: "256GB",
    costPrice: 980_000,
    minimumPrice: 1_080_000,
    sellingPrice: 1_150_000,
    description: "Study laptop · serial tracked",
  })
  const cord = await upsertProduct({
    sku: "DEMO-CORD-TYPEC",
    name: "Type-C charger cord",
    brandId: generic.id,
    categoryId: accessories.id,
    tracking: "NONE",
    condition: "BRAND_NEW",
    color: "Black",
    costPrice: 1_500,
    minimumPrice: 2_000,
    sellingPrice: 2_500,
    warrantyDays: 90,
    description: "Study accessory · piece count",
  })
  const screen = await upsertProduct({
    sku: "DEMO-SCR-IP15",
    name: "iPhone 15 screen (OEM)",
    brandId: apple.id,
    categoryId: screens.id,
    tracking: "NONE",
    condition: "BRAND_NEW",
    costPrice: 45_000,
    minimumPrice: 55_000,
    sellingPrice: 68_000,
    warrantyDays: 90,
  })

  const allBranchIds = [byCode.IWO.id, byCode.BOD.id, byCode.CHL.id]
  for (const p of [ip17, ip15, s24, camon, hot, macbook, cord, screen]) {
    await ensureInventoryZero(p.id, allBranchIds)
  }

  const customers = {
    iwoAde: await upsertCustomer({
      name: "Adewale Okonkwo",
      phone: "08031110001",
      branchId: byCode.IWO.id,
      address: "Iwo Road, Ibadan",
      creditLimit: 500_000,
    }),
    iwoFunmi: await upsertCustomer({
      name: "Funmilayo Adebayo",
      phone: "08031110002",
      branchId: byCode.IWO.id,
      address: "Gate, Ibadan",
    }),
    bodTunde: await upsertCustomer({
      name: "Tunde Salami",
      phone: "08032220001",
      branchId: byCode.BOD.id,
      address: "Bodija Market",
      creditLimit: 200_000,
    }),
    bodNgozi: await upsertCustomer({
      name: "Ngozi Eze",
      phone: "08032220002",
      branchId: byCode.BOD.id,
    }),
    chlKemi: await upsertCustomer({
      name: "Kemi Oladipo",
      phone: "08033330001",
      branchId: byCode.CHL.id,
      address: "Challenge, Ibadan",
    }),
    chlIbrahim: await upsertCustomer({
      name: "Ibrahim Yusuf",
      phone: "08033330002",
      branchId: byCode.CHL.id,
      creditLimit: 150_000,
    }),
  }

  type UnitPlan = {
    shop: "IWO" | "BOD" | "CHL"
    productId: string
    supplierId: string
    count: number
    startSeq: number
    serialPrefix?: string
  }

  const stockPlans: UnitPlan[] = [
    { shop: "IWO", productId: ip17.id, supplierId: dubai.id, count: 4, startSeq: 101 },
    { shop: "IWO", productId: ip15.id, supplierId: dubai.id, count: 5, startSeq: 111 },
    { shop: "IWO", productId: s24.id, supplierId: china.id, count: 4, startSeq: 121 },
    { shop: "IWO", productId: camon.id, supplierId: lagos.id, count: 6, startSeq: 131 },
    { shop: "IWO", productId: macbook.id, supplierId: dubai.id, count: 2, startSeq: 141, serialPrefix: "MBA-IWO" },
    { shop: "BOD", productId: ip15.id, supplierId: dubai.id, count: 4, startSeq: 201 },
    { shop: "BOD", productId: s24.id, supplierId: china.id, count: 3, startSeq: 211 },
    { shop: "BOD", productId: hot.id, supplierId: lagos.id, count: 8, startSeq: 221 },
    { shop: "BOD", productId: camon.id, supplierId: lagos.id, count: 5, startSeq: 231 },
    { shop: "BOD", productId: macbook.id, supplierId: dubai.id, count: 1, startSeq: 241, serialPrefix: "MBA-BOD" },
    { shop: "CHL", productId: ip17.id, supplierId: dubai.id, count: 3, startSeq: 301 },
    { shop: "CHL", productId: ip15.id, supplierId: dubai.id, count: 3, startSeq: 311 },
    { shop: "CHL", productId: hot.id, supplierId: lagos.id, count: 7, startSeq: 321 },
    { shop: "CHL", productId: s24.id, supplierId: china.id, count: 3, startSeq: 331 },
    { shop: "CHL", productId: macbook.id, supplierId: dubai.id, count: 1, startSeq: 341, serialPrefix: "MBA-CHL" },
  ]

  let unitsCreated = 0
  const unitsByKey = new Map<string, string[]>() // productId:branchId -> imei ids

  for (const plan of stockPlans) {
    const branch = byCode[plan.shop]
    const ids: string[] = []
    for (let i = 0; i < plan.count; i++) {
      const imei1 = studyImei(plan.shop, plan.startSeq + i)
      const existing = await prisma.imeiRecord.findUnique({ where: { imei1 } })
      if (existing) {
        ids.push(existing.id)
        continue
      }
      const serial = plan.serialPrefix
        ? `${plan.serialPrefix}-${String(plan.startSeq + i).padStart(4, "0")}`
        : `SN-DEMO-${plan.shop}-${plan.startSeq + i}`
      const row = await prisma.imeiRecord.create({
        data: {
          imei1,
          imei2: studyImei(plan.shop, plan.startSeq + i + 5000),
          serialNumber: serial,
          productId: plan.productId,
          branchId: branch.id,
          supplierId: plan.supplierId,
          status: "IN_STOCK",
          notes: "Study data · In shop for client walkthrough",
        },
      })
      ids.push(row.id)
      unitsCreated += 1
    }
    unitsByKey.set(`${plan.productId}:${branch.id}`, ids)
  }

  // Piece counts on the shelf (cords and screens).
  const piecePlans: Array<{ shop: "IWO" | "BOD" | "CHL"; productId: string; qty: number }> = [
    { shop: "IWO", productId: cord.id, qty: 40 },
    { shop: "IWO", productId: screen.id, qty: 8 },
    { shop: "BOD", productId: cord.id, qty: 25 },
    { shop: "BOD", productId: screen.id, qty: 5 },
    { shop: "CHL", productId: cord.id, qty: 30 },
    { shop: "CHL", productId: screen.id, qty: 6 },
  ]
  for (const plan of piecePlans) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: plan.productId, branchId: byCode[plan.shop].id } },
      update: { quantity: plan.qty, minStock: 5, lastStockCheck: new Date() },
      create: {
        productId: plan.productId,
        branchId: byCode[plan.shop].id,
        quantity: plan.qty,
        minStock: 5,
        lastStockCheck: new Date(),
      },
    })
  }

  // Align IMEI product shelf counts with In shop units.
  for (const plan of stockPlans) {
    const branchId = byCode[plan.shop].id
    const inShop = await prisma.imeiRecord.count({
      where: { productId: plan.productId, branchId, status: "IN_STOCK" },
    })
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: plan.productId, branchId } },
      update: { quantity: inShop, minStock: 2, lastStockCheck: new Date() },
      create: { productId: plan.productId, branchId, quantity: inShop, minStock: 2 },
    })
  }

  async function ensurePurchase(opts: {
    invoiceNumber: string
    supplierId: string
    branchId: string
    userId: string
    totalAmount: number
    paidAmount: number
    source?: string | null
    notes: string
    days: number
    lines: Array<{ productId: string; quantity: number; costPrice: number }>
    linkImeiIds?: string[]
  }) {
    const existing = await prisma.purchase.findUnique({ where: { invoiceNumber: opts.invoiceNumber } })
    if (existing) return existing

    const purchase = await prisma.purchase.create({
      data: {
        invoiceNumber: opts.invoiceNumber,
        supplierId: opts.supplierId,
        branchId: opts.branchId,
        userId: opts.userId,
        status: "RECEIVED",
        totalAmount: naira(opts.totalAmount),
        paidAmount: naira(opts.paidAmount),
        paymentMethod: opts.paidAmount >= opts.totalAmount ? "TRANSFER" : opts.paidAmount > 0 ? "TRANSFER" : null,
        source: opts.source ?? null,
        sessionOpen: false,
        receivedDate: daysAgo(opts.days),
        createdAt: daysAgo(opts.days),
        notes: opts.notes,
        originCountry: null,
        originCity: null,
        items: {
          create: opts.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            receivedQty: line.quantity,
            costPrice: naira(line.costPrice),
            totalAmount: naira(line.quantity * line.costPrice),
          })),
        },
      },
    })

    if (opts.linkImeiIds?.length) {
      await prisma.imeiRecord.updateMany({
        where: { id: { in: opts.linkImeiIds } },
        data: { purchaseId: purchase.id },
      })
    }
    return purchase
  }

  const iwoIp17 = unitsByKey.get(`${ip17.id}:${byCode.IWO.id}`) ?? []
  const iwoIp15 = unitsByKey.get(`${ip15.id}:${byCode.IWO.id}`) ?? []
  const bodHot = unitsByKey.get(`${hot.id}:${byCode.BOD.id}`) ?? []
  const chlIp17 = unitsByKey.get(`${ip17.id}:${byCode.CHL.id}`) ?? []

  await ensurePurchase({
    invoiceNumber: "DEMO-PO-IWO-PAID-001",
    supplierId: dubai.id,
    branchId: byCode.IWO.id,
    userId: need("uploader@abutwins.com").id,
    totalAmount: 4 * 1_650_000 + 5 * 780_000,
    paidAmount: 4 * 1_650_000 + 5 * 780_000,
    source: "UPLOAD_STOCK",
    notes: "Study bill · Loaded on Upload stock · Marked paid. Dubai phones for Iwo Road.",
    days: 10,
    lines: [
      { productId: ip17.id, quantity: 4, costPrice: 1_650_000 },
      { productId: ip15.id, quantity: 5, costPrice: 780_000 },
    ],
    linkImeiIds: [...iwoIp17, ...iwoIp15],
  })

  await ensurePurchase({
    invoiceNumber: "DEMO-PO-IWO-OWED-002",
    supplierId: china.id,
    branchId: byCode.IWO.id,
    userId: need("vault@abutwins.com").id,
    totalAmount: 4 * 720_000,
    paidAmount: 0,
    source: "UPLOAD_STOCK",
    notes: "Study bill · Loaded on Upload stock · Not paid yet. Shows on Finance still owed.",
    days: 4,
    lines: [{ productId: s24.id, quantity: 4, costPrice: 720_000 }],
    linkImeiIds: unitsByKey.get(`${s24.id}:${byCode.IWO.id}`) ?? [],
  })

  await ensurePurchase({
    invoiceNumber: "DEMO-PO-BOD-PARTIAL-003",
    supplierId: lagos.id,
    branchId: byCode.BOD.id,
    userId: need("bodija.vault@abutwins.com").id,
    totalAmount: 8 * 98_000 + 5 * 145_000,
    paidAmount: 400_000,
    notes: "Study bill · Bodija volume phones · Part paid.",
    days: 7,
    lines: [
      { productId: hot.id, quantity: 8, costPrice: 98_000 },
      { productId: camon.id, quantity: 5, costPrice: 145_000 },
    ],
    linkImeiIds: [
      ...(unitsByKey.get(`${hot.id}:${byCode.BOD.id}`) ?? []),
      ...(unitsByKey.get(`${camon.id}:${byCode.BOD.id}`) ?? []),
    ],
  })

  await ensurePurchase({
    invoiceNumber: "DEMO-PO-CHL-PAID-004",
    supplierId: dubai.id,
    branchId: byCode.CHL.id,
    userId: need("challenge.vault@abutwins.com").id,
    totalAmount: 3 * 1_650_000,
    paidAmount: 3 * 1_650_000,
    source: "UPLOAD_STOCK",
    notes: "Study bill · Challenge iPhone 17 Pro Max carton · Paid.",
    days: 6,
    lines: [{ productId: ip17.id, quantity: 3, costPrice: 1_650_000 }],
    linkImeiIds: chlIp17,
  })

  async function ensureSale(opts: {
    invoice: string
    branchId: string
    userId: string
    customerId: string
    imeiId: string
    productId: string
    price: number
    method: "CASH" | "TRANSFER" | "POS" | "CREDIT"
    paid: number
    days: number
  }) {
    const existing = await prisma.sale.findUnique({ where: { invoiceNumber: opts.invoice } })
    if (existing) return existing

    const imei = await prisma.imeiRecord.findUnique({ where: { id: opts.imeiId } })
    if (!imei || imei.status !== "IN_STOCK") {
      console.log(`  skip sale ${opts.invoice}: unit not In shop`)
      return null
    }

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: opts.invoice,
        branchId: opts.branchId,
        userId: opts.userId,
        customerId: opts.customerId,
        saleType: "RETAIL",
        status: "COMPLETED",
        subtotal: naira(opts.price),
        totalAmount: naira(opts.price),
        paidAmount: naira(opts.paid),
        paymentMethod: opts.method,
        saleDate: daysAgo(opts.days),
        items: {
          create: {
            productId: opts.productId,
            imeiId: opts.imeiId,
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
      where: { id: opts.imeiId },
      data: { status: "SOLD", customerId: opts.customerId, saleId: sale.id },
    })
    await prisma.inventory.update({
      where: { productId_branchId: { productId: opts.productId, branchId: opts.branchId } },
      data: { quantity: { decrement: 1 } },
    })
    if (opts.paid > 0) {
      await prisma.financeEntry.create({
        data: {
          branchId: opts.branchId,
          account: opts.method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: naira(opts.paid),
          reference: opts.invoice,
          description: `Study sale ${opts.invoice}`,
          createdAt: daysAgo(opts.days),
        },
      })
    }
    if (opts.paid < opts.price) {
      await prisma.ledgerEntry.create({
        data: {
          customerId: opts.customerId,
          type: "SALE",
          amount: naira(opts.price - opts.paid),
          balance: naira(opts.price - opts.paid),
          reference: opts.invoice,
          description: `Balance on ${opts.invoice}`,
          createdAt: daysAgo(opts.days),
        },
      })
    }
    return sale
  }

  // Sell one unit per shop so Sales, Finance, and Phone IMEIs show Sold.
  const saleIwo = iwoIp15[0]
  const saleBod = bodHot[0]
  const saleChl = (unitsByKey.get(`${ip15.id}:${byCode.CHL.id}`) ?? [])[0]
  const saleIwoS24 = (unitsByKey.get(`${s24.id}:${byCode.IWO.id}`) ?? [])[0]

  if (saleIwo) {
    await ensureSale({
      invoice: "DEMO-INV-IWO-1001",
      branchId: byCode.IWO.id,
      userId: need("cashier@abutwins.com").id,
      customerId: customers.iwoAde.id,
      imeiId: saleIwo,
      productId: ip15.id,
      price: 920_000,
      method: "TRANSFER",
      paid: 920_000,
      days: 2,
    })
  }
  if (saleIwoS24) {
    await ensureSale({
      invoice: "DEMO-INV-IWO-1002",
      branchId: byCode.IWO.id,
      userId: need("sales@abutwins.com").id,
      customerId: customers.iwoFunmi.id,
      imeiId: saleIwoS24,
      productId: s24.id,
      price: 865_000,
      method: "POS",
      paid: 865_000,
      days: 1,
    })
  }
  if (saleBod) {
    await ensureSale({
      invoice: "DEMO-INV-BOD-1001",
      branchId: byCode.BOD.id,
      userId: need("bodija.cashier@abutwins.com").id,
      customerId: customers.bodTunde.id,
      imeiId: saleBod,
      productId: hot.id,
      price: 128_000,
      method: "CASH",
      paid: 128_000,
      days: 3,
    })
  }
  if (saleChl) {
    await ensureSale({
      invoice: "DEMO-INV-CHL-1001",
      branchId: byCode.CHL.id,
      userId: need("challenge.cashier@abutwins.com").id,
      customerId: customers.chlKemi.id,
      imeiId: saleChl,
      productId: ip15.id,
      price: 920_000,
      method: "CREDIT",
      paid: 200_000,
      days: 1,
    })
  }

  // Neighbor shop fill at Iwo Road (sold).
  const fillNumber = "DEMO-NF-IWO-001"
  const existingFill = await prisma.neighborFill.findUnique({ where: { fillNumber } })
  if (!existingFill) {
    const neighborCost = 880_000
    const sellPrice = 920_000
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: "DEMO-INV-IWO-NF-001",
        branchId: byCode.IWO.id,
        userId: need("cashier@abutwins.com").id,
        customerId: customers.iwoAde.id,
        saleType: "RETAIL",
        status: "COMPLETED",
        subtotal: naira(sellPrice),
        totalAmount: naira(sellPrice),
        paidAmount: naira(sellPrice),
        paymentMethod: "TRANSFER",
        saleDate: daysAgo(5),
        notes: "Neighbor shop fill study sale",
        items: {
          create: {
            productId: ip15.id,
            quantity: 1,
            unitPrice: naira(sellPrice),
            totalPrice: naira(sellPrice),
          },
        },
        payments: {
          create: {
            amount: naira(sellPrice),
            method: "TRANSFER",
            paidAt: daysAgo(5),
          },
        },
      },
    })
    await prisma.neighborFill.create({
      data: {
        fillNumber,
        branchId: byCode.IWO.id,
        neighborName: neighbor.name,
        neighborPhone: neighbor.phone,
        supplierId: neighbor.id,
        customerId: customers.iwoAde.id,
        productId: ip15.id,
        imei1: "3599001990000001",
        neighborCost: naira(neighborCost),
        sellPrice: naira(sellPrice),
        profit: naira(sellPrice - neighborCost),
        moneySentToNeighbor: naira(neighborCost),
        saleId: sale.id,
        status: "SOLD",
        paymentMethod: "TRANSFER",
        notes: "Study neighbor fill · collected next door for named customer",
        userId: need("cashier@abutwins.com").id,
        soldAt: daysAgo(5),
        settledAt: daysAgo(5),
      },
    })
    await prisma.financeEntry.create({
      data: {
        branchId: byCode.IWO.id,
        account: "BANK",
        type: "INCOME",
        amount: naira(sellPrice),
        reference: "DEMO-INV-IWO-NF-001",
        description: "Neighbor fill customer payment",
        createdAt: daysAgo(5),
      },
    })
    await prisma.financeEntry.create({
      data: {
        branchId: byCode.IWO.id,
        account: "CASH",
        type: "EXPENSE",
        amount: naira(neighborCost),
        reference: "DEMO-NF-PAY-001",
        description: "Paid neighbor for fill DEMO-NF-IWO-001",
        createdAt: daysAgo(5),
      },
    })
  }

  // Shop expenses so Money in & out has outflow too.
  const expenseSeeds = [
    { ref: "DEMO-EXP-IWO-001", branch: "IWO" as const, amount: 25_000, desc: "Generator fuel · Iwo Road", days: 2, category: "FUEL" as const },
    { ref: "DEMO-EXP-BOD-001", branch: "BOD" as const, amount: 18_000, desc: "Shop cleaning · Bodija", days: 3, category: "MISCELLANEOUS" as const },
    { ref: "DEMO-EXP-CHL-001", branch: "CHL" as const, amount: 22_000, desc: "POS roll paper · Challenge", days: 1, category: "MISCELLANEOUS" as const },
  ]
  for (const row of expenseSeeds) {
    const exists = await prisma.expense.findUnique({ where: { expenseNumber: row.ref } })
    if (exists) continue
    const branchId = byCode[row.branch].id
    const managerEmail =
      row.branch === "IWO"
        ? "manager@abutwins.com"
        : row.branch === "BOD"
          ? "bodija.manager@abutwins.com"
          : "challenge.manager@abutwins.com"
    await prisma.expense.create({
      data: {
        expenseNumber: row.ref,
        branchId,
        userId: need(managerEmail).id,
        category: row.category,
        amount: naira(row.amount),
        description: row.desc,
        date: daysAgo(row.days),
        approvedBy: need(managerEmail).id,
        approvedAt: daysAgo(row.days),
      },
    })
    await prisma.financeEntry.create({
      data: {
        branchId,
        account: "CASH",
        type: "EXPENSE",
        amount: naira(row.amount),
        reference: row.ref,
        description: row.desc,
        createdAt: daysAgo(row.days),
      },
    })
  }

  await prisma.setting.upsert({
    where: { key: "demo.ibadan.study" },
    update: { value: new Date().toISOString() },
    create: {
      key: "demo.ibadan.study",
      value: new Date().toISOString(),
      description: "Ibadan study data last loaded",
    },
  })

  const summary = await Promise.all(
    (["IWO", "BOD", "CHL"] as const).map(async (code) => {
      const id = byCode[code].id
      const [phonesIn, sales, purchases, customersCount] = await Promise.all([
        prisma.imeiRecord.count({ where: { branchId: id, status: "IN_STOCK" } }),
        prisma.sale.count({ where: { branchId: id } }),
        prisma.purchase.count({ where: { branchId: id } }),
        prisma.customer.count({ where: { branchId: id } }),
      ])
      return { code, phonesIn, sales, purchases, customersCount }
    })
  )

  console.log(`Created ${unitsCreated} new In shop units (existing study IMEIs were left alone).`)
  console.log("Per shop:")
  for (const row of summary) {
    console.log(
      `  ${row.code}: ${row.phonesIn} phones In shop · ${row.sales} sales · ${row.purchases} supplier bills · ${row.customersCount} customers`
    )
  }
  console.log("Study invoices: DEMO-PO-*, DEMO-INV-*, DEMO-NF-IWO-001")
  console.log("Done. Client can sign in and walk Upload stock, Goods from supplier, Sell now, Finance.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
