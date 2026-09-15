import type { jsPDF } from "jspdf"
import { letterheadContactLine, type LetterheadBrand } from "@/lib/letterhead"

const NAVY: [number, number, number] = [0, 27, 206]
const LIME: [number, number, number] = [24, 192, 32]
const MUTED: [number, number, number] = [100, 116, 139]
const PAPER: [number, number, number] = [248, 250, 252]

export async function loadLogoDataUrl(logoSrc: string) {
  if (logoSrc.startsWith("data:image/")) return logoSrc
  try {
    const response = await fetch(logoSrc)
    if (!response.ok) return undefined
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error("logo"))
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

function imageKind(dataUrl: string): "JPEG" | "PNG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG"
  if (dataUrl.startsWith("data:image/webp")) return "WEBP"
  return "JPEG"
}

/**
 * Navy band + logo + shop name + document kind. Returns the Y where the body
 * of the paper should start.
 */
export function drawPdfLetterhead(
  doc: jsPDF,
  brand: LetterheadBrand,
  opts: {
    title: string
    subtitle?: string
    meta?: string[]
    logo?: string
    full?: boolean
  }
) {
  const pageW = doc.internal.pageSize.getWidth()
  const left = 12
  const right = pageW - 12
  const full = opts.full !== false
  const band = full ? (opts.meta?.length ? 42 : 36) : 18

  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageW, band, "F")
  doc.setFillColor(...LIME)
  doc.rect(0, band, pageW, 1.4, "F")

  const logoSize = full ? 14 : 11
  if (opts.logo) {
    try {
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(left, full ? 8 : 3.5, logoSize + 2, logoSize + 2, 1, 1, "F")
      doc.addImage(opts.logo, imageKind(opts.logo), left + 1, full ? 9 : 4.5, logoSize, logoSize)
    } catch {
      // A missing mark must never stop the paper printing.
    }
  }

  const textLeft = left + (opts.logo ? logoSize + 5 : 0)
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(full ? 13 : 10)
  doc.text(brand.name, textLeft, full ? 13 : 8)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(124, 255, 134)
  if (brand.tagline) doc.text(brand.tagline.toUpperCase(), textLeft, full ? 18 : 12)

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(full ? 10 : 8)
  doc.text(opts.title.toUpperCase(), right, full ? 12 : 7, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  if (opts.subtitle) doc.text(opts.subtitle, right, full ? 17 : 12, { align: "right" })

  if (full) {
    doc.setTextColor(210, 220, 255)
    doc.setFontSize(8)
    doc.text(letterheadContactLine(brand), textLeft, 24)
    if (opts.meta?.length) {
      const wrapped = doc.splitTextToSize(opts.meta.filter(Boolean).join("   ·   "), pageW - 24) as string[]
      doc.text(wrapped, left, 32)
    }
  }

  return band + 8
}

export function drawPdfPaperFooter(doc: jsPDF, brand: LetterheadBrand, page: number, extra?: string) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const left = 12
  const right = pageW - 12
  doc.setFillColor(...PAPER)
  doc.rect(0, pageH - 12, pageW, 12, "F")
  doc.setFillColor(...NAVY)
  doc.rect(0, pageH - 12, pageW, 0.8, "F")
  doc.setTextColor(...MUTED)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.text(brand.footer || `${brand.phone}  ·  ${brand.email}`, left, pageH - 5)
  doc.text(extra || `Page ${page}`, right, pageH - 5, { align: "right" })
}
