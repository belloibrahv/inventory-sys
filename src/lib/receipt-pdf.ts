import { jsPDF } from "jspdf"

/**
 * Building a receipt a customer can be handed or sent.
 *
 * Kept apart from the screen so one sale and a whole day's sales are printed by
 * the same code: a receipt exported in a batch looks exactly like the one given
 * over the counter.
 */

const NAVY: [number, number, number] = [0, 27, 206]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const LINE: [number, number, number] = [226, 232, 240]

export type ReceiptLine = {
  name: string
  imei?: string | null
  quantity: number
  amount: number
  warranty?: string | null
}

export type ReceiptData = {
  company: string
  invoiceNumber: string
  branch: string
  address?: string | null
  shopPhone?: string | null
  email?: string | null
  cashier?: string | null
  customer?: string | null
  customerPhone?: string | null
  soldAt: string
  items: ReceiptLine[]
  total: number
  paid: number
  method: string
  notes?: string | null
}

function naira(value: number) {
  return `NGN ${Math.round(value).toLocaleString("en-NG")}`
}

/**
 * Draws one receipt onto the page and hands back the height used, so a batch
 * can decide whether the next one fits.
 */
export function drawReceipt(doc: jsPDF, data: ReceiptData, mark?: string) {
  const pageW = doc.internal.pageSize.getWidth()
  const left = 14
  const right = pageW - 14
  let y = 16

  if (mark) {
    try {
      doc.addImage(mark, "JPEG", left, y - 6, 14, 14)
    } catch {
      // A missing company mark must never stop a customer getting a receipt.
    }
  }
  const textLeft = mark ? left + 18 : left

  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.company, textLeft, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const head = [data.branch, data.address, data.shopPhone, data.email].filter(Boolean).join("  ·  ")
  doc.text(head, textLeft, y)
  y += 8

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(left, y, right, y)
  y += 7

  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("SALES RECEIPT", left, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(data.invoiceNumber, right, y, { align: "right" })
  y += 6

  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Sold ${data.soldAt}`, left, y)
  if (data.cashier) doc.text(`Served by ${data.cashier}`, right, y, { align: "right" })
  y += 5
  if (data.customer) {
    doc.text(`Customer: ${data.customer}${data.customerPhone ? `  ·  ${data.customerPhone}` : ""}`, left, y)
    y += 5
  } else {
    doc.text("Customer: Walk-in", left, y)
    y += 5
  }
  y += 2

  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.line(left, y, right, y)
  y += 5

  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.text("Item", left, y)
  doc.text("Qty", right - 46, y, { align: "right" })
  doc.text("Amount", right, y, { align: "right" })
  y += 3
  doc.setDrawColor(...LINE)
  doc.line(left, y, right, y)
  y += 5

  doc.setFont("helvetica", "normal")
  for (const item of data.items) {
    doc.setTextColor(...INK)
    doc.setFontSize(9)
    doc.text(doc.splitTextToSize(item.name, right - left - 52)[0], left, y)
    doc.text(String(item.quantity), right - 46, y, { align: "right" })
    doc.text(naira(item.amount), right, y, { align: "right" })
    y += 4
    const under = [item.imei ? `IMEI ${item.imei}` : "", item.warranty ? `Warranty ${item.warranty}` : ""]
      .filter(Boolean)
      .join("  ·  ")
    if (under) {
      doc.setTextColor(...MUTED)
      doc.setFontSize(7)
      doc.text(under, left, y)
      y += 4
    }
    y += 1
  }

  y += 2
  doc.setDrawColor(...LINE)
  doc.line(left, y, right, y)
  y += 6

  const due = Math.max(0, data.total - data.paid)
  const rows: Array<[string, string, boolean]> = [
    ["Total", naira(data.total), true],
    [`Paid (${data.method})`, naira(data.paid), false],
  ]
  if (due > 0) rows.push(["Still owing", naira(due), true])

  for (const [label, value, bold] of rows) {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(bold ? 10 : 9)
    doc.setTextColor(...INK)
    doc.text(label, right - 50, y, { align: "right" })
    doc.text(value, right, y, { align: "right" })
    y += 5
  }

  if (data.notes) {
    y += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    for (const line of doc.splitTextToSize(data.notes, right - left) as string[]) {
      doc.text(line, left, y)
      y += 3.5
    }
  }

  y += 4
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text(
    "This receipt is a record of a finished sale. Later payments are added as new entries and do not change it.",
    left,
    y
  )
  y += 4
  doc.text("Thank you for your custom.", left, y)
  y += 6

  return y
}

export async function loadMark() {
  try {
    const response = await fetch("/brand/ab-mark.jpg")
    if (!response.ok) return undefined
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error("mark"))
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

export function receiptFileName(invoiceNumber: string) {
  return `Receipt-${invoiceNumber.replace(/[^A-Za-z0-9-]/g, "")}.pdf`
}
