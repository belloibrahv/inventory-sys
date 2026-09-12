"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { UploadResult } from "@/app/actions/uploads"

/**
 * One step of the loading job.
 *
 * The whole sheet is checked before anything is written, so this either reports
 * every line that needs fixing, or says how many rows went in. It never leaves
 * the shop half loaded.
 */
export function UploadCard({
  step,
  title,
  what,
  columns,
  action,
  done,
  doneLabel,
  locked,
  lockedWhy,
}: {
  step: number
  title: string
  what: string
  columns: string[]
  action: (formData: FormData) => Promise<UploadResult>
  done: number
  doneLabel: string
  locked?: boolean
  lockedWhy?: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {step}
          </span>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {done.toLocaleString("en-NG")} {doneLabel}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{what}</p>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Columns: </span>
        {columns.join(" · ")}
      </p>

      {locked ? (
        <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          {lockedWhy}
        </p>
      ) : (
        <form
          ref={formRef}
          className="mt-4 flex flex-wrap items-center gap-2"
          action={async (formData) => {
            setBusy(true)
            setProblems([])
            let result: UploadResult
            try {
              result = await action(formData)
            } catch {
              setBusy(false)
              toast.error("That did not reach the shop system. Check your network and try again.")
              return
            }
            setBusy(false)
            if (result.error) {
              toast.error(result.error)
              setProblems(result.problems ?? [])
              return
            }
            const skipped = result.skipped ? `, ${result.skipped} already on the system` : ""
            toast.success(`${result.added?.toLocaleString("en-NG") ?? 0} row(s) loaded${skipped}.`)
            formRef.current?.reset()
            router.refresh()
          }}
        >
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,.xls,text/csv"
            required
            disabled={busy}
            className="min-h-11 max-w-full flex-1 rounded-xl border-2 border-dashed border-primary/40 bg-card px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground disabled:opacity-60"
          />
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading the sheet
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Upload
              </>
            )}
          </Button>
        </form>
      )}

      {problems.length ? (
        <div className="mt-4 rounded-xl bg-danger-soft p-3">
          <p className="text-sm font-semibold text-danger">
            Fix these lines in the sheet, then upload it again. Nothing was loaded.
          </p>
          <ul className="mt-2 space-y-1">
            {problems.map((problem) => (
              <li key={problem} className="text-xs text-danger">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
