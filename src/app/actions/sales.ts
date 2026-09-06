"use server"

import { revalidatePath } from "next/cache"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canManageFinance, canSell, scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { generateDocNumber, money } from "@/lib/utils"
import { getSellLock } from "@/app/actions/day-close"
import { markParkedPosted } from "@/app/actions/parked"

export async function getSales() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.sale.findMany({
    where: branchId ? { branchId } : undefined,
    include: { customer: true, branch: true, user: true, items: { include: { product: true, imei: true } } },
    orderBy: { saleDate: "desc" },
    take: 100,
  })
}

export async function getSale(id: string) {
  await requireUser()
  return prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      branch: true,
      user: true,
      items: { include: { product: true, imei: true } },
      payments: true,
    },
  })
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
  if (!(await canSell(user.role))) return { error: "You cannot complete sales." }
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
  const canOverrideFloor = settings.allowBelowMinimum || (await can(user.role, "action.override_floor"))

  for (const item of input.items) {
    const product = products.find((row) => row.id === item.productId)
    if (!product) return { error: "A product in the cart is missing." }
    if (item.unitPrice < money(product.minimumPrice) && !canOverrideFloor) {
      return { error: `${product.name} is below the lowest allowed price. Raise it, or ask Super Admin.` }
    }
    if (item.imeiId) {
      const imei = await prisma.imeiRecord.findUnique({ where: { id: item.imeiId } })
      if (!imei || imei.status !== "IN_STOCK") return { error: `IMEI ${imei?.imei1 ?? ""} is not available.` }
      if (imei.branchId !== input.branchId) return { error: `${imei.imei1} is not in this shop.` }
    } else if (product._count.imeiRecords > 0) {
      return { error: `${product.name} must be sold with an IMEI from this shop.` }
    } else {
      const stock = await prisma.inventory.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId: input.branchId } },
      })
      if (!stock || stock.quantity < item.quantity) {
        return { error: `${product.name} does not have enough units at this branch.` }
      }
    }
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const paid = Math.min(Math.max(0, input.paidAmount), subtotal)
  const method = paid < subtotal ? "CREDIT" : input.paymentMethod
  const due = subtotal - paid

  if (due > 0 && !input.customerId) {
    return { error: "Credit or part-payment needs a named customer. Walk-in must pay in full." }
  }

  if (input.customerId && due > 0) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) return { error: "Customer not found." }
    const nextDebt = money(customer.currentBalance) + due
    if (money(customer.creditLimit) > 0 && nextDebt > money(customer.creditLimit) && !(await can(user.role, "action.override_floor"))) {
      return { error: `${customer.name} would exceed the credit limit of ₦${money(customer.creditLimit).toLocaleString("en-NG")}.` }
    }
  }

  const invoiceNumber = generateDocNumber("INV")

  const sale = await prisma.$transaction(async (tx) => {
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

    for (const item of input.items) {
      if (item.imeiId) {
        await tx.imeiRecord.update({
          where: { id: item.imeiId },
          data: {
            status: "SOLD",
            saleId: created.id,
            customerId: input.customerId || null,
          },
        })
        const sold = await tx.imeiRecord.findUnique({ where: { id: item.imeiId } })
        if (sold) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "UPDATE",
              entityType: "IMEIRecord",
              entityId: sold.imei1,
              oldValue: "IN_STOCK",
              newValue: JSON.stringify({ status: "SOLD", invoice: invoiceNumber }),
              branchId: input.branchId,
            },
          })
        }
      }
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: input.branchId } },
        update: { quantity: { decrement: item.quantity } },
        create: { productId: item.productId, branchId: input.branchId, quantity: 0 },
      })
    }

    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } })
      const due = subtotal - paid
      const nextBalance = money(customer?.currentBalance) + due
      await tx.customer.update({
        where: { id: input.customerId },
        data: { currentBalance: nextBalance.toFixed(2) },
      })
      await tx.ledgerEntry.create({
        data: {
          customerId: input.customerId,
          type: "SALE",
          amount: subtotal.toFixed(2),
          balance: (money(customer?.currentBalance) + subtotal).toFixed(2),
          reference: invoiceNumber,
          description: "Retail/wholesale sale",
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
            description: "Payment on invoice",
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
          description: "Sale collection",
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

    for (const item of input.items) {
      const stock = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId: input.branchId } },
      })
      if (stock) {
      const limit = lowStockLimit(stock.minStock, settings.lowStockThreshold)
      if (stock.quantity <= limit) {
        const staff = await tx.user.findMany({
          where: {
            isActive: true,
            OR: [{ branchId: input.branchId }, { role: { in: ["VAULT_MANAGER", "CEO", "BRANCH_MANAGER"] } }],
          },
        })
        for (const person of staff) {
          await tx.notification.create({
            data: {
              userId: person.id,
              type: "LOW_STOCK",
              title: "Low stock",
              message: `${products.find((row) => row.id === item.productId)?.name ?? "Item"} is at ${stock.quantity} on this branch (alert at ${limit})`,
              actionUrl: "/inventory",
            },
          })
        }
      }
      }
    }

    if (due > 0 && input.customerId) {
      const watchers = await tx.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: { in: ["ACCOUNTANT", "CEO", "SUPER_ADMIN"] } },
            { role: "BRANCH_MANAGER", branchId: input.branchId },
          ],
        },
      })
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } })
      for (const person of watchers) {
        await tx.notification.create({
          data: {
            userId: person.id,
            type: "DUE_PAYMENT",
            title: "Invoice still due",
            message: `${customer?.name ?? "Customer"} owes ₦${due.toLocaleString("en-NG")} on ${invoiceNumber}`,
            actionUrl: `/sales/${created.id}`,
          },
        })
      }
    }

    return created
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

export async function collectPayment(formData: FormData) {
  const user = await requireUser()
  const customerId = String(formData.get("customerId"))
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER") as PaymentMethod
  if (!customerId || amount <= 0) return { error: "Enter a valid payment." }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) return { error: "Customer not found." }
  if (money(customer.currentBalance) <= 0) return { error: "This customer has no outstanding balance." }

  const collected = Math.min(amount, money(customer.currentBalance))
  const payRef = generateDocNumber("PAY")

  await prisma.$transaction(async (tx) => {
    const next = money(customer.currentBalance) - collected
    await tx.customer.update({
      where: { id: customerId },
      data: { currentBalance: next.toFixed(2) },
    })
    await tx.ledgerEntry.create({
      data: {
        customerId,
        type: "PAYMENT",
        amount: (-collected).toFixed(2),
        balance: next.toFixed(2),
        reference: payRef,
        description: "Ledger collection. Invoice lines were not rewritten",
      },
    })
    await tx.financeEntry.create({
      data: {
        branchId: customer.branchId,
        account: method === "CASH" ? "CASH" : "BANK",
        type: "INCOME",
        amount: collected.toFixed(2),
        reference: payRef,
        description: `Debt collection · ${customer.name}`,
      },
    })

    let remaining = collected
    const openSales = await tx.sale.findMany({
      where: { customerId, status: "COMPLETED" },
      orderBy: { saleDate: "asc" },
    })
    for (const sale of openSales) {
      const due = money(sale.totalAmount) - money(sale.paidAmount)
      if (due <= 0 || remaining <= 0) continue
      const apply = Math.min(due, remaining)
      const nextPaid = money(sale.paidAmount) + apply
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: nextPaid.toFixed(2),
          paymentMethod: nextPaid >= money(sale.totalAmount) ? method : sale.paymentMethod,
        },
      })
      await tx.payment.create({
        data: {
          saleId: sale.id,
          amount: apply.toFixed(2),
          method,
          reference: payRef,
          notes: "Applied from customer ledger. Line items untouched.",
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
    return { error: "You cannot collect on invoices." }
  }
  const saleId = String(formData.get("saleId") || "")
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER") as PaymentMethod
  if (!saleId || amount <= 0) return { error: "Enter the amount collected." }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, items: true },
  })
  if (!sale) return { error: "Invoice not found." }
  if (sale.status !== "COMPLETED") return { error: "Only completed invoices can receive collection." }

  const due = money(sale.totalAmount) - money(sale.paidAmount)
  if (due <= 0) return { error: "This invoice is already settled." }
  const collected = Math.min(amount, due)

  await prisma.$transaction(async (tx) => {
    const nextPaid = money(sale.paidAmount) + collected
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        paidAmount: nextPaid.toFixed(2),
        paymentMethod: nextPaid >= money(sale.totalAmount) ? method : sale.paymentMethod,
      },
    })
    await tx.payment.create({
      data: {
        saleId: sale.id,
        amount: collected.toFixed(2),
        method,
        notes: "Collection on frozen invoice. Items and IMEIs were not edited",
      },
    })
    if (sale.customerId && sale.customer) {
      const next = Math.max(0, money(sale.customer.currentBalance) - collected)
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { currentBalance: next.toFixed(2) },
      })
      await tx.ledgerEntry.create({
        data: {
          customerId: sale.customerId,
          type: "PAYMENT",
          amount: (-collected).toFixed(2),
          balance: next.toFixed(2),
          reference: sale.invoiceNumber,
          description: `Collection on ${sale.invoiceNumber}`,
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
        description: `Invoice collection ${sale.invoiceNumber}`,
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
    return { error: "You cannot add a customer name to this sale." }
  }

  const saleId = String(formData.get("saleId") || "")
  const existingId = String(formData.get("customerId") || "").trim()
  const name = String(formData.get("name") || "").trim()
  const phone = String(formData.get("phone") || "").trim()

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: true, imeis: true },
  })
  if (!sale) return { error: "Invoice not found." }
  if (sale.customerId) return { error: "This sale already has a customer name. Items stay as they are." }

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

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: sale.id },
      data: { customerId: customer.id },
    })
    await tx.imeiRecord.updateMany({
      where: { saleId: sale.id },
      data: { customerId: customer.id },
    })
    if (due > 0) {
      const next = money(customer.currentBalance) + due
      await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: next.toFixed(2) },
      })
      await tx.ledgerEntry.create({
        data: {
          customerId: customer.id,
          type: "SALE",
          amount: due.toFixed(2),
          balance: next.toFixed(2),
          reference: sale.invoiceNumber,
          description: `Named buyer attached to unpaid ${sale.invoiceNumber}`,
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
        newValue: JSON.stringify({ customerId: customer.id, customer: customer.name, itemsUntouched: true, due }),
        branchId: sale.branchId,
      },
    })
  })

  revalidatePath("/sales")
  revalidatePath(`/sales/${sale.id}`)
  revalidatePath(`/customers/${customer.id}`)
  revalidatePath("/customers")
  revalidatePath("/returns")
  revalidatePath("/imei")
  revalidatePath("/pos")
  return { success: true }
}
