"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BrandBusyOverlay } from "@/components/brand-busy-overlay"
import type { UploadResult } from "@/app/actions/uploads"

const SHEET_PHASES = [
  "Opening your sheet",
  "Checking every line from top to bottom",
  "Folding any duplicate numbers into one entry",
  "Saving the good lines onto the shop system",
]

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
  const [softNotes, setSoftNotes] = useState<string[]>([])

  return (
    <div className="surface-card p-5">
      <BrandBusyOverlay
        open={busy}
        title={`Loading ${title.toLowerCase()}`}
        detail="Reading the sheet and writing only clean lines. Please keep this page open."
        phases={SHEET_PHASES}
      />

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
            setSoftNotes([])
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
            const soft = [
              result.duplicates ? `${result.duplicates} duplicate number(s) counted once` : null,
              result.skipped ? `${result.skipped} already on the system left as they are` : null,
            ].filter(Boolean)
            toast.success(
              `${result.added?.toLocaleString("en-NG") ?? 0} row(s) loaded${soft.length ? `. ${soft.join(" · ")}` : ""}.`
            )
            setSoftNotes(result.problems ?? [])
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
              "Loading the sheet"
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

      {softNotes.length ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm font-semibold text-foreground">
            Upload completed. Duplicates were folded into one entry, or numbers already on the system were left as they are. You can edit stock later on Phones and items.
          </p>
          <ul className="mt-2 space-y-1">
            {softNotes.map((note) => (
              <li key={note} className="text-xs text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
