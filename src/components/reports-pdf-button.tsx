"use client"

import { useState } from "react"
import { jsPDF } from "jspdf"
import { Button } from "@/components/ui/button"
import { formatPdfMoney } from "@/lib/books-pack"
import { formatLagosStamp } from "@/lib/lagos-day"
import type { ReportsPack } from "@/lib/reports-pack"
import { reportsKpis } from "@/lib/reports-pack"

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
    reader.onerror = () => reject(new Error("Could not load the shop logo"))
    reader.readAsDataURL(blob)
  })
}

export function ReportsPdfButton({ data }: { data: ReportsPack }) {
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
        doc.rect(0, 0, pageW, full ? 40 : 16, "F")
        doc.setFillColor(...LIME)
        doc.rect(0, full ? 40 : 16, pageW, 1.2, "F")
        try {
          doc.addImage(mark, "JPEG", left, full ? 7 : 2, full ? 15 : 11, full ? 15 : 11)
        } catch {
          doc.setFillColor(255, 255, 255)
          doc.circle(left + 7, full ? 14.5 : 8, 7, "F")
        }
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(full ? 13 : 10)
        doc.text(data.company.name, left + (full ? 19 : 15), full ? 13 : 8)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(124, 255, 134)
        doc.text("SOFTSKILLS INVESTMENT", left + (full ? 19 : 15), full ? 18 : 12)
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(full ? 11 : 9)
        doc.text("MANAGEMENT REPORT", right, full ? 12 : 7, { align: "right" })
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(data.statementRef, right, full ? 17 : 12, { align: "right" })
        if (full) {
          doc.setTextColor(210, 220, 255)
          doc.text(data.company.address, left + 19, 23)
          doc.text(`Scope: ${data.scope}`, left, 32)
          doc.text(`Prepared by ${data.preparedBy}`, left + 88, 32)
          doc.text(`Lagos ${formatLagosStamp(new Date(data.preparedAt))}`, right, 32, { align: "right" })
          doc.text("Every finished record you are allowed to see. This paper does not change any sale.", left, 37)
        }
        y = full ? 48 : 24
      }

      function ensure(space: number) {
        if (y + space < pageH - 16) return
        footer()
        doc.addPage()
        page += 1
        letterhead(false)
      }

      function section(title: string) {
        ensure(10)
        doc.setFillColor(...NAVY)
        doc.rect(left, y, width, 6.2, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.text(title.toUpperCase(), left + 2, y + 4.2)
        y += 9
      }

      function row(label: string, value: string, tint?: [number, number, number]) {
        ensure(6.5)
        if (tint) {
          doc.setFillColor(...tint)
          doc.rect(left, y - 3.2, width, 6, "F")
        }
        doc.setTextColor(...INK)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(label, left + 1, y)
        doc.setFont("helvetica", "bold")
        doc.text(value, right - 1, y, { align: "right" })
        y += 5.6
      }

      letterhead(true)

      const kpis = reportsKpis(data)
      kpis.forEach((item, index) => {
        const col = index % 4
        const rowIndex = Math.floor(index / 4)
        const boxW = width / 4 - 1.5
        const x = left + col * (width / 4)
        const boxY = y + rowIndex * 15
        doc.setDrawColor(...LINE)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, boxY, boxW, 13.5, 1, 1, "FD")
        doc.setTextColor(...MUTED)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(6)
        doc.text(item.label.toUpperCase(), x + 2, boxY + 4.2)
        doc.setTextColor(...NAVY)
        doc.setFontSize(9)
        doc.text(item.money ? formatPdfMoney(item.value) : String(item.value), x + 2, boxY + 10)
      })
      y += 34

      section("Shop by shop")
      doc.setTextColor(...MUTED)
      doc.setFontSize(7)
      doc.text("Shop", left + 1, y)
      doc.text("Sales", left + 92, y, { align: "right" })
      doc.text("Money from sales", left + 138, y, { align: "right" })
      doc.text("Collected", right - 1, y, { align: "right" })
      y += 5
      if (data.byShop.length === 0) {
        row("No finished sale here", "")
      } else {
        data.byShop.forEach((item, index) => {
          ensure(6.5)
          if (index % 2) {
            doc.setFillColor(...PAPER)
            doc.rect(left, y - 3.2, width, 6, "F")
          }
          doc.setTextColor(...INK)
          doc.setFont("helvetica", "normal")
          doc.setFontSize(8)
          doc.text(item.name, left + 1, y)
          doc.text(String(item.tickets), left + 92, y, { align: "right" })
          doc.setFont("helvetica", "bold")
          doc.text(formatPdfMoney(item.revenue), left + 138, y, { align: "right" })
          doc.text(formatPdfMoney(item.collected), right - 1, y, { align: "right" })
          y += 5.6
        })
      }

      section("Customers still owe us")
      if (data.debtors.length === 0) {
        row("No customer owes us anything", "")
      } else {
        data.debtors.forEach((item, index) => {
          row(`${item.name}  ·  ${item.shop}`, formatPdfMoney(item.amount), index % 2 ? PAPER : undefined)
        })
      }

      section("Supplier bills we have not paid")
      if (data.creditors.length === 0) {
        row("We have paid every supplier bill", "")
      } else {
        data.creditors.forEach((item, index) => {
          row(`${item.invoice}  ·  ${item.supplier}  ·  ${item.shop}`, formatPdfMoney(item.owed), index % 2 ? PAPER : undefined)
        })
      }

      section("Items running low")
      if (data.lowStock.length === 0) {
        row("No item is running low", "")
      } else {
        data.lowStock.forEach((item, index) => {
          row(`${item.product}  ·  ${item.shop}`, `${item.quantity} / min ${item.min}`, index % 2 ? PAPER : undefined)
        })
      }

      y += 4
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text("Software by Techvaults Limited. This paper does not change any sale.", left, y)

      footer()
      doc.save(`${data.statementRef}.pdf`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" onClick={download} disabled={busy} className="print:hidden">
      {busy ? "Getting the PDF ready" : "Download PDF"}
    </Button>
  )
}
