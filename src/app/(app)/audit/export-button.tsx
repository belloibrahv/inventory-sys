"use client"

import { toast } from "sonner"
import { exportAuditCsv, type AuditFilters } from "@/app/actions/audit"
import { Button } from "@/components/ui/button"

export function AuditExportButton({ filters }: { filters: AuditFilters }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      onClick={async () => {
        const result = await exportAuditCsv(filters)
        if (result.error || !result.csv) {
          toast.error(result.error ?? "Could not export.")
          return
        }
        const blob = new Blob([result.csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `who-did-what-${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
        URL.revokeObjectURL(url)
        toast.success("Trail downloaded. That download is itself on the trail.")
      }}
    >
      Download trail
    </Button>
  )
}
