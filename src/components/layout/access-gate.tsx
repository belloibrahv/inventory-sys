"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { pathIsAllowed } from "@/lib/access-path"

export function AccessGate({
  allowedHrefs,
  fallback,
}: {
  allowedHrefs: string[]
  fallback: string
}) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathIsAllowed(pathname, allowedHrefs)) router.replace(fallback)
  }, [allowedHrefs, fallback, pathname, router])

  return null
}
