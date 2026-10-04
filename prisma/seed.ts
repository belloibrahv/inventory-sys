import { PrismaClient, type Prisma } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

function naira(value: number) {
  return value.toFixed(2)
}

async function main() {
  console.log("Seeding AbuTwins Nexus...")

  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.reconciliationItem.deleteMany()
  await prisma.reconciliation.deleteMany()
  await prisma.financeEntry.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.stockReturn.deleteMany()
  await prisma.repair.deleteMany()
  await prisma.swap.deleteMany()
  await prisma.imeiRecord.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.purchaseItem.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.transferItem.deleteMany()
  await prisma.stockTransfer.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.priceHistory.deleteMany()
  await prisma.inventory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.user.deleteMany()
  await prisma.brand.deleteMany()
  await prisma.category.deleteMany()
  await prisma.branch.deleteMany()
  await prisma.setting.deleteMany()

  // The three Abu Twins shops, as seed-users.ts sets them up on the live system.
  const iwoRoad = await prisma.branch.create({
    data: {
      name: "Iwo Road, Ibadan",
      code: "IWO",
      address: "Iwo Road, Ibadan, Oyo State",
      phone: "07062454854",
      email: "iworoad@abutwins.com",
      isHq: true,
    },
  })
  const bodija = await prisma.branch.create({
    data: {
      name: "Bodija, Ibadan",
      code: "BOD",
      address: "Bodija, Ibadan, Oyo State",
      phone: "07062454854",
      email: "bodija@abutwins.com",
    },
  })
  const challenge = await prisma.branch.create({
    data: {
      name: "Challenge, Ibadan",
      code: "CHL",
      address: "Challenge, Ibadan, Oyo State",
      phone: "07062454854",
      email: "challenge@abutwins.com",
    },
  })

  const password = (plain: string) => bcrypt.hash(plain, 10)

  const [admin, ceo, auditor, accountant, manager, vault, cashier, sales, engineer] =
    await Promise.all([
      prisma.user.create({
        data: {
          email: "admin@abutwins.com",
          password: await password("admin123"),
          name: "TechVaults Admin",
          role: "SUPER_ADMIN",
        },
      }),
      prisma.user.create({
        data: {
          email: "ceo@abutwins.com",
          password: await password("ceo123"),
          name: "Abu Twins",
          role: "CEO",
        },
      }),
      prisma.user.create({
        data: {
          email: "auditor@abutwins.com",
          password: await password("auditor123"),
          name: "Amaka Okonkwo",
          role: "AUDITOR",
        },
      }),
      prisma.user.create({
        data: {
          email: "accountant@abutwins.com",
          password: await password("accountant123"),
          name: "Chinedu Bassey",
          role: "ACCOUNTANT",
          branchId: iwoRoad.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "manager@abutwins.com",
          password: await password("manager123"),
          name: "Halima Yusuf",
          role: "BRANCH_MANAGER",
          branchId: iwoRoad.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "vault@abutwins.com",
          password: await password("vault123"),
          name: "Ibrahim Lawal",
          role: "VAULT_MANAGER",
          branchId: iwoRoad.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "cashier@abutwins.com",
          password: await password("cashier123"),
          name: "Blessing Adeyemi",
          role: "CASHIER",
          branchId: iwoRoad.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "sales@abutwins.com",
          password: await password("sales123"),
          name: "Tunde Adebayo",
          role: "SALES_EXECUTIVE",
          branchId: iwoRoad.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "engineer@abutwins.com",
          password: await password("engineer123"),
          name: "Kelechi Nwosu",
          role: "ENGINEER",
          branchId: iwoRoad.id,
        },
      }),
    ])

  await prisma.user.create({
    data: {
      email: "bodija.manager@abutwins.com",
      password: await password("manager123"),
      name: "Fatima Sule",
      role: "BRANCH_MANAGER",
      branchId: bodija.id,
    },
  })

  const [phones, tablets, accessories] = await Promise.all([
    prisma.category.create({ data: { name: "Smartphones", description: "Phones and foldables" } }),
    prisma.category.create({ data: { name: "Tablets", description: "iPads and Android tablets" } }),
    prisma.category.create({ data: { name: "Accessories", description: "Cases, buds, chargers" } }),
  ])

  const [samsung, apple, xiaomi, tecno, infinix] = await Promise.all([
    prisma.brand.create({ data: { name: "Samsung" } }),
    prisma.brand.create({ data: { name: "Apple" } }),
    prisma.brand.create({ data: { name: "Xiaomi" } }),
    prisma.brand.create({ data: { name: "Tecno" } }),
    prisma.brand.create({ data: { name: "Infinix" } }),
  ])

  const catalog: Prisma.ProductCreateInput[] = [
    {
      sku: "SAMS-S24-256-BN",
      name: "Galaxy S24 256GB",
      description: "Flagship Samsung with Galaxy AI",
      brand: { connect: { id: samsung.id } },
      category: { connect: { id: phones.id } },
      condition: "BRAND_NEW",
      color: "Onyx Black",
      storage: "256GB",
      ram: "8GB",
      costPrice: naira(780000),
      minimumPrice: naira(860000),
      sellingPrice: naira(920000),
      marketPrice: naira(980000),
    },
    {
      sku: "SAMS-A55-128-UK",
      name: "Galaxy A55 128GB",
      description: "UK used mid-range Android",
      brand: { connect: { id: samsung.id } },
      category: { connect: { id: phones.id } },
      condition: "UK_USED",
      color: "Awesome Navy",
      storage: "128GB",
      ram: "8GB",
      costPrice: naira(245000),
      minimumPrice: naira(280000),
      sellingPrice: naira(315000),
      marketPrice: naira(340000),
    },
    {
      sku: "APPL-IP15P-256-BN",
      name: "iPhone 15 Pro 256GB",
      description: "A17 Pro, titanium",
      brand: { connect: { id: apple.id } },
      category: { connect: { id: phones.id } },
      condition: "BRAND_NEW",
      color: "Natural Titanium",
      storage: "256GB",
      ram: "8GB",
      costPrice: naira(1450000),
      minimumPrice: naira(1580000),
      sellingPrice: naira(1680000),
      marketPrice: naira(1750000),
    },
    {
      sku: "APPL-IP13-128-RF",
      name: "iPhone 13 128GB",
      description: "Refurbished, battery 88%+",
      brand: { connect: { id: apple.id } },
      category: { connect: { id: phones.id } },
      condition: "REFURBISHED",
      color: "Midnight",
      storage: "128GB",
      ram: "4GB",
      costPrice: naira(310000),
      minimumPrice: naira(355000),
      sellingPrice: naira(385000),
      marketPrice: naira(410000),
    },
    {
      sku: "APPL-IP14-128-OB",
      name: "iPhone 14 128GB",
      description: "Open box, full warranty",
      brand: { connect: { id: apple.id } },
      category: { connect: { id: phones.id } },
      condition: "OPEN_BOX",
      color: "Blue",
      storage: "128GB",
      ram: "6GB",
      costPrice: naira(520000),
      minimumPrice: naira(580000),
      sellingPrice: naira(620000),
      marketPrice: naira(650000),
    },
    {
      sku: "XIAO-N13P-256-BN",
      name: "Redmi Note 13 Pro 256GB",
      description: "200MP camera, 67W charge",
      brand: { connect: { id: xiaomi.id } },
      category: { connect: { id: phones.id } },
      condition: "BRAND_NEW",
      color: "Midnight Black",
      storage: "256GB",
      ram: "12GB",
      costPrice: naira(195000),
      minimumPrice: naira(230000),
      sellingPrice: naira(255000),
      marketPrice: naira(270000),
    },
    {
      sku: "TECN-C30-256-BN",
      name: "Camon 30 256GB",
      description: "High-volume retail hero",
      brand: { connect: { id: tecno.id } },
      category: { connect: { id: phones.id } },
      condition: "BRAND_NEW",
      color: "Basaltic Dark",
      storage: "256GB",
      ram: "8GB",
      costPrice: naira(145000),
      minimumPrice: naira(168000),
      sellingPrice: naira(185000),
      marketPrice: naira(198000),
    },
    {
      sku: "INFX-H30-256-BN",
      name: "Hot 30 256GB",
      description: "Entry Android for volume sales",
      brand: { connect: { id: infinix.id } },
      category: { connect: { id: phones.id } },
      condition: "BRAND_NEW",
      color: "Aurora Green",
      storage: "256GB",
      ram: "8GB",
      costPrice: naira(98000),
      minimumPrice: naira(115000),
      sellingPrice: naira(128000),
      marketPrice: naira(138000),
    },
    {
      sku: "APPL-IPAD10-64-BN",
      name: "iPad 10th Gen 64GB",
      description: "Wi-Fi tablet",
      brand: { connect: { id: apple.id } },
      category: { connect: { id: tablets.id } },
      condition: "BRAND_NEW",
      color: "Silver",
      storage: "64GB",
      ram: "4GB",
      costPrice: naira(310000),
      minimumPrice: naira(350000),
      sellingPrice: naira(385000),
      marketPrice: naira(410000),
    },
    {
      sku: "SAMS-BUDS3-BN",
      name: "Galaxy Buds3",
      description: "True wireless earbuds",
      brand: { connect: { id: samsung.id } },
      category: { connect: { id: accessories.id } },
      condition: "BRAND_NEW",
      color: "White",
      storage: null,
      ram: null,
      costPrice: naira(42000),
      minimumPrice: naira(52000),
      sellingPrice: naira(62000),
      marketPrice: naira(70000),
    },
  ]

  const products = []
  for (const item of catalog) {
    products.push(await prisma.product.create({ data: item }))
  }

  const [s24, a55, ip15, ip13, ip14, note13, camon, hot30, ipad, buds] = products

  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        name: "West Africa Gadget Hub",
        contactPerson: "Musa Garba",
        email: "musa@wagh.ng",
        phone: "+234 802 555 1001",
        address: "Alaba International, Lagos",
      },
    }),
    prisma.supplier.create({
      data: {
        name: "Apple Authorised Grey Line",
        contactPerson: "Ngozi Eze",
        email: "ngozi@greylinenaija.com",
        phone: "+234 809 555 1002",
        address: "Computer Village, Ikeja",
      },
    }),
    prisma.supplier.create({
      data: {
        name: "Trans-Sahara Imports",
        contactPerson: "Yakubu Sani",
        email: "yakubu@tsi.ng",
        phone: "+234 706 555 1003",
        address: "Kano Trade Fair",
      },
    }),
  ])

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Chidi Okeke",
        phone: "08031234567",
        email: "chidi.okeke@gmail.com",
        address: "Lekki Phase 1, Lagos",
        branchId: iwoRoad.id,
        creditLimit: naira(500000),
        currentBalance: naira(0),
      },
    }),
    prisma.customer.create({
      data: {
        name: "Aisha Bello",
        phone: "08098765432",
        email: "aisha.bello@yahoo.com",
        address: "Gwarinpa, Abuja",
        branchId: bodija.id,
        creditLimit: naira(250000),
        currentBalance: naira(185000),
      },
    }),
    prisma.customer.create({
      data: {
        name: "Emeka Wholesale",
        phone: "07015550990",
        email: "orders@emekawholesale.ng",
        address: "Onitsha Main Market",
        branchId: iwoRoad.id,
        creditLimit: naira(2500000),
        currentBalance: naira(420000),
        notes: "Dealer account. Weekly settlement.",
      },
    }),
    prisma.customer.create({
      data: {
        name: "Ngozi Umeh",
        phone: "08142223344",
        address: "Rumuokoro, Port Harcourt",
        branchId: challenge.id,
        creditLimit: naira(0),
      },
    }),
    prisma.customer.create({
      data: {
        name: "Walk-in Customer",
        phone: "08000000000",
        branchId: iwoRoad.id,
        notes: "Default POS walk-in account",
      },
    }),
  ])

  const [chidi, aisha, emeka, ngozi, walkin] = customers

  function imei(seed: number) {
    return `35${String(1000000000000 + seed).slice(-13)}`
  }

  const stockPlan: Array<{
    productId: string
    branchId: string
    supplierId: string
    count: number
    start: number
    status?: "IN_STOCK" | "SOLD" | "FAULTY" | "REPAIRED"
  }> = [
    { productId: s24.id, branchId: iwoRoad.id, supplierId: suppliers[0].id, count: 4, start: 11 },
    { productId: a55.id, branchId: iwoRoad.id, supplierId: suppliers[0].id, count: 6, start: 21 },
    { productId: ip15.id, branchId: iwoRoad.id, supplierId: suppliers[1].id, count: 3, start: 31 },
    { productId: ip13.id, branchId: iwoRoad.id, supplierId: suppliers[1].id, count: 5, start: 41 },
    { productId: ip14.id, branchId: iwoRoad.id, supplierId: suppliers[1].id, count: 3, start: 51 },
    { productId: note13.id, branchId: iwoRoad.id, supplierId: suppliers[2].id, count: 8, start: 61 },
    { productId: camon.id, branchId: iwoRoad.id, supplierId: suppliers[2].id, count: 10, start: 71 },
    { productId: hot30.id, branchId: iwoRoad.id, supplierId: suppliers[2].id, count: 12, start: 81 },
    { productId: ipad.id, branchId: iwoRoad.id, supplierId: suppliers[1].id, count: 2, start: 91 },
    { productId: buds.id, branchId: iwoRoad.id, supplierId: suppliers[0].id, count: 6, start: 101 },
    { productId: s24.id, branchId: bodija.id, supplierId: suppliers[0].id, count: 2, start: 201 },
    { productId: ip13.id, branchId: bodija.id, supplierId: suppliers[1].id, count: 3, start: 211 },
    { productId: camon.id, branchId: bodija.id, supplierId: suppliers[2].id, count: 5, start: 221 },
    { productId: a55.id, branchId: challenge.id, supplierId: suppliers[0].id, count: 3, start: 301 },
    { productId: hot30.id, branchId: challenge.id, supplierId: suppliers[2].id, count: 6, start: 311 },
  ]

  const imeis: Awaited<ReturnType<typeof prisma.imeiRecord.create>>[] = []
  let imeiCursor = 1000
  for (const plan of stockPlan) {
    for (let i = 0; i < plan.count; i++) {
      imeiCursor += 1
      const record = await prisma.imeiRecord.create({
        data: {
          imei1: imei(imeiCursor),
          imei2: imei(imeiCursor + 50000),
          serialNumber: `SN${String(imeiCursor).padStart(8, "0")}`,
          productId: plan.productId,
          supplierId: plan.supplierId,
          branchId: plan.branchId,
          status: "IN_STOCK",
        },
      })
      imeis.push(record)
    }
    await prisma.inventory.create({
      data: {
        productId: plan.productId,
        branchId: plan.branchId,
        quantity: plan.count,
        minStock: 2,
      },
    })
  }

  const soldS24 = imeis.find((r) => r.productId === s24.id && r.branchId === iwoRoad.id)!
  const soldIp13 = imeis.find((r) => r.productId === ip13.id && r.branchId === iwoRoad.id)!
  const soldCamon = imeis.find((r) => r.productId === camon.id && r.branchId === iwoRoad.id)!
  const soldNote = imeis.find((r) => r.productId === note13.id && r.branchId === iwoRoad.id)!
  const soldA55 = imeis.find((r) => r.productId === a55.id && r.branchId === iwoRoad.id)!

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  async function completeSale(opts: {
    invoice: string
    customerId: string
    userId: string
    branchId: string
    imei: (typeof imeis)[number]
    price: number
    method: "CASH" | "TRANSFER" | "POS" | "CREDIT"
    paid: number
    days: number
    wholesale?: boolean
  }) {
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: opts.invoice,
        branchId: opts.branchId,
        userId: opts.userId,
        customerId: opts.customerId,
        saleType: opts.wholesale ? "WHOLESALE" : "RETAIL",
        isWholesale: Boolean(opts.wholesale),
        status: "COMPLETED",
        subtotal: naira(opts.price),
        totalAmount: naira(opts.price),
        paidAmount: naira(opts.paid),
        paymentMethod: opts.method,
        saleDate: daysAgo(opts.days),
        items: {
          create: {
            productId: opts.imei.productId,
            imeiId: opts.imei.id,
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
      data: {
        status: "SOLD",
        customerId: opts.customerId,
        saleId: sale.id,
      },
      where: { id: opts.imei.id },
    })
    await prisma.inventory.update({
      where: { productId_branchId: { productId: opts.imei.productId, branchId: opts.branchId } },
      data: { quantity: { decrement: 1 } },
    })
    await prisma.financeEntry.create({
      data: {
        branchId: opts.branchId,
        account: opts.method === "CASH" ? "CASH" : "BANK",
        type: "INCOME",
        amount: naira(opts.paid),
        reference: opts.invoice,
        description: `Sale ${opts.invoice}`,
        createdAt: daysAgo(opts.days),
      },
    })
    return sale
  }

  await completeSale({
    invoice: "INV-IWO-1001",
    customerId: chidi.id,
    userId: cashier.id,
    branchId: iwoRoad.id,
    imei: soldS24,
    price: 920000,
    method: "TRANSFER",
    paid: 920000,
    days: 12,
  })
  await completeSale({
    invoice: "INV-IWO-1002",
    customerId: chidi.id,
    userId: sales.id,
    branchId: iwoRoad.id,
    imei: soldIp13,
    price: 385000,
    method: "POS",
    paid: 385000,
    days: 8,
  })
  const creditSale = await completeSale({
    invoice: "INV-IWO-1003",
    customerId: emeka.id,
    userId: cashier.id,
    branchId: iwoRoad.id,
    imei: soldCamon,
    price: 185000,
    method: "CREDIT",
    paid: 0,
    days: 6,
    wholesale: true,
  })
  await completeSale({
    invoice: "INV-IWO-1004",
    customerId: walkin.id,
    userId: cashier.id,
    branchId: iwoRoad.id,
    imei: soldNote,
    price: 255000,
    method: "CASH",
    paid: 255000,
    days: 3,
  })
  const a55Sale = await completeSale({
    invoice: "INV-IWO-1005",
    customerId: chidi.id,
    userId: sales.id,
    branchId: iwoRoad.id,
    imei: soldA55,
    price: 315000,
    method: "POS",
    paid: 315000,
    days: 2,
  })

  await prisma.ledgerEntry.createMany({
    data: [
      // A statement reads oldest first, and `balance` is the running total
      // after that line. The older invoice therefore carries 235,000 and the
      // newer one takes the account to 420,000 — which is what the customer
      // record says they owe. These two used to be the other way round, so the
      // newest line claimed 185,000 against a 420,000 account.
      {
        customerId: emeka.id,
        type: "SALE",
        amount: naira(235000),
        balance: naira(235000),
        reference: "INV-IWO-0988",
        description: "Prior dealer invoice",
        createdAt: daysAgo(20),
      },
      {
        customerId: emeka.id,
        type: "SALE",
        amount: naira(185000),
        balance: naira(420000),
        reference: creditSale.invoiceNumber,
        description: "Wholesale Camon 30 on credit",
        createdAt: daysAgo(6),
      },
      {
        customerId: aisha.id,
        type: "SALE",
        amount: naira(185000),
        balance: naira(185000),
        reference: "INV-BOD-0441",
        description: "Outstanding Bodija sale",
        createdAt: daysAgo(18),
      },
    ],
  })

  await prisma.purchase.create({
    data: {
      invoiceNumber: "PO-IWO-2201",
      supplierId: suppliers[1].id,
      branchId: iwoRoad.id,
      userId: vault.id,
      status: "RECEIVED",
      totalAmount: naira(4350000),
      paidAmount: naira(4350000),
      paymentMethod: "TRANSFER",
      receivedDate: daysAgo(15),
      items: {
        create: [
          {
            productId: ip15.id,
            quantity: 3,
            costPrice: naira(1450000),
            totalAmount: naira(4350000),
            receivedQty: 3,
          },
        ],
      },
    },
  })

  await prisma.purchase.create({
    data: {
      invoiceNumber: "PO-IWO-2208",
      supplierId: suppliers[2].id,
      branchId: iwoRoad.id,
      userId: vault.id,
      status: "PARTIAL_RECEIVED",
      totalAmount: naira(1960000),
      paidAmount: naira(980000),
      paymentMethod: "TRANSFER",
      expectedDate: daysAgo(-4),
      notes: "Second carton still in transit from Kano",
      items: {
        create: [
          {
            productId: camon.id,
            quantity: 8,
            costPrice: naira(145000),
            totalAmount: naira(1160000),
            receivedQty: 6,
          },
          {
            productId: hot30.id,
            quantity: 8,
            costPrice: naira(98000),
            totalAmount: naira(784000),
            receivedQty: 4,
          },
        ],
      },
    },
  })

  await prisma.expense.createMany({
    data: [
      {
        expenseNumber: "EXP-IWO-301",
        branchId: iwoRoad.id,
        userId: accountant.id,
        category: "RENT",
        amount: naira(850000),
        description: "Iwo Road shop rent, August",
        date: daysAgo(20),
        approvedBy: ceo.id,
        approvedAt: daysAgo(19),
      },
      {
        expenseNumber: "EXP-IWO-302",
        branchId: iwoRoad.id,
        userId: manager.id,
        category: "FUEL",
        amount: naira(48000),
        description: "Generator diesel",
        date: daysAgo(5),
        approvedBy: manager.id,
        approvedAt: daysAgo(5),
      },
      {
        expenseNumber: "EXP-IWO-303",
        branchId: iwoRoad.id,
        userId: accountant.id,
        category: "SALARY",
        amount: naira(620000),
        description: "Iwo Road floor staff, August",
        date: daysAgo(10),
        approvedBy: ceo.id,
        approvedAt: daysAgo(9),
      },
      {
        expenseNumber: "EXP-BOD-110",
        branchId: bodija.id,
        userId: accountant.id,
        category: "UTILITIES",
        amount: naira(76000),
        description: "Bodija PHCN + internet",
        date: daysAgo(7),
      },
    ],
  })

  await prisma.financeEntry.createMany({
    data: [
      {
        branchId: iwoRoad.id,
        account: "BANK",
        type: "EXPENSE",
        amount: naira(850000),
        reference: "EXP-IWO-301",
        description: "Rent",
        createdAt: daysAgo(20),
      },
      {
        branchId: iwoRoad.id,
        account: "CASH",
        type: "EXPENSE",
        amount: naira(48000),
        reference: "EXP-IWO-302",
        description: "Diesel",
        createdAt: daysAgo(5),
      },
    ],
  })

  const incomingSwapImei = await prisma.imeiRecord.create({
    data: {
      imei1: imei(901),
      imei2: imei(5901),
      serialNumber: "SNSWAP0001",
      productId: ip13.id,
      branchId: iwoRoad.id,
      status: "SWAPPED",
      customerId: ngozi.id,
      notes: "Customer trade-in, battery 76%",
    },
  })
  const outgoingSwapImei = imeis.find(
    (r) => r.productId === ip14.id && r.branchId === iwoRoad.id && r.status === "IN_STOCK"
  )!

  await prisma.swap.create({
    data: {
      swapNumber: "SWP-IWO-014",
      customerId: ngozi.id,
      oldImeiId: incomingSwapImei.id,
      oldDeviceCondition: "UK_USED",
      tradeValue: naira(240000),
      newProductId: ip14.id,
      newProductPrice: naira(620000),
      newImeiId: outgoingSwapImei.id,
      balanceAmount: naira(380000),
      branchId: iwoRoad.id,
      userId: sales.id,
      status: "COMPLETED",
      approvedBy: manager.id,
      approvedAt: daysAgo(4),
      completedAt: daysAgo(4),
      notes: "Customer paid difference by transfer",
    },
  })
  await prisma.imeiRecord.update({
    where: { id: outgoingSwapImei.id },
    data: { status: "SOLD", customerId: ngozi.id },
  })
  await prisma.inventory.update({
    where: { productId_branchId: { productId: ip14.id, branchId: iwoRoad.id } },
    data: { quantity: { decrement: 1 } },
  })

  await prisma.stockReturn.create({
    data: {
      returnNumber: "RTN-IWO-077",
      customerId: chidi.id,
      saleId: a55Sale.id,
      imeiId: soldA55.id,
      branchId: iwoRoad.id,
      userId: cashier.id,
      reason: "FAULTY",
      outcome: "REPAIR",
      faultClass: "REPAIR_STOCK",
      status: "APPROVED",
      notes: "Screen ghosting reported within 48 hours",
      approvedBy: manager.id,
      approvedAt: daysAgo(1),
    },
  })
  await prisma.imeiRecord.update({
    where: { id: soldA55.id },
    data: { status: "RETURNED" },
  })

  await prisma.repair.create({
    data: {
      repairNumber: "RPR-IWO-019",
      imeiId: soldA55.id,
      customerId: chidi.id,
      branchId: iwoRoad.id,
      userId: engineer.id,
      issue: "Intermittent screen ghosting",
      diagnosis: "Display flex suspected. Awaiting OEM panel.",
      status: "WAITING_PARTS",
      repairCost: naira(45000),
    },
  })

  await prisma.stockTransfer.create({
    data: {
      transferNumber: "TRF-IWO-BOD-08",
      fromBranchId: iwoRoad.id,
      toBranchId: bodija.id,
      userId: vault.id,
      status: "IN_TRANSIT",
      sentAt: daysAgo(1),
      notes: "Restock Bodija for weekend demand",
      items: {
        create: [
          { productId: note13.id, quantity: 3 },
          { productId: camon.id, quantity: 4 },
        ],
      },
    },
  })

  const recon = await prisma.reconciliation.create({
    data: {
      branchId: iwoRoad.id,
      userId: auditor.id,
      startDate: daysAgo(2),
      endDate: new Date(),
      status: "IN_PROGRESS",
      totalExpected: naira(18400000),
      totalCounted: naira(18115000),
      variance: naira(-285000),
      notes: "September vault count. Two UK used units unlocated",
    },
  })
  await prisma.reconciliationItem.create({
    data: {
      reconciliationId: recon.id,
      productId: a55.id,
      expectedQty: 5,
      countedQty: 4,
      variance: -1,
      varianceValue: naira(-315000),
      reason: "Unit sent to engineer bench, not yet tagged",
    },
  })

  await prisma.approval.createMany({
    data: [
      {
        type: "EXPENSE",
        entityId: "EXP-BOD-110",
        entityType: "Expense",
        requestedBy: accountant.id,
        status: "PENDING",
        reason: "Bodija utilities above monthly cap",
      },
      {
        type: "REFUND",
        entityId: "RTN-IWO-077",
        entityType: "Return",
        requestedBy: cashier.id,
        status: "PENDING",
        reason: "Customer requested refund instead of repair",
      },
    ],
  })

  await prisma.notification.createMany({
    data: [
      {
        userId: ceo.id,
        type: "APPROVAL_REQUEST",
        title: "Refund decision needed",
        message: "Chidi Okeke wants a refund on Galaxy A55 instead of repair.",
        actionUrl: "/approvals",
      },
      {
        userId: manager.id,
        type: "LOW_STOCK",
        title: "iPhone 15 Pro running low",
        message: "Only 3 units left at Iwo Road.",
        actionUrl: "/inventory",
      },
      {
        userId: auditor.id,
        type: "SYSTEM",
        title: "Vault count variance",
        message: "Iwo Road count shows ₦285,000 variance. Review before close.",
        actionUrl: "/reconciliation",
      },
      {
        userId: accountant.id,
        type: "DUE_PAYMENT",
        title: "Emeka Wholesale overdue",
        message: "Dealer balance ₦420,000. Last invoice INV-IWO-1003.",
        actionUrl: "/customers",
      },
    ],
  })

  await prisma.auditLog.createMany({
    data: [
      {
        userId: cashier.id,
        action: "CREATE",
        entityType: "Sale",
        entityId: "INV-IWO-1004",
        newValue: JSON.stringify({ total: 255000, method: "CASH" }),
        branchId: iwoRoad.id,
        createdAt: daysAgo(3),
      },
      {
        userId: vault.id,
        action: "CREATE",
        entityType: "IMEIRecord",
        entityId: soldS24.imei1,
        newValue: JSON.stringify({ status: "RECEIVED" }),
        branchId: iwoRoad.id,
        createdAt: daysAgo(16),
      },
      {
        userId: manager.id,
        action: "APPROVE",
        entityType: "Swap",
        entityId: "SWP-IWO-014",
        newValue: JSON.stringify({ tradeValue: 240000, balance: 380000 }),
        branchId: iwoRoad.id,
        createdAt: daysAgo(4),
      },
    ],
  })

  await prisma.setting.createMany({
    data: [
      { key: "company.name", value: "Abu Twins", description: "Legal trading name printed on invoices" },
      { key: "company.product", value: "Abu Twins Softskills", description: "Line under the name on invoices" },
      { key: "company.phone", value: "07062454854", description: "Phone on invoices" },
      { key: "company.address", value: "Iwo Road, Ibadan, Oyo State", description: "Address on invoices" },
      { key: "company.email", value: "hello@abutwins.com", description: "Email on invoices" },
      { key: "company.logo", value: "", description: "Logo printed on invoices" },
      { key: "company.footer", value: "Thank you for buying from Abu Twins", description: "Thank-you line at the bottom of invoices" },
      { key: "company.currency", value: "NGN", description: "Default currency" },
      { key: "sales.allow_below_minimum", value: "false", description: "Going under an item's lowest allowed price needs the CEO or Super Admin" },
      { key: "sales.block_until_day_closed", value: "false", description: "An uncounted day reminds the shop but does not stop the till" },
      {
        key: "incoming.dual_control",
        value: "true",
        description: "Second person must say yes before received goods become sellable",
      },
      { key: "inventory.low_stock_threshold", value: "3", description: "Default low stock" },
    ],
  })

  console.log("Seed complete.")
  console.log("Login: admin@abutwins.com / admin123")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
