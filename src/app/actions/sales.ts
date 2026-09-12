"use server"

import { revalidatePath } from "next/cache"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canManageFinance, canSell, scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { generateDocNumber, money } from "@/lib/utils"
import { ConflictError, claimImei, creditInvoice, drawStock, settle, shiftCustomerBalance } from "@/lib/concurrency"
import { scopeRecord, viewBranchFilter } from "@/lib/branch-scope"
import { getSellLock } from "@/app/actions/day-close"
import { markParkedPosted } from "@/app/actions/parked"

export async function getSales() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  return prisma.sale.findMany({
    where: branchId ? { branchId } : undefined,
    include: { customer: true, branch: true, user: true, items: { include: { product: true, imei: true } } },
    orderBy: { saleDate: "desc" },
    take: 100,
  })
}

export async function getSale(id: string) {
  const user = await requireUser()
  // An invoice id is easy to guess or share. Without this check any member of
  // staff could open another shop's sale, and its customer, straight from the
  // address bar.
  return scopeRecord(user, await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      branch: true,
      user: true,
      items: { include: { product: true, imei: true } },
      payments: true,
    },
  }))
}

export async function getPosLookups() {
  const user = await requireUser()
  const branchId = (await scopedBranchId(user.role, user.branchId)) ?? user.branchId ?? undefined
  const [products, customers, imeis, branches] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { brand: true, inventory: true, _count: { select: { imeiRecords: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { name: "asc" },
    }),
    prisma.imeiRecord.findMany({
      where: { status: "IN_STOCK", ...(branchId ? { branchId } : {}) },
      include: { product: true, branch: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])
  const settings = await getAppSettings()
  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      sellingPrice: money(product.sellingPrice),
      minimumPrice: money(product.minimumPrice),
      serialized: product.tracking !== "NONE",
      brand: { name: product.brand.name },
      stock: product.inventory.map((row) => ({ branchId: row.branchId, quantity: row.quantity })),
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      branchId: customer.branchId,
      creditLimit: money(customer.creditLimit),
      currentBalance: money(customer.currentBalance),
    })),
    imeis: imeis.map((item) => ({
      id: item.id,
      imei1: item.imei1,
      serialNumber: item.serialNumber,
      productId: item.productId,
      branchId: item.branchId,
      product: {
        name: item.product.name,
        sellingPrice: money(item.product.sellingPrice),
        minimumPrice: money(item.product.minimumPrice),
      },
    })),
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
    })),
    branchId,
    allowBelowMinimum: settings.allowBelowMinimum,
    canOverrideFloor: settings.allowBelowMinimum || (await can(user.role, "action.override_floor")),
    lowStockThreshold: settings.lowStockThreshold,
    sellLocks: Object.fromEntries(
      await Promise.all(
        branches.map(async (branch) => {
          const lock = await getSellLock(branch.id)
          return [branch.id, { locked: lock.locked, dates: lock.dates, href: lock.href, message: lock.message }]
        })
      )
    ),
  }
}

export async function checkoutSale(input: {
  customerId?: string
  branchId: string
  paymentMethod: PaymentMethod
  paidAmount: number
  notes?: string
  wholesale?: boolean
  queuedAt?: string
  offlineId?: string
  items: Array<{ productId: string; imeiId?: string; quantity: number; unitPrice: number }>
}) {
  const user = await requireUser()
  if (!(await canSell(user.role))) return { error: "You are not allowed to sell. Ask the main admin." }
  if (!input.items.length) return { error: "Add at least one item." }
  if (!input.queuedAt || !input.offlineId) {
    const lock = await getSellLock(input.branchId)
    if (lock.locked) return { error: lock.message }
  }

  const settings = await getAppSettings()
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((item) => item.productId) } },
    include: { _count: { select: { imeiRecords: true } } },
  })
  const productById = new Map(products.map((row) => [row.id, row]))
  const canOverrideFloor = settings.allowBelowMinimum || (await can(user.role, "action.override_floor"))
  const canOverrideCredit = await can(user.role, "action.override_floor")

  // One read for every tracked unit in the cart, and one for every branch stock
  // row, instead of a query per line. A 20 line cart used to fire 20 round trips.
  const imeiIds = input.items.map((item) => item.imeiId).filter((id): id is string => Boolean(id))
  const [cartImeis, stockRows] = await Promise.all([
    imeiIds.length
      ? prisma.imeiRecord.findMany({
          where: { id: { in: imeiIds } },
          select: { id: true, imei1: true, status: true, branchId: true },
        })
      : Promise.resolve([]),
    prisma.inventory.findMany({
      where: { branchId: input.branchId, productId: { in: input.items.map((item) => item.productId) } },
      select: { productId: true, quantity: true, minStock: true },
    }),
  ])
  const imeiById = new Map(cartImeis.map((row) => [row.id, row]))
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row]))

  // Pieces wanted per product, so a cart holding the same accessory on two lines
  // is checked against stock once, on the combined figure.
  const wantByProduct = new Map<string, number>()

  for (const item of input.items) {
    const product = productById.get(item.productId)
    if (!product) return { error: "One of the items in the cart is missing." }
    if (!Number.isFinite(item.quantity) || item.quantity < 1) {
      return { error: `Enter how many ${product.name} the customer is buying.` }
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return { error: `Enter a valid price for ${product.name}.` }
    }
    if (item.unitPrice < money(product.minimumPrice) && !canOverrideFloor) {
      return { error: `${product.name} is below the lowest allowed price. Raise it, or ask the main admin.` }
    }
    if (item.imeiId) {
      const imei = imeiById.get(item.imeiId)
      if (!imei || imei.status !== "IN_STOCK") return { error: `IMEI ${imei?.imei1 ?? ""} is not available.` }
      if (imei.branchId !== input.branchId) return { error: `${imei.imei1} is not in this shop.` }
    } else if (product._count.imeiRecords > 0) {
      return { error: `${product.name} must be sold with an IMEI from this shop.` }
    } else {
      wantByProduct.set(item.productId, (wantByProduct.get(item.productId) ?? 0) + item.quantity)
    }
  }

  for (const [productId, wanted] of wantByProduct) {
    const stock = stockByProduct.get(productId)
    if (!stock || stock.quantity < wanted) {
      return { error: `${productById.get(productId)?.name ?? "This item"} does not have enough units at this branch.` }
    }
  }

  // A phone scanned onto two lines of the same cart would otherwise be claimed
  // twice and sold once.
  const duplicateImei = imeiIds.find((id, index) => imeiIds.indexOf(id) !== index)
  if (duplicateImei) {
    return { error: `${imeiById.get(duplicateImei)?.imei1 ?? "That phone"} is on this sale twice. Remove one line.` }
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const paid = Math.min(Math.max(0, input.paidAmount), subtotal)
  const method = paid < subtotal ? "CREDIT" : input.paymentMethod
  const due = subtotal - paid

  if (due > 0 && !input.customerId) {
    return { error: "A credit sale or part payment needs a buyer name. A walk-in must pay everything now." }
  }

  if (input.customerId && due > 0) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) return { error: "We could not find that customer." }
    const nextDebt = money(customer.currentBalance) + due
    if (money(customer.creditLimit) > 0 && nextDebt > money(customer.creditLimit) && !canOverrideCredit) {
      return { error: `${customer.name} would exceed the credit limit of ₦${money(customer.creditLimit).toLocaleString("en-NG")}.` }
    }
  }

  const invoiceNumber = generateDocNumber("INV")

  // Alerts are gathered while the books are being written and sent afterwards.
  // Fanning notifications out inside the transaction held stock rows locked for
  // as long as it took to write one row per member of staff.
  const lowStockAlerts: Array<{ productId: string; quantity: number; limit: number }> = []

  const posted = await settle(() =>
    prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: input.branchId,
          userId: user.id,
          customerId: input.customerId || null,
          saleType: input.wholesale ? "WHOLESALE" : "RETAIL",
          isWholesale: Boolean(input.wholesale),
          status: "COMPLETED",
          subtotal: subtotal.toFixed(2),
          totalAmount: subtotal.toFixed(2),
          paidAmount: paid.toFixed(2),
          paymentMethod: method,
          notes: input.notes,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              imeiId: item.imeiId || null,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toFixed(2),
              totalPrice: (item.unitPrice * item.quantity).toFixed(2),
            })),
          },
          payments:
            paid > 0
              ? {
                  create: {
                    amount: paid.toFixed(2),
                    method: input.paymentMethod,
                  },
                }
              : undefined,
        },
      })

      // The checks above are for a helpful message. These are the ones that
      // decide the sale: a guarded write that only lands while the unit is still
      // In shop here, so two tills cannot both sell the same phone.
      for (const item of input.items) {
        if (!item.imeiId) continue
        const label = imeiById.get(item.imeiId)?.imei1 ?? "That phone"
        await claimImei(tx, {
          imeiId: item.imeiId,
          branchId: input.branchId,
          label,
          data: {
            status: "SOLD",
            saleId: created.id,
            customerId: input.customerId || null,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            entityType: "IMEIRecord",
            entityId: label,
            oldValue: "IN_STOCK",
            newValue: JSON.stringify({ status: "SOLD", invoice: invoiceNumber }),
            branchId: input.branchId,
          },
        })
      }

      for (const [productId, wanted] of wantByProduct) {
        await drawStock(tx, {
          productId,
          branchId: input.branchId,
          quantity: wanted,
          label: productById.get(productId)?.name ?? "This item",
        })
      }

      if (input.customerId) {
        // The database does the addition and hands back the real figure, so two
        // clerks posting to one customer at the same time cannot overwrite each
        // other's debt.
        const customer = await shiftCustomerBalance(tx, input.customerId, due)
        const nextBalance = money(customer.currentBalance)
        if (
          due > 0 &&
          money(customer.creditLimit) > 0 &&
          nextBalance > money(customer.creditLimit) &&
          !canOverrideCredit
        ) {
          throw new ConflictError(
            `${customer.name} went over their credit limit while this sale was being typed. They now owe ₦${nextBalance.toLocaleString("en-NG")}. Collect first, or ask the main admin.`
          )
        }
        await tx.ledgerEntry.create({
          data: {
            customerId: input.customerId,
            type: "SALE",
            amount: subtotal.toFixed(2),
            balance: (nextBalance + paid).toFixed(2),
            reference: invoiceNumber,
            description: "Sale in the shop",
          },
        })
        if (paid > 0) {
          await tx.ledgerEntry.create({
            data: {
              customerId: input.customerId,
              type: "PAYMENT",
              amount: (-paid).toFixed(2),
              balance: nextBalance.toFixed(2),
              reference: invoiceNumber,
              description: "Money paid on an invoice",
            },
          })
        }
      }

      if (paid > 0) {
        await tx.financeEntry.create({
          data: {
            branchId: input.branchId,
            account: input.paymentMethod === "CASH" ? "CASH" : "BANK",
            type: "INCOME",
            amount: paid.toFixed(2),
            reference: invoiceNumber,
            description: "Money collected on a sale",
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Sale",
          entityId: invoiceNumber,
          newValue: JSON.stringify({
            total: subtotal,
            paid,
            method,
            ...(input.queuedAt
              ? { postedFromOffline: true, queuedAt: input.queuedAt, offlineId: input.offlineId ?? null }
              : {}),
          }),
          branchId: input.branchId,
        },
      })

      for (const [productId] of wantByProduct) {
        const stock = await tx.inventory.findUnique({
          where: { productId_branchId: { productId, branchId: input.branchId } },
          select: { quantity: true, minStock: true },
        })
        if (!stock) continue
        const limit = lowStockLimit(stock.minStock, settings.lowStockThreshold)
        if (stock.quantity <= limit) lowStockAlerts.push({ productId, quantity: stock.quantity, limit })
      }

      return created
    })
  )

  if ("error" in posted) return { error: posted.error }
  const sale = posted.data

  await fanOutSaleAlerts({
    branchId: input.branchId,
    invoiceNumber,
    saleId: sale.id,
    due,
    customerId: input.customerId,
    lowStockAlerts: lowStockAlerts.map((row) => ({
      ...row,
      name: productById.get(row.productId)?.name ?? "Item",
    })),
  })

  if (input.offlineId) await markParkedPosted(input.offlineId, sale.id)

  revalidatePath("/sales")
  revalidatePath("/pos")
  revalidatePath("/dashboard")
  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/notifications")
  return { success: true, saleId: sale.id }
}

/**
 * Low stock and unpaid-invoice alerts, sent after the sale is safely written.
 * One createMany per alert type rather than a row at a time, so a shop with
 * twenty staff still costs two writes.
 */
async function fanOutSaleAlerts(input: {
  branchId: string
  invoiceNumber: string
  saleId: string
  due: number
  customerId?: string
  lowStockAlerts: Array<{ name: string; quantity: number; limit: number }>
}) {
  try {
    if (input.lowStockAlerts.length) {
      const staff = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [{ branchId: input.branchId }, { role: { in: ["VAULT_MANAGER", "CEO", "BRANCH_MANAGER"] } }],
        },
        select: { id: true },
      })
      const rows = staff.flatMap((person) =>
        input.lowStockAlerts.map((alert) => ({
          userId: person.id,
          type: "LOW_STOCK" as const,
          title: "An item is running low",
          message: `Only ${alert.quantity} ${alert.name} left in this shop. We warn you at ${alert.limit}.`,
          actionUrl: "/inventory",
        }))
      )
      if (rows.length) await prisma.notification.createMany({ data: rows })
    }

    if (input.due > 0 && input.customerId) {
      const [watchers, customer] = await Promise.all([
        prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { role: { in: ["ACCOUNTANT", "CEO", "SUPER_ADMIN"] } },
              { role: "BRANCH_MANAGER", branchId: input.branchId },
            ],
          },
          select: { id: true },
        }),
        prisma.customer.findUnique({ where: { id: input.customerId }, select: { name: true } }),
      ])
      if (watchers.length) {
        await prisma.notification.createMany({
          data: watchers.map((person) => ({
            userId: person.id,
            type: "DUE_PAYMENT" as const,
            title: "This invoice is not fully paid",
            message: `${customer?.name ?? "The customer"} still owes ₦${input.due.toLocaleString("en-NG")} on ${input.invoiceNumber}`,
            actionUrl: `/sales/${input.saleId}`,
          })),
        })
      }
    }
  } catch {
    // The sale is already written and correct. A failed alert must never make
    // the till think the sale did not go through.
  }
}

export async function collectPayment(formData: FormData) {
  const user = await requireUser()
  const customerId = String(formData.get("customerId"))
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER") as PaymentMethod
  if (!customerId || amount <= 0) return { error: "Type how much was paid." }

  const payRef = generateDocNumber("PAY")

  const posted = await settle(() =>
    prisma.$transaction(async (tx) => {
      // Read the debt inside the posting, not before it. Two clerks taking money
      // from the same customer at once used to each work from the balance they
      // saw on their own screen, and the second write wiped out the first.
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, branchId: true, currentBalance: true },
      })
      if (!customer) throw new ConflictError("We could not find that customer.")
      const owing = money(customer.currentBalance)
      if (owing <= 0) throw new ConflictError("This customer does not owe us anything.")

      const collected = Math.min(amount, owing)
      const after = await shiftCustomerBalance(tx, customerId, -collected)
      const next = money(after.currentBalance)
      if (next < -0.005) {
        throw new ConflictError(
          `${customer.name} was collected from while you were typing. Open their page again to see what is still owed.`
        )
      }

      await tx.ledgerEntry.create({
        data: {
          customerId,
          type: "PAYMENT",
          amount: (-collected).toFixed(2),
          balance: next.toFixed(2),
          reference: payRef,
          description: "Money collected on the customer account. Nothing on the invoice was changed",
        },
      })
      await tx.financeEntry.create({
        data: {
          branchId: customer.branchId,
          account: method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: collected.toFixed(2),
          reference: payRef,
          description: `Money collected from ${customer.name}`,
        },
      })

      let remaining = collected
      const openSales = await tx.sale.findMany({
        where: { customerId, status: "COMPLETED" },
        orderBy: { saleDate: "asc" },
        select: { id: true, totalAmount: true, paidAmount: true, paymentMethod: true },
      })
      for (const sale of openSales) {
        const due = money(sale.totalAmount) - money(sale.paidAmount)
        if (due <= 0 || remaining <= 0) continue
        const apply = Math.min(due, remaining)
        const credited = await creditInvoice(tx, sale.id, apply)
        if (money(credited.paidAmount) >= money(credited.totalAmount)) {
          await tx.sale.update({ where: { id: sale.id }, data: { paymentMethod: method } })
        }
        await tx.payment.create({
          data: {
            saleId: sale.id,
            amount: apply.toFixed(2),
            method,
            reference: payRef,
            notes: "Taken from what the customer paid on their account. The invoice was not changed.",
          },
        })
        remaining -= apply
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "LedgerEntry",
          entityId: payRef,
          newValue: JSON.stringify({ customerId, collected, method }),
          branchId: customer.branchId,
        },
      })
    })
  )

  if ("error" in posted) return { error: posted.error }

  revalidatePath("/customers")
  revalidatePath(`/customers/${customerId}`)
  revalidatePath("/finance")
  revalidatePath("/sales")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function collectInvoicePayment(formData: FormData) {
  const user = await requireUser()
  if (!(await canSell(user.role)) && !(await canManageFinance(user.role))) {
    return { error: "You are not allowed to collect money on a sale. Ask the main admin." }
  }
  const saleId = String(formData.get("saleId") || "")
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER") as PaymentMethod
  if (!saleId || amount <= 0) return { error: "Enter the amount collected." }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, status: true, branchId: true, customerId: true, invoiceNumber: true, totalAmount: true, paidAmount: true },
  })
  if (!sale) return { error: "We could not find that sale." }
  if (sale.status !== "COMPLETED") return { error: "You can only collect money on a sale that is finished." }
  if (money(sale.totalAmount) - money(sale.paidAmount) <= 0) return { error: "This sale is already fully paid." }

  const posted = await settle(() =>
    prisma.$transaction(async (tx) => {
      // What is still owed is read inside the posting. Two clerks collecting on
      // one invoice used to both work from the same starting figure, so the shop
      // banked two payments but the invoice only recorded one.
      const fresh = await tx.sale.findUnique({
        where: { id: saleId },
        select: { totalAmount: true, paidAmount: true },
      })
      if (!fresh) throw new ConflictError("We could not find that sale.")
      const due = money(fresh.totalAmount) - money(fresh.paidAmount)
      if (due <= 0) {
        throw new ConflictError(`${sale.invoiceNumber} was settled while you were typing. Nothing is owed on it now.`)
      }
      const collected = Math.min(amount, due)

      const credited = await creditInvoice(tx, sale.id, collected)
      if (money(credited.paidAmount) >= money(credited.totalAmount)) {
        await tx.sale.update({ where: { id: sale.id }, data: { paymentMethod: method } })
      }
      await tx.payment.create({
        data: {
          saleId: sale.id,
          amount: collected.toFixed(2),
          method,
          notes: "Money collected on a finished invoice. The items and IMEIs were not changed",
        },
      })
      if (sale.customerId) {
        const after = await shiftCustomerBalance(tx, sale.customerId, -collected)
        const next = Math.max(0, money(after.currentBalance))
        await tx.ledgerEntry.create({
          data: {
            customerId: sale.customerId,
            type: "PAYMENT",
            amount: (-collected).toFixed(2),
            balance: next.toFixed(2),
            reference: sale.invoiceNumber,
            description: `Money collected on ${sale.invoiceNumber}`,
          },
        })
      }
      await tx.financeEntry.create({
        data: {
          branchId: sale.branchId,
          account: method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: collected.toFixed(2),
          reference: sale.invoiceNumber,
          description: `Money collected on ${sale.invoiceNumber}`,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Payment",
          entityId: sale.invoiceNumber,
          newValue: JSON.stringify({ collected, method, itemsUntouched: true }),
          branchId: sale.branchId,
        },
      })
    })
  )

  if ("error" in posted) return { error: posted.error }

  revalidatePath("/sales")
  revalidatePath(`/sales/${sale.id}`)
  if (sale.customerId) revalidatePath(`/customers/${sale.customerId}`)
  revalidatePath("/finance")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function attachSaleCustomer(formData: FormData) {
  const user = await requireUser()
  if (!(await canSell(user.role)) && !(await canManageFinance(user.role))) {
    return { error: "You are not allowed to put a buyer name on this sale. Ask the main admin." }
  }

  const saleId = String(formData.get("saleId") || "")
  const existingId = String(formData.get("customerId") || "").trim()
  const name = String(formData.get("name") || "").trim()
  const phone = String(formData.get("phone") || "").trim()

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: true, imeis: true },
  })
  if (!sale) return { error: "We could not find that sale." }
  if (sale.customerId) return { error: "This sale already has a buyer name. The items stay as they are." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && sale.branchId !== scoped) return { error: "You can only add a customer name on sales from your own shop." }

  let customer = existingId
    ? await prisma.customer.findUnique({ where: { id: existingId } })
    : phone
      ? await prisma.customer.findUnique({ where: { phone } })
      : null

  if (!customer) {
    if (!name || !phone) return { error: "Pick an existing customer or enter name and phone." }
    customer = await prisma.customer.create({
      data: {
        name,
        phone,
        branchId: sale.branchId,
      },
    })
  } else if (name && customer.name !== name && !existingId) {
    return { error: `Phone ${phone} already belongs to ${customer.name}. Pick them from the list.` }
  }

  if (scoped && customer.branchId !== scoped && customer.branchId !== sale.branchId) {
    return { error: "That customer belongs to another shop." }
  }

  const due = money(sale.totalAmount) - money(sale.paidAmount)
  if (due > 0) {
    const next = money(customer.currentBalance) + due
    const limit = money(customer.creditLimit)
    const hq = await can(user.role, "action.override_floor")
    if (limit > 0 && next > limit && !hq) {
      return { error: `Adding this unpaid sale would take ${customer.name} over their credit limit.` }
    }
  }

  const buyer = customer

  const posted = await settle(() =>
    prisma.$transaction(async (tx) => {
      // Only attach if the sale is still a walk-in. Two clerks naming the same
      // invoice at once would otherwise post the debt to the customer twice.
      const claimed = await tx.sale.updateMany({
        where: { id: sale.id, customerId: null },
        data: { customerId: buyer.id },
      })
      if (claimed.count !== 1) {
        throw new ConflictError("Someone else just put a customer name on this sale. Refresh to see it.")
      }
      await tx.imeiRecord.updateMany({
        where: { saleId: sale.id },
        data: { customerId: buyer.id },
      })
      if (due > 0) {
        const after = await shiftCustomerBalance(tx, buyer.id, due)
        await tx.ledgerEntry.create({
          data: {
            customerId: buyer.id,
            type: "SALE",
            amount: due.toFixed(2),
            balance: money(after.currentBalance).toFixed(2),
            reference: sale.invoiceNumber,
            description: `A buyer name was put on the unpaid sale ${sale.invoiceNumber}`,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "Sale",
          entityId: sale.invoiceNumber,
          oldValue: "WALK_IN",
          newValue: JSON.stringify({ customerId: buyer.id, customer: buyer.name, itemsUntouched: true, due }),
          branchId: sale.branchId,
        },
      })
    })
  )

  if ("error" in posted) return { error: posted.error }

  revalidatePath("/sales")
  revalidatePath(`/sales/${sale.id}`)
  revalidatePath(`/customers/${customer.id}`)
  revalidatePath("/customers")
  revalidatePath("/returns")
  revalidatePath("/imei")
  revalidatePath("/pos")
  return { success: true }
}

/**
 * Every receipt for a stretch of days, for filing or handing to accounts.
 *
 * Read only. It reprints what the sales already say and changes nothing.
 */
export async function getReceiptsForRange(from: string, to: string) {
  const user = await requireUser()
  if (!(await can(user.role, "view.sales"))) return { error: "You are not allowed to see sales. Ask the main admin." as const }

  const branchId = await viewBranchFilter(user)
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Pick the first day and the last day." as const }
  }
  if (start > end) return { error: "The first day must come before the last day." as const }

  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      saleDate: { gte: start, lte: end },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      branch: true,
      user: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      items: { include: { product: true, imei: { select: { imei1: true } } } },
    },
    orderBy: { saleDate: "asc" },
    take: 500,
  })

  const settings = await getAppSettings()
  return {
    receipts: sales.map((sale) => ({
      company: settings.productName,
      invoiceNumber: sale.invoiceNumber,
      branch: sale.branch.name,
      address: settings.companyAddress || sale.branch.address,
      shopPhone: settings.companyPhone || sale.branch.phone,
      email: settings.companyEmail,
      cashier: sale.user.name ?? "Staff",
      customer: sale.customer?.name ?? null,
      customerPhone: sale.customer?.phone ?? null,
      soldAt: sale.saleDate.toISOString(),
      items: sale.items.map((item) => ({
        name: item.product.name,
        imei: item.imei?.imei1 ?? null,
        quantity: item.quantity,
        amount: money(item.totalPrice),
      })),
      total: money(sale.totalAmount),
      paid: money(sale.paidAmount),
      method: String(sale.paymentMethod),
      notes: sale.notes,
    })),
  }
}
