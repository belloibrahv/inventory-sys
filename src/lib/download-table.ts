/**
 * Hands the person at the counter the table they are looking at, as a file.
 *
 * The client asked for this on both Shop stock and Stock count: "this interface
 * does not have the ability to download either via PDF, CSV file, or Excel file
 * ... I don't need to go to the reports angle before I can download what has
 * been done." PDF is the browser's own print dialog (`window.print()`), because
 * that is what produces a sheet an approver can sign.
 *
 * Browser only. Rows are a plain grid, header row first.
 */
export type TableFormat = "csv" | "xlsx"

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before the handle goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadTable(rows: Array<Array<string | number>>, filename: string, format: TableFormat = "csv") {
  if (format === "xlsx") {
    const XLSX = await import("xlsx")
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Sheet1")
    const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer
    saveBlob(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      filename
    )
    return
  }

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n")
  // The BOM is what makes Excel open Naira signs and names correctly.
  saveBlob(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), filename)
}
