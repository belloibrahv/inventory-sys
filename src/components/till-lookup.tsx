"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Camera, Search } from "lucide-react"

function cleanCode(raw: string) {
  return raw.replace(/[\s-]/g, "").trim()
}

/**
 * One till box for Sell now: scan or type IMEI, serial, phone name,
 * brand, category, or a piece item. No second search field.
 */
export function TillLookup({
  value,
  onChange,
  onCommit,
  searching = false,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void | Promise<void>
  searching?: boolean
  disabled?: boolean
}) {
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function stopCamera() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  async function startCamera() {
    const Detector = (
      window as Window & {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
        }
      }
    ).BarcodeDetector
    if (!Detector) {
      toast.error("This phone cannot open the camera. Use a USB scanner, or type in the box.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      })
      streamRef.current = stream
      setScanning(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      const detector = new Detector({
        formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "data_matrix"],
      })
      const tick = async () => {
        const video = videoRef.current
        if (!video || video.readyState < 2) {
          timerRef.current = window.setTimeout(tick, 200)
          return
        }
        try {
          const codes = await detector.detect(video)
          const hit = codes[0]?.rawValue
          if (hit) {
            stopCamera()
            const code = cleanCode(hit)
            onChange("")
            await onCommit(code)
            toast.success("Scanned into this sale")
            inputRef.current?.focus()
            return
          }
        } catch {
          // keep looking
        }
        timerRef.current = window.setTimeout(tick, 250)
      }
      timerRef.current = window.setTimeout(tick, 300)
    } catch {
      toast.error("The camera was blocked. Allow the camera, or use a USB scanner.")
    }
  }

  useEffect(() => () => stopCamera(), [])

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground">
          Scan or type to add to this sale
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={value}
              disabled={disabled}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="min-h-14 border-2 border-foreground/25 bg-background pl-11 text-base font-medium shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              placeholder="IMEI, serial, phone name, brand, category, pouch, or charger cord"
              aria-label="Scan or type IMEI, serial, phone name, brand, category, or piece item"
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                event.stopPropagation()
                const typed = value.trim()
                if (!typed) return
                void onCommit(typed)
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="min-h-14 shrink-0 gap-2 border-2 px-4 text-sm font-semibold"
            onClick={scanning ? stopCamera : () => void startCamera()}
          >
            <Camera className="h-4 w-4" />
            {scanning ? "Stop camera" : "Use camera"}
          </Button>
        </div>
      </label>
      {scanning ? (
        <video
          ref={videoRef}
          className="h-48 w-full rounded-xl bg-black object-cover"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          One box for everything. USB scanners type the number and press Enter. That adds the item. It does not finish the sale.
          {searching ? " Looking across this shop stock." : ""}
        </p>
      )}
    </div>
  )
}
