"use client"

import { signOut } from "next-auth/react"

const SHOP_CACHES = ["app-pages", "app-rsc"]

/**
 * Sign out must leave the shop chrome in one step.
 *
 * Client navigation to /login while the signed-in layout is still mounted
 * draws the shop skeleton, or a cached Home, then Sign in. A full replace
 * after the session is cleared skips that half page.
 */
export async function leaveTheShop() {
  try {
    await signOut({ redirect: false })
  } catch {
    // Still send them to Sign in. A stuck session is worse than a extra click.
  }
  try {
    if (typeof caches !== "undefined") {
      await Promise.all(SHOP_CACHES.map((name) => caches.delete(name)))
    }
  } catch {
    // Cache clear is best effort. Sign in still loads from the live server.
  }
  window.location.replace("/login")
}
