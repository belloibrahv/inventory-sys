"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { BrandMark } from "@/components/brand-mark"
import { cn } from "@/lib/utils"

export type BrandBusyOverlayProps = {
  open: boolean
  /** Short, specific job name, e.g. "Uploading opening stock to Iwo Road". */
  title: string
  /** One line under the title explaining what the shop is waiting for. */
  detail?: string
  /**
   * Rotating status lines while the job runs. Keep each line a full sentence
   * in shop words. No three-dot cut-offs.
   */
  phases?: string[]
  className?: string
}

/**
 * Full-screen Abu Twins wait screen for long jobs (stock upload, sign out, and
 * similar). Shows the company mark, a clear title, rotating status lines, and a
 * percent bar so staff can see the system is still working.
 *
 * Real server progress is not streamed yet, so the bar eases toward 90% while
 * the job runs, then finishes to 100% when the parent sets open to false.
 */
export function BrandBusyOverlay({ open, title, detail, phases, className }: BrandBusyOverlayProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [percent, setPercent] = useState(0)
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setVisible(true)
      setFinishing(false)
      setPercent(4)
      setPhaseIndex(0)
      return
    }
    if (!visible) return
    setFinishing(true)
    setPercent(100)
    const hide = window.setTimeout(() => {
      setVisible(false)
      setFinishing(false)
      setPercent(0)
      setPhaseIndex(0)
    }, 700)
    return () => window.clearTimeout(hide)
  }, [open, visible])

  useEffect(() => {
    if (!visible || finishing || !open) return
    const tick = window.setInterval(() => {
      setPercent((current) => {
        if (current >= 90) return current
        const remaining = 90 - current
        const step = Math.max(0.35, remaining * 0.065)
        return Math.min(90, current + step)
      })
    }, 320)
    return () => window.clearInterval(tick)
  }, [visible, finishing, open])

  useEffect(() => {
    if (!visible || finishing || !open || !phases?.length) return
    const rotate = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % phases.length)
    }, 2600)
    return () => window.clearInterval(rotate)
  }, [visible, finishing, open, phases])

  if (!mounted || !visible) return null

  const shown = Math.round(percent)
  const phase = finishing
    ? "Finished. Putting the shop screen back."
    : phases?.length
      ? phases[phaseIndex]
      : detail

  const node = (
    <div
      className={cn(
        "fixed inset-0 z-[220] flex items-center justify-center overflow-hidden px-6",
        "bg-[#001BCE] text-white",
        className
      )}
      role="status"
      aria-busy={!finishing}
      aria-live="polite"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-label={`${title}. ${shown} percent.`}
    >
      <div className="brand-busy-glow pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-md text-center">
        <div className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center">
          <span className="brand-busy-ring absolute inset-0 rounded-full border border-[#7CFF86]/40" aria-hidden />
          <span
            className="brand-busy-ring-delayed absolute inset-2 rounded-full border border-white/25"
            aria-hidden
          />
          <div className="brand-busy-mark relative z-10 rounded-full shadow-[0_0_0_6px_rgba(255,255,255,0.08)]">
            <BrandMark size={72} className="shadow-lg" />
          </div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">
          Abu Twins Softskills
        </p>
        <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-[1.65rem]">
          {title}
        </h2>
        {detail && !finishing ? (
          <p className="mt-2 text-sm leading-relaxed text-white/75">{detail}</p>
        ) : null}

        <div className="mx-auto mt-8 max-w-sm">
          <div className="mb-2 flex items-end justify-between gap-3 text-left">
            <p
              key={finishing ? "done" : `${phaseIndex}-${phase}`}
              className="brand-busy-phase min-w-0 flex-1 text-sm font-medium text-white/90"
            >
              {phase}
            </p>
            <p className="shrink-0 font-semibold tabular-nums text-[#7CFF86]">{shown}%</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
            <div className="brand-busy-bar h-full rounded-full bg-[#7CFF86]" style={{ width: `${shown}%` }} />
          </div>
          <p className="mt-3 text-xs text-white/55">
            Please keep this page open until the bar reaches 100 percent.
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

/**
 * In-page branded wait for Next.js route loading.tsx (not a modal overlay).
 */
export function BrandPageBusy({
  title = "Opening this page",
  detail = "Getting the latest shop numbers ready",
  className,
}: {
  title?: string
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center rounded-2xl bg-[#001BCE] px-6 py-16 text-center text-white",
        className
      )}
      role="status"
      aria-busy
    >
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#7CFF86]/20" aria-hidden />
        <BrandMark size={64} className="relative z-10 shadow-lg" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">
        Abu Twins Softskills
      </p>
      <h2 className="mt-3 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-white/75">{detail}</p>
      <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
        <div className="brand-page-bar h-full w-1/3 rounded-full bg-[#7CFF86]" />
      </div>
    </div>
  )
}
