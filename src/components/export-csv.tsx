"use client"

import { Button } from "@/components/ui/button"

export function ExportCsv({
  filename,
  rows,
  label = "Export CSV",
}: {
  filename: string
  rows: string[][]
  label?: string
}) {
  function download() {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button type="button" variant="outline" onClick={download} className="print:hidden">
      {label}
    </Button>
  )
}
