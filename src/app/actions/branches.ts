"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { UserRole } from "@/types"

// Mock branch data for development
let mockBranches = [
  {
    id: "1",
    name: "Main Branch",
    code: "MAIN",
    address: "123 Main Street, Lagos",
    phone: "+234 123 456 7890",
    email: "main@abutwins.com",
    isActive: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
  {
    id: "2",
    name: "Ikeja Branch",
    code: "IKEJA",
    address: "45 Ikeja Mall Road, Lagos",
    phone: "+234 234 567 8901",
    email: "ikeja@abutwins.com",
    isActive: true,
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2024-02-01"),
  },
]

export async function getBranches() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin and CEO can see all branches
  // Branch managers can only see their own branch
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId) {
      const branch = mockBranches.find(b => b.id === currentUser.branchId)
      return { success: true, branches: branch ? [branch] : [] }
    }
    return { success: true, branches: [] }
  }

  return { success: true, branches: mockBranches }
}

export async function getBranch(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Check permissions
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    if (currentUser.branchId !== id) {
      return { success: false, error: "Access denied" }
    }
  }

  const branch = mockBranches.find(b => b.id === id)
  
  if (!branch) {
    return { success: false, error: "Branch not found" }
  }

  return { success: true, branch }
}

export async function createBranch(data: {
  name: string
  code: string
  address: string
  phone?: string
  email?: string
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin and CEO can create branches
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    return { success: false, error: "Insufficient permissions" }
  }

  // Check if code already exists
  if (mockBranches.some(b => b.code === data.code)) {
    return { success: false, error: "Branch code already exists" }
  }

  const newBranch = {
    id: Date.now().toString(),
    ...data,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  mockBranches.push(newBranch)

  return { success: true, branch: newBranch }
}

export async function updateBranch(id: string, data: {
  name?: string
  address?: string
  phone?: string
  email?: string
  isActive?: boolean
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin and CEO can update branches
  if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.CEO) {
    return { success: false, error: "Insufficient permissions" }
  }

  const branchIndex = mockBranches.findIndex(b => b.id === id)
  
  if (branchIndex === -1) {
    return { success: false, error: "Branch not found" }
  }

  mockBranches[branchIndex] = {
    ...mockBranches[branchIndex],
    ...data,
    updatedAt: new Date(),
  }

  return { success: true, branch: mockBranches[branchIndex] }
}

export async function deactivateBranch(id: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return { success: false, error: "Unauthorized" }
  }

  const currentUser = session.user

  // Only Super Admin can deactivate branches
  if (currentUser.role !== UserRole.SUPER_ADMIN) {
    return { success: false, error: "Insufficient permissions" }
  }

  const branchIndex = mockBranches.findIndex(b => b.id === id)
  
  if (branchIndex === -1) {
    return { success: false, error: "Branch not found" }
  }

  mockBranches[branchIndex].isActive = false
  mockBranches[branchIndex].updatedAt = new Date()

  return { success: true, branch: mockBranches[branchIndex] }
}