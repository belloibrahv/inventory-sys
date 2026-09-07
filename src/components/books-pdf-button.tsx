"use client"

import { useState } from "react"
import { jsPDF } from "jspdf"
import type { BooksCheck } from "@/app/actions/books-check"
import { Button } from "@/components/ui/button"
import { booksCompareRows, booksMoneyLines, booksPeriodLabel, booksRangeTitle, formatPdfMoney, formatPdfMove } from "@/lib/books-pack"
import { formatLagosStamp, formatWatLong } from "@/lib/lagos-day"
import { formatDateTime } from "@/lib/utils"

const NAVY: [number, number, number] = [0, 27, 206]
const LIME: [number, number, number] = [24, 192, 32]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const LINE: [number, number, number] = [226, 232, 240]
const PAPER: [number, number, number] = [248, 250, 252]

async function loadMark() {
  const response = await fetch("/brand/ab-mark.jpg")
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read the company mark"))
    reader.readAsDataURL(blob)
  })
}

export function BooksPdfButton({ data }: { data: BooksCheck }) {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const mark = await loadMark()
      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const pageW = 210
      const pageH = 297
      const left = 12
      const right = pageW - 12
      const width = right - left
      let y = 0
      let page = 1

      const period = booksPeriodLabel(data.range, data.from, data.to)
      const compared = booksPeriodLabel(data.range, data.priorFrom, data.priorTo)

      function footer() {
        doc.setFillColor(...PAPER)
        doc.rect(0, pageH - 12, pageW, 12, "F")
        doc.setDrawColor(...NAVY)
        doc.setLineWidth(0.6)
        doc.line(0, pageH - 12, pageW, pageH - 12)
        doc.setTextColor(...MUTED)
        doc.setFontSize(7)
        doc.text(`${data.company.phone || ""}  ·  ${data.company.email || ""}`, left, pageH - 5)
        doc.text(`Page ${page}  ·  ${data.statementRef}`, right, pageH - 5, { align: "right" })
      }

      function letterhead(full: boolean) {
        doc.setFillColor(...NAVY)
        doc.rect(0, 0, pageW, full ? 42 : 18, "F")
        doc.setFillColor(...LIME)
        doc.rect(0, full ? 42 : 18, pageW, 1.2, "F")
        try {
          doc.addImage(mark, "JPEG", left, full ? 8 : 3, full ? 16 : 12, full ? 16 : 12)
        } catch {
          doc.setFillColor(255, 255, 255)
          doc.circle(left + (full ? 8 : 6), full ? 16 : 9, full ? 8 : 6, "F")
        }
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(full ? 13 : 10)
        doc.text(data.company.name, left + (full ? 20 : 16), full ? 14 : 9)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(124, 255, 134)
        doc.text("SOFTSKILLS INVESTMENT", left + (full ? 20 : 16), full ? 19 : 13)
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(full ? 12 : 9)
        doc.text("STATEMENT OF ACCOUNT", right, full ? 12 : 8, { align: "right" })
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(data.statementRef, right, full ? 18 : 13, { align: "right" })
        if (full) {
          doc.setFontSize(8)
          doc.setTextColor(210, 220, 255)
          doc.text(data.company.address, left + 20, 24)
          doc.text(`${data.shopName}  ·  ${data.shopCode}`, left, 34)
          doc.text(`This period: ${period}`, left + 78, 34)
          doc.text(`Compared: ${compared}`, right, 34, { align: "right" })
          doc.text(`${booksRangeTitle(data.range)}  ·  Lagos ${formatLagosStamp(new Date(data.preparedAt))}`, left, 39)
        }
        y = full ? 50 : 26
      }

      function ensure(space: number) {
        if (y + space < pageH - 16) return
        footer()
        doc.addPage()
        page += 1
        letterhead(false)
      }

      function section(title: string) {
        ensure(12)
        doc.setFillColor(...NAVY)
        doc.rect(left, y, width, 6.5, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.text(title.toUpperCase(), left + 2, y + 4.4)
        y += 9
      }

      function row(label: string, a: string, b?: string, c?: string, tint?: [number, number, number]) {
        ensure(7)
        if (tint) {
          doc.setFillColor(...tint)
          doc.rect(left, y - 3.4, width, 6.2, "F")
        }
        doc.setTextColor(...INK)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(label, left + 1, y)
        doc.setFont("helvetica", "bold")
        if (c != null && b != null) {
          doc.text(a, left + 92, y, { align: "right" })
          doc.setFont("helvetica", "normal")
          doc.setTextColor(...MUTED)
          doc.text(b, left + 138, y, { align: "right" })
          doc.setTextColor(...INK)
          doc.setFont("helvetica", "bold")
          doc.text(c, right - 1, y, { align: "right" })
        } else {
          doc.text(a, right - 1, y, { align: "right" })
        }
        y += 6
      }

      letterhead(true)

      const verdictFill = data.openCount ? [255, 241, 242] as [number, number, number] : [236, 253, 245] as [number, number, number]
      doc.setFillColor(...verdictFill)
      doc.roundedRect(left, y, width, 16, 1.5, 1.5, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.text(data.openCount ? `ACCOUNTANT VERDICT  ·  ${data.openCount} TO CLEAR` : "ACCOUNTANT VERDICT  ·  CLEAN", left + 3, y + 5)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...INK)
      const verdict = doc.splitTextToSize(data.verdict, width - 6)
      doc.text(verdict, left + 3, y + 10)
      y += 20

      const boxes = [
        ["SALES", String(data.salesCount)],
        ["COLLECTED", formatPdfMoney(data.collected)],
        ["POSTED", formatPdfMoney(data.revenue)],
        ["MONEY OUT", formatPdfMoney(data.moneyOut)],
      ]
      boxes.forEach(([label, value], index) => {
        const x = left + index * (width / 4)
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(...LINE)
        doc.roundedRect(x, y, width / 4 - 2, 14, 1, 1, "FD")
        doc.setTextColor(...MUTED)
        doc.setFontSize(6.5)
        doc.setFont("helvetica", "bold")
        doc.text(label, x + 2, y + 4.5)
        doc.setTextColor(...NAVY)
        doc.setFontSize(9)
        doc.text(value, x + 2, y + 10.5)
      })
      y += 18

      section("Period comparison")
      doc.setTextColor(...MUTED)
      doc.setFontSize(7)
      doc.text("Line", left + 1, y)
      doc.text("This period", left + 92, y, { align: "right" })
      doc.text("Compared", left + 138, y, { align: "right" })
      doc.text("Movement", right - 1, y, { align: "right" })
      y += 5
      booksCompareRows(data).forEach((item, index) => {
        const now = item.money ? formatPdfMoney(item.now) : String(item.now)
        const then = item.money ? formatPdfMoney(item.then) : String(item.then)
        const move = formatPdfMove(item.change, item.money)
        row(item.label, now, then, move, index % 2 ? PAPER : undefined)
      })

      section("Money add-up")
      booksMoneyLines(data).forEach((item, index) => {
        row(item.label, formatPdfMoney(item.value), undefined, undefined, item.total ? [232, 237, 255] : index % 2 ? PAPER : undefined)
      })

      section("Working paper")
      data.papers.forEach((item, index) => {
        ensure(14)
        doc.setFillColor(item.ok ? 236 : 255, item.ok ? 253 : 241, item.ok ? 245 : 242)
        doc.roundedRect(left, y - 3, width, 12, 1, 1, "F")
        doc.setTextColor(...INK)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.text(`${index + 1}. ${item.label}`, left + 2, y + 1)
        doc.setTextColor(item.ok ? 5 : 190, item.ok ? 150 : 18, item.ok ? 105 : 60)
        doc.text(item.ok ? "PASS" : "FAIL", right - 2, y + 1, { align: "right" })
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...MUTED)
        doc.setFontSize(7)
        doc.text(doc.splitTextToSize(item.detail, width - 28), left + 2, y + 6)
        y += 13
      })

      section("Who collected")
      if (data.byStaff.length === 0) {
        row("No completed sales in this period", "")
      } else {
        data.byStaff.forEach((item, index) => {
          row(`${item.name}  ·  ${item.count} sale${item.count === 1 ? "" : "s"}`, formatPdfMoney(item.collected), undefined, undefined, index % 2 ? PAPER : undefined)
        })
      }

      section("Position still open")
      row("Customers still owe", formatPdfMoney(data.customersOwe))
      row("We still owe suppliers", formatPdfMoney(data.supplierOwed))
      row("Walk-in sales", String(data.walkIns))
      row("Till expected", formatPdfMoney(data.expectedCash))
      row("Till counted", data.countedCash == null ? "Not closed" : formatPdfMoney(data.countedCash))
      row("Till variance", data.variance == null ? "Not closed" : formatPdfMoney(data.variance), undefined, undefined, PAPER)

      section("Invoices")
      if (data.invoices.length === 0) {
        row("No completed sales in this period", "")
      } else {
        data.invoices.forEach((item, index) => {
          row(
            `${item.invoice}  ${item.customer}`,
            item.method,
            formatDateTime(item.when),
            formatPdfMoney(item.paid),
            index % 2 ? PAPER : undefined
          )
        })
      }

      section("Till closes")
      if (data.closes.length === 0) {
        row("No till close in this period", "")
      } else {
        data.closes.forEach((item, index) => {
          row(`${formatWatLong(item.day)}  ·  ${item.staff}`, formatPdfMoney(item.expected), "variance", formatPdfMoney(item.variance), index % 2 ? PAPER : undefined)
        })
      }

      section("IMEI vs shop count")
      if (data.imeiRows.length === 0) {
        row("No serialized stock in this shop", "")
      } else {
        data.imeiRows.forEach((item, index) => {
          row(item.product, `${item.shopQty} / ${item.imeis}`, undefined, item.delta === 0 ? "Match" : String(item.delta), index % 2 ? PAPER : undefined)
        })
      }

      ensure(42)
      y += 4
      section("Sign-off")
      const boxesW = (width - 8) / 3
      ;["Prepared by", "Checked by records", "Owner / CEO"].forEach((title, index) => {
        const x = left + index * (boxesW + 4)
        doc.setTextColor(...MUTED)
        doc.setFontSize(7)
        doc.setFont("helvetica", "bold")
        doc.text(title.toUpperCase(), x, y)
        doc.setTextColor(...INK)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.text(index === 0 ? data.preparedBy || "Staff" : " ", x, y + 6)
        doc.setDrawColor(...NAVY)
        doc.line(x, y + 22, x + boxesW, y + 22)
        doc.setTextColor(...MUTED)
        doc.setFontSize(7)
        doc.text("Signature and date", x, y + 26)
      })
      y += 32
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text("Software by Techvaults Limited. This pack does not change any invoice.", left, y)

      footer()
      doc.save(`${data.statementRef}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" onClick={download} disabled={busy} className="print:hidden">
      {busy ? "Preparing the PDF" : "Download branded PDF"}
    </Button>
  )
}
