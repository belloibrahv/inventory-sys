"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shown when a shop screen fails to load.
 *
 * Note this version of Next hands the boundary `retry`, not the older `reset`.
 * See node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="surface-card mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">This page did not open</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing you were doing was lost. Try the page again. If it still does not open,
        tell the person who looks after the system and give them the number below.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">Number {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>Try this page again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to Home</Link>
        </Button>
      </div>
    </div>
  )
}
