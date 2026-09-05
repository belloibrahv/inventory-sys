import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { redirect } from "next/navigation"
import { UserRole } from "@/types"

export async function getSession() {
  return await getServerSession(authOptions)
}

export async function getCurrentUser() {
  const session = await getSession()
  return session?.user
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  return session
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireAuth()
  const userRole = session.user.role as UserRole
  
  if (!allowedRoles.includes(userRole)) {
    redirect("/unauthorized")
  }
  
  return session
}

export async function requireSuperAdmin() {
  return requireRole([UserRole.SUPER_ADMIN])
}

export async function requireCEO() {
  return requireRole([UserRole.SUPER_ADMIN, UserRole.CEO])
}

export async function requireAuditor() {
  return requireRole([UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.AUDITOR])
}

export async function requireAccountant() {
  return requireRole([UserRole.SUPER_ADMIN, UserRole.CEO, UserRole.ACCOUNTANT])
}

export async function requireBranchManager() {
  return requireRole([
    UserRole.SUPER_ADMIN, 
    UserRole.CEO, 
    UserRole.BRANCH_MANAGER
  ])
}

export async function requireVaultManager() {
  return requireRole([
    UserRole.SUPER_ADMIN, 
    UserRole.CEO, 
    UserRole.BRANCH_MANAGER,
    UserRole.VAULT_MANAGER
  ])
}

export async function requireCashier() {
  return requireRole([
    UserRole.SUPER_ADMIN, 
    UserRole.CEO, 
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.SALES_EXECUTIVE
  ])
}

export async function requireEngineer() {
  return requireRole([
    UserRole.SUPER_ADMIN, 
    UserRole.CEO, 
    UserRole.BRANCH_MANAGER,
    UserRole.ENGINEER
  ])
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.SUPER_ADMIN]: 9,
    [UserRole.CEO]: 8,
    [UserRole.AUDITOR]: 7,
    [UserRole.ACCOUNTANT]: 6,
    [UserRole.BRANCH_MANAGER]: 5,
    [UserRole.VAULT_MANAGER]: 4,
    [UserRole.CASHIER]: 3,
    [UserRole.SALES_EXECUTIVE]: 2,
    [UserRole.ENGINEER]: 1,
  }
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

export function canAccessBranch(userRole: UserRole, userBranchId: string | null, targetBranchId: string): boolean {
  // Super admins and CEOs can access all branches
  if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.CEO) {
    return true
  }
  
  // Other roles can only access their own branch
  return userBranchId === targetBranchId
}