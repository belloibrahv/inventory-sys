"use client"

import { Button } from "@/components/ui/button"

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
