import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { AppFrame } from "@/components/layout/frame"
import { getAllowedKeys, hrefsForKeys } from "@/lib/permissions"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const unread = await prisma.notification.count({
    where: { userId: user.id, status: "UNREAD" },
  })
  const keys = await getAllowedKeys(user.role)
  const allowedHrefs = hrefsForKeys(keys)
  if (allowedHrefs.length === 0) redirect("/login")

  return (
    <AppFrame unread={unread} user={{ name: user.name, role: user.role }} allowedHrefs={allowedHrefs}>
      {children}
    </AppFrame>
  )
}
