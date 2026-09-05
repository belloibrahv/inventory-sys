"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { UserRole } from "@/types"

// Mock inventory data for development
let mockInventory = [
  {
    id: "1",
    productId: "1",
    product: { id: "1", name: "Samsung Galaxy S24 128GB", sku: "SAMS-S24-128-BN", sellingPrice: 450000 },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    quantity: 45,
    reservedQuantity: 5,
    availableQuantity: 40,
    reorderLevel: 10,
    lastStockCheck: new Date("2024-07-15"),
    value: 20250000, // quantity * costPrice
    costPrice: 350000,
  },
  {
    id: "2",
    productId: "2",
    product: { id: "2", name: "iPhone 15 256GB", sku: "APPL-IP15-256-WH", sellingPrice: 650000 },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    quantity: 23,
    reservedQuantity: 3,
    availableQuantity: 20,
    reorderLevel: 5,
    lastStockCheck: new Date("2024-07-14"),
    value: 12650000,
    costPrice: 550000,
  },
  {
    id: "3",
    productId: "3",
    product: { id: "3", name: "Samsung A54 128GB", sku: "SAMS-A54-128-BL", sellingPrice: 250000 },
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    quantity: 8,
    reservedQuantity: 0,
    availableQuantity: 8,
    reorderLevel: 15,
    lastStockCheck: new Date("2024-07-13"),
    value: 1440000,
    costPrice: 180000,
  },
  {
    id: "4",
    productId: "1",
    product: { id: "1", name: "Samsung Galaxy S24 128GB", sku: "SAMS-S24-128-BN", sellingPrice: 450000 },
    branchId: "2",
    branch: { id: "2", name: "Ikeja Branch", code: "IKEJA" },
    quantity: 12,
    reservedQuantity: 2,
    availableQuantity: 10,
    reorderLevel: 10,
    lastStockCheck: new Date("2024-07-15"),
    value: 4200000,
    costPrice: 350000,
  },
]

// Mock stock movements for audit trail
let mockStockMovements = [
  {
    id: "1",
    inventoryId: "1",
    type: "STOCK_IN",
    quantity: 10,
    previousQuantity: 35,
    newQuantity: 45,
    reason: "Purchase from supplier",
    referenceId: "PO-001",
    referenceType: "PURCHASE",
    userId: "1",
    user: { id: "1", name: "Super Admin" },
    branchId: "1",
    createdAt: new Date("2024-07-15"),
  },
  {
    id: "2",
    inventoryId: "2",
    type: "STOCK_OUT",
    quantity: 5,
    previousQuantity: 28,
    newQuantity: 23,
    reason: "Sale to customer",
    referenceId: "SALE-001",
    referenceType: "SALE",
    userId: "1",
    user: { id: "1", name: "Super Admin" },
    branchId: "1",
    createdAt: new Date("2024-07-14"),
  },
]

export async function getInventory(filters?: {
  branchId?: string
  lowStock?: boolean
  outOfStock?: boolean
  search?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredInventory = [...mockInventory]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredInventory = filteredInventory.filter(i => i.branchId === currentUser.branchId)
    }
  }

  // Apply additional filters
  if (filters?.branchId) {
    filteredInventory = filteredInventory.filter(i => i.branchId === filters.branchId)
  }
  
  if (filters?.lowStock) {
    filteredInventory = filteredInventory.filter(i => i.availableQuantity <= i.reorderLevel)
  }
  
  if (filters?.outOfStock) {
    filteredInventory = filteredInventory.filter(i => i.availableQuantity === 0)
  }
  
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase()
    filteredInventory = filteredInventory.filter(i => 
      i.product.name.toLowerCase().includes(searchLower) ||
      i.product.sku.toLowerCase().includes(searchLower)
    )
  }

  return { success: true, inventory: filteredInventory }
}

export async function getInventoryItem(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check branch access
  const item = mockInventory.find(i => i.id === id)
  
  if (!item) {
    return { success: false, error: "Inventory item not found" }
  }

  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== item.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  return { success: true, inventoryItem: item }
}

export async function addStock(data: {
  productId: string
  branchId: string
  quantity: number
  reason: string
  referenceId?: string
  referenceType?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.role !== UserRole.VAULT_MANAGER && currentUser.role !== UserRole.BRANCH_MANAGER) {
      return { success: false, error: "Insufficient permissions" }
    }
    // Branch managers can only add stock to their branch
    if (data.branchId && data.branchId !== currentUser.branchId) {
      return { success: false, error: "Can only add stock to your branch" }
    }
  }

  // Find or create inventory item
  let inventoryItem = mockInventory.find(
    i => i.productId === data.productId && i.branchId === data.branchId
  )

  const previousQuantity = inventoryItem?.quantity || 0
  const newQuantity = previousQuantity + data.quantity

  if (inventoryItem) {
    // Update existing inventory
    inventoryItem.quantity = newQuantity
    inventoryItem.availableQuantity = newQuantity - inventoryItem.reservedQuantity
    inventoryItem.value = newQuantity * inventoryItem.costPrice
    inventoryItem.lastStockCheck = new Date()
  } else {
    // Create new inventory item
    const product = { id: data.productId, name: "Product", sku: "SKU", sellingPrice: 0 } // Mock
    const branch = { id: data.branchId, name: "Branch", code: "BRANCH" } // Mock
    inventoryItem = {
      id: Date.now().toString(),
      productId: data.productId,
      product,
      branchId: data.branchId,
      branch,
      quantity: newQuantity,
      reservedQuantity: 0,
      availableQuantity: newQuantity,
      reorderLevel: 10,
      lastStockCheck: new Date(),
      value: newQuantity * 100000, // Mock cost price
      costPrice: 100000,
    }
    mockInventory.push(inventoryItem)
  }

  // Create stock movement record
  const movement = {
    id: Date.now().toString(),
    inventoryId: inventoryItem.id,
    type: "STOCK_IN",
    quantity: data.quantity,
    previousQuantity,
    newQuantity,
    reason: data.reason,
    referenceId: data.referenceId || null,
    referenceType: data.referenceType || "MANUAL",
    userId: currentUser.id,
    user: { id: currentUser.id, name: currentUser.name || "User" },
    branchId: data.branchId,
    createdAt: new Date(),
  }
  mockStockMovements.push(movement)

  return { success: true, inventoryItem, movement }
}

export async function removeStock(data: {
  inventoryId: string
  quantity: number
  reason: string
  referenceId?: string
  referenceType?: string
}) {
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
  }

  const inventoryItem = mockInventory.find(i => i.id === data.inventoryId)
  
  if (!inventoryItem) {
    return { success: false, error: "Inventory item not found" }
  }

  // Check branch access
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== inventoryItem.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  // Check sufficient stock
  if (inventoryItem.availableQuantity < data.quantity) {
    return { success: false, error: "Insufficient stock available" }
  }

  const previousQuantity = inventoryItem.quantity
  const newQuantity = previousQuantity - data.quantity

  inventoryItem.quantity = newQuantity
  inventoryItem.availableQuantity = newQuantity - inventoryItem.reservedQuantity
  inventoryItem.value = newQuantity * inventoryItem.costPrice
  inventoryItem.lastStockCheck = new Date()

  // Create stock movement record
  const movement = {
    id: Date.now().toString(),
    inventoryId: inventoryItem.id,
    type: "STOCK_OUT",
    quantity: data.quantity,
    previousQuantity,
    newQuantity,
    reason: data.reason,
    referenceId: data.referenceId || null,
    referenceType: data.referenceType || "MANUAL",
    userId: currentUser.id,
    user: { id: currentUser.id, name: currentUser.name || "User" },
    branchId: inventoryItem.branchId,
    createdAt: new Date(),
  }
  mockStockMovements.push(movement)

  return { success: true, inventoryItem, movement }
}

export async function adjustStock(data: {
  inventoryId: string
  newQuantity: number
  reason: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin, CEO, and Branch Manager can adjust stock
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO && currentUser.role !== UserRole.BRANCH_MANAGER) {
    return { success: false, error: "Insufficient permissions" }
  }

  const inventoryItem = mockInventory.find(i => i.id === data.inventoryId)
  
  if (!inventoryItem) {
    return { success: false, error: "Inventory item not found" }
  }

  // Check branch access
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== inventoryItem.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  const previousQuantity = inventoryItem.quantity
  const difference = data.newQuantity - previousQuantity
  const type = difference > 0 ? "STOCK_IN" : "STOCK_OUT"

  inventoryItem.quantity = data.newQuantity
  inventoryItem.availableQuantity = data.newQuantity - inventoryItem.reservedQuantity
  inventoryItem.value = data.newQuantity * inventoryItem.costPrice
  inventoryItem.lastStockCheck = new Date()

  // Create stock movement record
  const movement = {
    id: Date.now().toString(),
    inventoryId: inventoryItem.id,
    type,
    quantity: Math.abs(difference),
    previousQuantity,
    newQuantity: data.newQuantity,
    reason: data.reason,
    referenceId: null,
    referenceType: "ADJUSTMENT",
    userId: currentUser.id,
    user: { id: currentUser.id, name: currentUser.name || "User" },
    branchId: inventoryItem.branchId,
    createdAt: new Date(),
  }
  mockStockMovements.push(movement)

  return { success: true, inventoryItem, movement }
}

export async function getStockMovements(filters?: {
  inventoryId?: string
  branchId?: string
  type?: string
  dateFrom?: Date
  dateTo?: Date
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredMovements = [...mockStockMovements]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredMovements = filteredMovements.filter(m => m.branchId === currentUser.branchId)
    }
  }

  // Apply additional filters
  if (filters?.inventoryId) {
    filteredMovements = filteredMovements.filter(m => m.inventoryId === filters.inventoryId)
  }
  
  if (filters?.branchId) {
    filteredMovements = filteredMovements.filter(m => m.branchId === filters.branchId)
  }
  
  if (filters?.type) {
    filteredMovements = filteredMovements.filter(m => m.type === filters.type)
  }
  
  if (filters?.dateFrom) {
    filteredMovements = filteredMovements.filter(m => m.createdAt >= filters.dateFrom)
  }
  
  if (filters?.dateTo) {
    filteredMovements = filteredMovements.filter(m => m.createdAt <= filters.dateTo)
  }

  return { success: true, movements: filteredMovements }
}

export async function getInventoryStats(branchId?: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredInventory = [...mockInventory]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredInventory = filteredInventory.filter(i => i.branchId === currentUser.branchId)
    }
  }
  
  if (branchId) {
    filteredInventory = filteredInventory.filter(i => i.branchId === branchId)
  }

  const totalProducts = filteredInventory.length
  const totalQuantity = filteredInventory.reduce((sum, i) => sum + i.quantity, 0)
  const totalValue = filteredInventory.reduce((sum, i) => sum + i.value, 0)
  const lowStockItems = filteredInventory.filter(i => i.availableQuantity <= i.reorderLevel).length
  const outOfStockItems = filteredInventory.filter(i => i.availableQuantity === 0).length

  return {
    success: true,
    stats: {
      totalProducts,
      totalQuantity,
      totalValue,
      lowStockItems,
      outOfStockItems,
    },
  }
}