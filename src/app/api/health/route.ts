import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
}

/** How long the database may take to answer before the app counts as down. */
const DB_TIMEOUT_MS = 3000

/**
 * GET is the deploy health check (Railway, uptime monitors). It asks the
 * database for one row, so a server that is up but cut off from its data
 * reports 503 instead of passing and sending shops to a broken app.
 */
export async function GET() {
  const start = Date.now()
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("database timed out")), DB_TIMEOUT_MS)),
    ])
    return NextResponse.json(
      { status: "ok", database: "ok", dbMs: Date.now() - start, timestamp: new Date().toISOString(), service: "inventory-sys" },
      { status: 200, headers: NO_STORE }
    )
  } catch (error) {
    console.error("[health] database check failed", error)
    return NextResponse.json(
      { status: "degraded", database: "unreachable", timestamp: new Date().toISOString(), service: "inventory-sys" },
      { status: 503, headers: NO_STORE }
    )
  }
}

/**
 * HEAD is the browser's "is the network up" ping, sent by every open tab every
 * 30 seconds (lib/network-status.ts). It stays free: no database work.
 */
export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE })
}
