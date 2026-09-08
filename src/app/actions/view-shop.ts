"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canSeeAllBranches } from "@/lib/rbac"
import { VIEW_SHOP_COOKIE } from "@/lib/branch-scope"

/**
 * Head office picking which shop to look at, or all three together.
 *
 * Only a role that may see every shop can set this. For everyone else the
 * cookie is ignored on the way out as well, so setting it by hand achieves
 * nothing.
 */
export async function setViewShop(branchId: string) {
  const user = await requireUser()
  if (!(await canSeeAllBranches(user.role))) {
    return { error: "You only work in your own shop." }
  }

  if (branchId !== "ALL") {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true },
    })
    if (!branch) return { error: "That shop is not open." }
  }

  const jar = await cookies()
  jar.set(VIEW_SHOP_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  })

  revalidatePath("/", "layout")
  return { success: true }
}

/** The shops head office may switch between, plus the one showing now. */
export async function getViewShopOptions() {
  const user = await requireUser()
  if (!(await canSeeAllBranches(user.role))) return null
  const [branches, jar] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    cookies(),
  ])
  return {
    branches,
    active: jar.get(VIEW_SHOP_COOKIE)?.value ?? "ALL",
  }
}
