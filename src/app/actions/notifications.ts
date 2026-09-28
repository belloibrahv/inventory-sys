"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"

/** One alert opened: it is read. Only the owner's own alerts are touched. */
export async function markNotificationRead(id: string) {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { id, userId: user.id, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
  revalidatePath("/notifications")
  return { success: true }
}

export async function markAllNotificationsRead() {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { userId: user.id, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
  revalidatePath("/notifications")
  return { success: true }
}
