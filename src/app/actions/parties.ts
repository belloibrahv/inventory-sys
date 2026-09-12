"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { scopeRecord, viewBranchFilter } from "@/lib/branch-scope"
import { requireUser } from "@/lib/session"
import { isSuperAdmin, scopedBranchId } from "@/lib/rbac"
import type { SupplierKind } from "@prisma/client"

export async function getCustomers(search?: string) {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  return prisma.customer.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(search
        ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
        : {}),
    },
    include: {
      branch: true,
      sales: { select: { totalAmount: true, paidAmount: true } },
      _count: { select: { sales: true, returns: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getCustomer(id: string) {
  const user = await requireUser()
  // A customer ledger shows what someone owes and everything they have bought.
  // It belongs to the shop that opened the account.
  return scopeRecord(user, await prisma.customer.findUnique({
    where: { id },
    include: {
      branch: true,
      sales: { orderBy: { saleDate: "desc" }, take: 20 },
      ledgerEntries: { orderBy: { createdAt: "desc" }, take: 30 },
      returns: { orderBy: { createdAt: "desc" } },
      swaps: { orderBy: { createdAt: "desc" } },
      imeiRecords: { include: { product: true, sale: true }, orderBy: { updatedAt: "desc" }, take: 20 },
    },
  }))
}

export async function createCustomer(formData: FormData) {
  const user = await requireUser()
  const phone = String(formData.get("phone") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const branchId = String(formData.get("branchId") ?? user.branchId ?? "")
  if (!name || !phone || !branchId) return { error: "Name, phone and branch are required." }

  const exists = await prisma.customer.findUnique({ where: { phone } })
  if (exists) return { error: "A customer with this phone already exists." }

  const customer = await prisma.customer.create({
    data: {
      name,
      phone,
      email: String(formData.get("email") || "") || null,
      address: String(formData.get("address") || "") || null,
      branchId,
      creditLimit: Number(formData.get("creditLimit") || 0).toFixed(2),
      notes: String(formData.get("notes") || "") || null,
    },
  })
  revalidatePath("/customers")
  revalidatePath("/pos")
  revalidatePath("/sales")
  return { success: true, id: customer.id }
}

export async function getSuppliers() {
  await requireUser()
  return prisma.supplier.findMany({
    include: {
      _count: { select: { purchases: true, imeiRecords: true } },
      purchases: { select: { totalAmount: true, paidAmount: true } },
    },
    orderBy: { name: "asc" },
  })
}

export async function getSupplier(id: string) {
  await requireUser()
  return prisma.supplier.findUnique({
    where: { id },
    include: {
      purchases: {
        include: { branch: true, items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
      },
      imeiRecords: {
        include: { product: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
    },
  })
}

export async function createSupplier(formData: FormData) {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  if (!name || !phone) return { error: "Name and phone are required." }
  await prisma.supplier.create({
    data: {
      name,
      phone,
      contactPerson: String(formData.get("contactPerson") || "") || null,
      email: String(formData.get("email") || "") || null,
      address: String(formData.get("address") || "") || null,
      country: String(formData.get("country") || "").trim() || null,
      city: String(formData.get("city") || "").trim() || null,
      kind: (String(formData.get("kind") || "SUPPLIER") === "NEIGHBOR" ? "NEIGHBOR" : "SUPPLIER") as SupplierKind,
    },
  })
  revalidatePath("/suppliers")
  return { success: true }
}

export async function getBranches() {
  await requireUser()
  return prisma.branch.findMany({
    include: {
      _count: { select: { users: true, customers: true, imeiRecords: true, sales: true } },
    },
    orderBy: [{ isHq: "desc" }, { isActive: "desc" }, { name: "asc" }],
  })
}

export async function createBranch(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can create branches." }
  const code = String(formData.get("code") ?? "").trim().toUpperCase()
  const name = String(formData.get("name") ?? "").trim()
  if (!code || !name) return { error: "Name and code are required." }
  await prisma.branch.create({
    data: {
      name,
      code,
      address: String(formData.get("address") || "Nigeria"),
      phone: String(formData.get("phone") || "") || null,
      email: String(formData.get("email") || "") || null,
    },
  })
  revalidatePath("/branches")
  return { success: true }
}

export async function toggleBranch(id: string) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can deactivate or restore branches." }
  const branch = await prisma.branch.findUnique({ where: { id } })
  if (!branch) return { error: "Branch not found." }
  await prisma.branch.update({ where: { id }, data: { isActive: !branch.isActive } })
  revalidatePath("/branches")
  return { success: true }
}
