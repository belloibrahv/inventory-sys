import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import * as bcrypt from "bcryptjs"
import { UserRole } from "@/types"

// Mock user data for development (will be replaced with database)
const mockUsers = [
  {
    id: "1",
    email: "admin@abutwins.com",
    password: "$2b$10$bpNZ3Ms8pECrVgpWccGGsuh5Gn/xEhXUVCk.bScu0ft4gmMXDBIg6", // admin123
    name: "Super Admin",
    role: UserRole.SUPER_ADMIN,
    branchId: null,
  },
  {
    id: "2",
    email: "ceo@abutwins.com",
    password: "$2b$10$dfo.c69plhSLN7BZpIAnRe/xBm71sJv1/AX7QUglwOcKZ04lFg5TS", // ceo123
    name: "CEO",
    role: UserRole.CEO,
    branchId: null,
  },
]

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials")
        }

        // For development, use mock users
        const user = mockUsers.find(u => u.email === credentials.email)
        
        if (!user) {
          throw new Error("Invalid credentials")
        }

        // Simple password check for development
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error("Invalid credentials")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.branchId = user.branchId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.branchId = token.branchId as string | null
      }
      return session
    }
  },
  secret: "your-secret-key-change-this-in-production-min-32-characters-long",
}