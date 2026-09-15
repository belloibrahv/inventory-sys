"use client"

import { useEffect } from "react"
import { savePageSnapshot } from "@/lib/page-cache"

/**
 * Writes the list currently on screen onto this phone, so the same screen
 * can still open when the line drops.
 */
export function CachePageData({
  pageKey,
  title,
  data,
}: {
  pageKey: string
  title: string
  data: unknown
}) {
  useEffect(() => {
    void savePageSnapshot(pageKey, title, data)
  }, [pageKey, title, data])
  return null
}
