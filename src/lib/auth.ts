import { NextAuthOptions } from "next-auth"
import "@/types"
import CredentialsProvider from "next-auth/providers/credentials"
import * as bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import { alertWatchers, writeAudit } from "@/lib/audit"
import { requestContext } from "@/lib/audit-meta"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").toLowerCase().trim()
        const password = String(credentials?.password || "")
        if (!email || !password) {
          throw new Error("Invalid credentials")
        }

        const user = await prisma.user.findUnique({ where: { email } })
        const valid = user?.isActive ? await bcrypt.compare(password, user.password) : false
        if (!user || !user.isActive || !valid) {
          await writeAudit({
            userId: user?.id ?? null,
            action: "LOGIN",
            entityType: "User",
            entityId: email,
            newValue: JSON.stringify({ result: "denied", reason: !user ? "unknown" : user.isActive ? "bad_password" : "locked" }),
            branchId: user?.branchId ?? null,
            success: false,
            risk: "HIGH",
          })
          const since = new Date(Date.now() - 10 * 60 * 1000)
          const fails = await prisma.auditLog.count({
            where: { action: "LOGIN", success: false, entityId: email, createdAt: { gte: since } },
          })
          if (fails >= 3) {
            await alertWatchers(
              "Repeated failed sign-in",
              `${email} failed sign-in ${fails} times in 10 minutes. Check Who did what.`
            )
          }
          throw new Error("Invalid credentials")
        }

        const ctx = await requestContext()
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), lastLoginIp: ctx.ip },
        })
        await writeAudit({
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.email,
          newValue: JSON.stringify({ result: "ok" }),
          branchId: user.branchId,
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
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null
      const id = typeof token?.id === "string" ? token.id : null
      if (!id) return
      const user = await prisma.user.findUnique({ where: { id }, select: { email: true, branchId: true } })
      await writeAudit({
        userId: id,
        action: "LOGOUT",
        entityType: "User",
        entityId: user?.email ?? id,
        branchId: user?.branchId ?? null,
      })
    },
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
