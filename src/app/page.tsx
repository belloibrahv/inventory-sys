import { redirect } from "next/navigation"
import { firstAllowedHref, getAllowedKeys } from "@/lib/permissions"
import { getCurrentUser } from "@/lib/session"

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  redirect(firstAllowedHref(await getAllowedKeys(user.role)))
}
