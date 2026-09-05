"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { UserRole, IMEIStatus } from "@/types"

// Mock IMEI data for development
let mockIMEIRecords = [
  {
    id: "1",
    imei1: "356938090123456",
    imei2: "356938090123457",
    serialNumber: "SN123456789",
    productId: "1",
    product: { id: "1", name: "Samsung Galaxy S24 128GB", sku: "SAMS-S24-128-BN" },
    supplierId: "1",
    supplier: { id: "1", name: "Samsung Electronics" },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    status: IMEIStatus.IN_STOCK,
    customerId: null,
    customer: null,
    saleId: null,
    returnId: null,
    swapId: null,
    repairId: null,
    notes: null,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  },
  {
    id: "2",
    imei1: "358938090234567",
    imei2: "358938090234568",
    serialNumber: "SN234567890",
    productId: "2",
    product: { id: "2", name: "iPhone 15 256GB", sku: "APPL-IP15-256-WH" },
    supplierId: "2",
    supplier: { id: "2", name: "Apple Inc" },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    status: IMEIStatus.SOLD,
    customerId: "1",
    customer: { id: "1", name: "John Doe", phone: "+234 123 456 7890" },
    saleId: "1",
    notes: "Sold to regular customer",
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date("2024-01-20"),
  },
  {
    id: "3",
    imei1: "352938090345678",
    imei2: null,
    serialNumber: "SN345678901",
    productId: "3",
    product: { id: "3", name: "Samsung A54 128GB", sku: "SAMS-A54-128-BL" },
    supplierId: "1",
    supplier: { id: "1", name: "Samsung Electronics" },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    status: IMEIStatus.REPAIRED,
    customerId: null,
    customer: null,
    saleId: null,
    returnId: null,
    swapId: null,
    repairId: "1",
    notes: "Screen replacement completed",
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2024-02-15"),
  },
]

export async function getIMEIRecords(filters?: {
  branchId?: string
  status?: IMEIStatus
  productId?: string
  search?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredRecords = [...mockIMEIRecords]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredRecords = filteredRecords.filter(r => r.branchId === currentUser.branchId)
    }
  }

  // Apply additional filters
  if (filters?.branchId) {
    filteredRecords = filteredRecords.filter(r => r.branchId === filters.branchId)
  }
  
  if (filters?.status) {
    filteredRecords = filteredRecords.filter(r => r.status === filters.status)
  }
  
  if (filters?.productId) {
    filteredRecords = filteredRecords.filter(r => r.productId === filters.productId)
  }
  
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase()
    filteredRecords = filteredRecords.filter(r => 
      r.imei1.includes(searchLower) ||
      r.imei2?.includes(searchLower) ||
      r.serialNumber?.toLowerCase().includes(searchLower)
    )
  }

  return { success: true, imeiRecords: filteredRecords }
}

export async function getIMEIRecord(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check branch access
  const record = mockIMEIRecords.find(r => r.id === id)
  
  if (!record) {
    return { success: false, error: "IMEI record not found" }
  }

  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== record.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  return { success: true, imeiRecord: record }
}

export async function createIMEIRecord(data: {
  imei1: string
  imei2?: string
  serialNumber?: string
  productId: string
  supplierId?: string
  branchId: string
  notes?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.role !== UserRole.VAULT_MANAGER) {
      return { success: false, error: "Insufficient permissions" }
    }
    // Vault managers can only create IMEI records for their branch
    if (data.branchId && data.branchId !== currentUser.branchId) {
      return { success: false, error: "Can only create IMEI records for your branch" }
    }
  }

  // Check if IMEI1 already exists
  if (mockIMEIRecords.some(r => r.imei1 === data.imei1)) {
    return { success: false, error: "IMEI1 already exists" }
  }

  // Check if IMEI2 already exists
  if (data.imei2 && mockIMEIRecords.some(r => r.imei2 === data.imei2)) {
    return { success: false, error: "IMEI2 already exists" }
  }

  const product = { id: data.productId, name: "Product", sku: "SKU" } // Mock product
  const supplier = data.supplierId ? { id: data.supplierId, name: "Supplier" } : null
  const branch = { id: data.branchId, name: "Branch", code: "BRANCH" } // Mock branch

  const newRecord = {
    id: Date.now().toString(),
    imei1: data.imei1,
    imei2: data.imei2 || null,
    serialNumber: data.serialNumber || null,
    productId: data.productId,
    product,
    supplierId: data.supplierId || null,
    supplier,
    branchId: data.branchId,
    branch,
    status: IMEIStatus.IN_STOCK,
    customerId: null,
    customer: null,
    saleId: null,
    returnId: null,
    swapId: null,
    repairId: null,
    notes: data.notes || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  mockIMEIRecords.push(newRecord)

  return { success: true, imeiRecord: newRecord }
}

export async function updateIMEIStatus(id: string, status: IMEIStatus, notes?: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.role !== UserRole.VAULT_MANAGER && currentUser.role !== UserRole.CASHIER) {
      return { success: false, error: "Insufficient permissions" }
    }
    // Check branch access
    const record = mockIMEIRecords.find(r => r.id === id)
    if (!record || record.branchId !== currentUser.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  const recordIndex = mockIMEIRecords.findIndex(r => r.id === id)
  
  if (recordIndex === -1) {
    return { success: false, error: "IMEI record not found" }
  }

  mockIMEIRecords[recordIndex] = {
    ...mockIMEIRecords[recordIndex],
    status,
    notes: notes || mockIMEIRecords[recordIndex].notes,
    updatedAt: new Date(),
  }

  return { success: true, imeiRecord: mockIMEIRecords[recordIndex] }
}

export async function searchIMEI(query: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredRecords = [...mockIMEIRecords]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredRecords = filteredRecords.filter(r => r.branchId === currentUser.branchId)
    }
  }

  const searchLower = query.toLowerCase()
  const results = filteredRecords.filter(r => 
    r.imei1.includes(searchLower) ||
    r.imei2?.includes(searchLower) ||
    r.serialNumber?.toLowerCase().includes(searchLower)
  )

  return { success: true, results }
}