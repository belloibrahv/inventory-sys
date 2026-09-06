import { UserRole } from "@prisma/client"

export type { UserRole }

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: UserRole
      branchId: string | null
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    role: UserRole
    branchId: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    branchId: string | null
  }
}
