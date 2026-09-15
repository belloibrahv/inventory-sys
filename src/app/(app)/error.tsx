"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Copy, Check, RefreshCw, Home, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Enterprise Application Error Boundary.
 * Handles runtime component errors, route loading failures, and server action exceptions.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine

  useEffect(() => {
    console.error("[Enterprise Error Boundary caught exception]:", error)
  }, [error])

  const copyDiagnostics = () => {
    const diagnosticPayload = JSON.stringify(
      {
        digest: error.digest ?? "N/A",
        message: error.message,
        timestamp: new Date().toISOString(),
        url: typeof window !== "undefined" ? window.location.href : "N/A",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
        online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
      },
      null,
      2
    )

    if (navigator.clipboard) {
      navigator.clipboard.writeText(diagnosticPayload).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
      })
    }
  }

  return (
    <div className="mx-auto my-12 max-w-xl px-4 text-center sm:px-6">
      <div className="surface-card overflow-hidden rounded-2xl border border-border p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          {isOffline ? <WifiOff className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {isOffline ? "Network Connection Interrupted" : "Application View Error"}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {isOffline
            ? "The system could not load this view because your internet connection is currently offline. Any offline transactions or local registry counts remain safely preserved in device memory."
            : "An unhandled exception occurred while rendering this module. Your session data and pending transactions have not been lost."}
        </p>

        {error.digest ? (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-3.5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Diagnostic Trace ID
              </span>
              <button
                type="button"
                onClick={copyDiagnostics}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Diagnostics</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 font-mono text-xs font-semibold text-foreground break-all">
              {error.digest}
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                window.location.replace("/offline")
                return
              }
              retry()
            }}
            className="min-h-11 gap-2 font-medium"
          >
            <RefreshCw className="h-4 w-4" />
            {isOffline ? "Open the phone copy" : "Retry View"}
          </Button>

          <Button
            type="button"
            variant="outline"
            asChild
            className="min-h-11 gap-2 font-medium"
          >
            <Link href={isOffline ? "/offline" : "/dashboard"}>
              <Home className="h-4 w-4" />
              {isOffline ? "Sell now" : "Return to Dashboard"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
