"use client"

import * as React from "react"
import { AlertOctagon, RefreshCw } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("Global uncaught application error:", error)
  }, [error])

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-950/20">
            <AlertOctagon className="h-6 w-6" />
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-xl font-bold tracking-tight">Application Failure</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              An unexpected system runtime exception occurred. Cached data and local offline records remain securely preserved on your device.
            </p>
          </div>

          {error.digest ? (
            <div className="mt-4 rounded-lg bg-slate-100 p-3 text-center dark:bg-slate-800">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Diagnostic Tracking ID
              </span>
              <p className="mt-0.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                {error.digest}
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-blue-700 active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Application
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/dashboard"
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-transparent px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
