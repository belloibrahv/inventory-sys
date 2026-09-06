import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { AppFrame } from "@/components/layout/frame"
import { getAllowedKeys, hrefsForKeys, pathIsAllowed } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"

const WATCHED = ["/audit", "/settings", "/staff", "/staff/access", "/finance", "/finance/close", "/reports"]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const unread = await prisma.notification.count({
    where: { userId: user.id, status: "UNREAD" },
  })
  const keys = await getAllowedKeys(user.role)
  const allowedHrefs = hrefsForKeys(keys)
  if (allowedHrefs.length === 0) redirect("/login")

  const pathname = (await headers()).get("x-pathname") || ""
  if (pathname && pathname !== "/account") {
    try {
      if (!pathIsAllowed(pathname, allowedHrefs)) {
        await writeAudit({
          userId: user.id,
          action: "DENIED",
          entityType: "Access",
          entityId: pathname,
          newValue: JSON.stringify({ role: user.role }),
          branchId: user.branchId,
          success: false,
          risk: "HIGH",
          path: pathname,
        })
      } else if (WATCHED.some((href) => pathname === href || pathname.startsWith(`${href}/`))) {
        await writeAudit({
          userId: user.id,
          action: "VIEW",
          entityType: "Screen",
          entityId: pathname,
          branchId: user.branchId,
          path: pathname,
          risk: "LOW",
        })
      }
    } catch {
      // never block the shop if the trail cannot write
    }
  }

  return (
    <AppFrame unread={unread} user={{ name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }} allowedHrefs={allowedHrefs}>
      {children}
    </AppFrame>
  )
}
