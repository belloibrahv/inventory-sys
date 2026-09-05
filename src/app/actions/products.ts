"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { UserRole, ProductCondition } from "@/types"

// Mock product data for development
let mockProducts = [
  {
    id: "1",
    sku: "SAMS-S24-128-BN",
    name: "Samsung Galaxy S24 128GB",
    description: "Latest Samsung flagship with AI features",
    brandId: "1",
    brand: { id: "1", name: "Samsung" },
    categoryId: "1",
    category: { id: "1", name: "Smartphones" },
    condition: ProductCondition.BRAND_NEW,
    color: "Titanium Black",
    storage: "128GB",
    ram: "8GB",
    costPrice: 350000,
    minimumPrice: 380000,
    sellingPrice: 450000,
    marketPrice: 480000,
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    isActive: true,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  },
  {
    id: "2",
    sku: "APPL-IP15-256-WH",
    name: "iPhone 15 256GB",
    description: "Apple iPhone 15 with A17 chip",
    brandId: "2",
    brand: { id: "2", name: "Apple" },
    categoryId: "1",
    category: { id: "1", name: "Smartphones" },
    condition: ProductCondition.BRAND_NEW,
    color: "White",
    storage: "256GB",
    ram: "6GB",
    costPrice: 550000,
    minimumPrice: 580000,
    sellingPrice: 650000,
    marketPrice: 700000,
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    isActive: true,
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date("2024-01-20"),
  },
  {
    id: "3",
    sku: "SAMS-A54-128-BL",
    name: "Samsung A54 128GB",
    description: "Mid-range Samsung smartphone",
    brandId: "1",
    brand: { id: "1", name: "Samsung" },
    categoryId: "1",
    category: { id: "1", name: "Smartphones" },
    condition: ProductCondition.UK_USED,
    color: "Black",
    storage: "128GB",
    ram: "6GB",
    costPrice: 180000,
    minimumPrice: 200000,
    sellingPrice: 250000,
    marketPrice: 280000,
    branchId: "1",
    branch: { id: "1", name: "Main Branch", code: "MAIN" },
    isActive: true,
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2024-02-01"),
  },
]

// Mock brands and categories
const mockBrands = [
  { id: "1", name: "Samsung" },
  { id: "2", name: "Apple" },
  { id: "3", name: "Xiaomi" },
  { id: "4", name: "Oppo" },
  { id: "5", name: "Tecno" },
]

const mockCategories = [
  { id: "1", name: "Smartphones" },
  { id: "2", name: "Tablets" },
  { id: "3", name: "Accessories" },
  { id: "4", name: "Wearables" },
]

export async function getProducts(filters?: {
  branchId?: string
  condition?: ProductCondition
  categoryId?: string
  brandId?: string
  search?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Filter by branch access
  let filteredProducts = [...mockProducts]
  
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      filteredProducts = filteredProducts.filter(p => p.branchId === currentUser.branchId)
    }
  }

  // Apply additional filters
  if (filters?.branchId) {
    filteredProducts = filteredProducts.filter(p => p.branchId === filters.branchId)
  }
  
  if (filters?.condition) {
    filteredProducts = filteredProducts.filter(p => p.condition === filters.condition)
  }
  
  if (filters?.categoryId) {
    filteredProducts = filteredProducts.filter(p => p.categoryId === filters.categoryId)
  }
  
  if (filters?.brandId) {
    filteredProducts = filteredProducts.filter(p => p.brandId === filters.brandId)
  }
  
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase()
    filteredProducts = filteredProducts.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      p.sku.toLowerCase().includes(searchLower) ||
      p.description?.toLowerCase().includes(searchLower)
    )
  }

  return { success: true, products: filteredProducts }
}

export async function getProduct(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check branch access
  const product = mockProducts.find(p => p.id === id)
  
  if (!product) {
    return { success: false, error: "Product not found" }
  }

  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== product.branchId) {
      return { success: false, error: "Access denied" }
    }
  }

  return { success: true, product }
}

export async function createProduct(data: {
  sku: string
  name: string
  description?: string
  brandId: string
  categoryId: string
  condition: ProductCondition
  color?: string
  storage?: string
  ram?: string
  costPrice: number
  minimumPrice: number
  sellingPrice: number
  marketPrice?: number
  branchId: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.role !== UserRole.BRANCH_MANAGER && currentUser.role !== UserRole.VAULT_MANAGER) {
      return { success: false, error: "Insufficient permissions" }
    }
    // Branch managers can only create products for their branch
    if (data.branchId && data.branchId !== currentUser.branchId) {
      return { success: false, error: "Can only create products for your branch" }
    }
  }

  // Check if SKU already exists
  if (mockProducts.some(p => p.sku === data.sku)) {
    return { success: false, error: "SKU already exists" }
  }

  const brand = mockBrands.find(b => b.id === data.brandId)
  const category = mockCategories.find(c => c.id === data.categoryId)
  const branch = { id: data.branchId, name: "Branch", code: "BRANCH" } // Mock branch

  const newProduct = {
    id: Date.now().toString(),
    ...data,
    brand,
    category,
    branch,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  mockProducts.push(newProduct)

  return { success: true, product: newProduct }
}

export async function updateProduct(id: string, data: {
  name?: string
  description?: string
  costPrice?: number
  minimumPrice?: number
  sellingPrice?: number
  marketPrice?: number
  isActive?: boolean
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.role !== UserRole.BRANCH_MANAGER && currentUser.role !== UserRole.VAULT_MANAGER) {
      return { success: false, error: "Insufficient permissions" }
    }
    // Branch managers can only update products in their branch
    const product = mockProducts.find(p => p.id === id)
    if (!product || product.branchId !== currentUser.branchId) {
      return { success: false, error: "Can only update products in your branch" }
    }
  }

  const productIndex = mockProducts.findIndex(p => p.id === id)
  
  if (productIndex === -1) {
    return { success: false, error: "Product not found" }
  }

  mockProducts[productIndex] = {
    ...mockProducts[productIndex],
    ...data,
    updatedAt: new Date(),
  }

  return { success: true, product: mockProducts[productIndex] }
}

export async function deleteProduct(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin can delete products
  if (currentUser.role !== UserRole.SUPER_ADMIN) {
    return { success: false, error: "Insufficient permissions" }
  }

  const productIndex = mockProducts.findIndex(p => p.id === id)
  
  if (productIndex === -1) {
    return { success: false, error: "Product not found" }
  }

  mockProducts.splice(productIndex, 1)

  return { success: true }
}

export async function getBrands() {
  return { success: true, brands: mockBrands }
}

export async function getCategories() {
  return { success: true, categories: mockCategories }
}