import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function getSession() {
  return getServerSession(authOptions)
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session?.user?.id) return null
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      branchId: true,
      isActive: true,
      mustChangePassword: true,
      sessionsValidAfter: true,
    },
  })
  if (!row || !row.isActive) return null
  // A session signed in before the password last changed is over.
  if (row.sessionsValidAfter && (!session.issuedAt || session.issuedAt * 1000 < row.sessionsValidAfter.getTime())) {
    return null
  }
  const { sessionsValidAfter: _validAfter, ...user } = row
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}
