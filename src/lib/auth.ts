import { NextAuthOptions } from "next-auth"
import "@/types"
import CredentialsProvider from "next-auth/providers/credentials"
import * as bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials")
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user || !user.isActive) {
          throw new Error("Invalid credentials")
        }

        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) {
          throw new Error("Invalid credentials")
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "LOGIN",
            entityType: "User",
            entityId: user.id,
            branchId: user.branchId,
          },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60,
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
        session.user.branchId = (token.branchId as string | null) ?? null
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
