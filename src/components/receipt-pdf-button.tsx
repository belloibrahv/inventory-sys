"use client"

import { useState } from "react"
import { jsPDF } from "jspdf"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { drawReceipt, loadMark, receiptFileName, type ReceiptData } from "@/lib/receipt-pdf"

/** Saves one sale's receipt as a PDF, for filing or sending to the customer. */
export function ReceiptPdfButton({ data, label = "Download receipt" }: { data: ReceiptData; label?: string }) {
  const [busy, setBusy] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      className="print:hidden"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const mark = await loadMark()
          const doc = new jsPDF({ unit: "mm", format: "a4" })
          drawReceipt(doc, data, mark)
          doc.save(receiptFileName(data.invoiceNumber))
        } catch {
          toast.error("We could not get the receipt ready. Use the print button instead.")
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Preparing the receipt
        </>
      ) : (
        <>
          <Download className="h-4 w-4" aria-hidden />
          {label}
        </>
      )}
    </Button>
  )
}
