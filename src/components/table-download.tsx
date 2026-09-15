"use client"

import { FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadTable } from "@/lib/download-table"

/**
 * Excel and CSV buttons for the rows behind a figure or a table.
 *
 * The client: "as much as it is clickable, let it be downloadable also ... the
 * details thereat should be downloadable or exportable to an Excel file." Rows
 * are built only when a button is pressed, and always hold every row, not the
 * page of 25 on screen.
 */
export function TableDownload({
  filename,
  rows,
}: {
  /** Without the extension. */
  filename: string
  rows: () => Array<Array<string | number>>
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={() => downloadTable(rows(), `${filename}.xlsx`, "xlsx")}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden /> Excel
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadTable(rows(), `${filename}.csv`, "csv")}>
        CSV
      </Button>
    </div>
  )
}
