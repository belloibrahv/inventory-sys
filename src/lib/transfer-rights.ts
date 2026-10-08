import { isShopOwner } from "@/lib/roles"
import type { UserRole } from "@prisma/client"

/** Shop staff who may take in a transfer for their own shop. */
const RECEIVING_ROLES: readonly string[] = ["BRANCH_MANAGER", "VAULT_MANAGER"]

/**
 * Who may accept or reject a shop-to-shop transfer: the CEO and the main admin
 * for any shop, and the receiving shop's own manager or vault manager for that
 * shop only. Nobody accepts on another shop's behalf, so the person who sent it
 * can only watch it and is told when it is decided.
 */
export function mayDecideTransfer(user: { role: string; branchId: string | null }, toBranchId: string) {
  return isShopOwner(user.role as UserRole) || (RECEIVING_ROLES.includes(user.role) && user.branchId === toBranchId)
}

/** Who can decide, in the shop's words, for messages. */
export function transferDeciders(shopName: string) {
  return `the manager or vault manager of ${shopName}, the CEO or the main admin`
}
