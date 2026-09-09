"use client"

import { useEffect, useRef } from "react"

/**
 * Opens the print dialog once, as soon as a sale is finished.
 *
 * The till sends the cashier here with ?receipt=1 straight after a sale, so the
 * customer's receipt is coming out of the printer while they are still at the
 * counter. Opening the same invoice again later does not print by itself.
 */
export function AutoPrint({ when }: { when: boolean }) {
  const fired = useRef(false)

  useEffect(() => {
    if (!when || fired.current) return
    fired.current = true
    // A short wait so the receipt has been laid out before the dialog covers it.
    const timer = window.setTimeout(() => window.print(), 600)
    return () => window.clearTimeout(timer)
  }, [when])

  return null
}
