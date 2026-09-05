// Mock Prisma client for development (will be replaced with real Prisma when disk space allows)
export const prisma = {
  user: {
    findUnique: async ({ where }: any) => {
      // Mock implementation
      return null
    },
    findMany: async () => {
      return []
    },
    create: async (data: any) => {
      return data.data
    },
    update: async ({ where, data }: any) => {
      return { ...where, ...data }
    },
    delete: async ({ where }: any) => {
      return where
    },
  },
  branch: {
    findUnique: async () => null,
    findMany: async () => [],
  },
  $disconnect: async () => {},
}