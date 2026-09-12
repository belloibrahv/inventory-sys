"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function cleanCode(raw: string) {
  return raw.replace(/[\s-]/g, "").trim()
}

export function ScanField({
  onScan,
  kind = "IMEI",
  placeholder,
}: {
  onScan: (value: string) => void
  kind?: "IMEI" | "SERIAL"
  placeholder?: string
}) {
  const [value, setValue] = useState("")
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  function commit(raw: string) {
    const code = cleanCode(raw)
    if (!code) return
    if (kind === "IMEI" && code.length < 14) {
      toast.error("That IMEI is too short. Scan the box again, or type every digit.")
      return
    }
    if (kind === "SERIAL" && code.length < 4) {
      toast.error("That serial number is too short.")
      return
    }
    onScan(code)
    setValue("")
  }

  async function startCamera() {
    const Detector = (window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
    if (!Detector) {
      toast.error("This phone cannot open the camera scanner. Use a USB scanner, or type the number by hand.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      streamRef.current = stream
      setScanning(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "data_matrix"] })
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
            commit(hit)
            toast.success("Scanned")
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

  function stopCamera() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  useEffect(() => () => stopCamera(), [])

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit(value)
            }
          }}
          placeholder={placeholder ?? (kind === "IMEI" ? "Scan or type IMEI, then Enter" : "Scan or type serial, then Enter")}
          autoComplete="off"
          inputMode="numeric"
          className="min-h-12"
        />
        <Button type="button" className="min-h-12 shrink-0" onClick={scanning ? stopCamera : startCamera}>
          {scanning ? "Stop camera" : "Scan with camera"}
        </Button>
      </div>
      {scanning ? (
        <video ref={videoRef} className="h-48 w-full rounded-xl bg-black object-cover" autoPlay muted playsInline />
      ) : (
        <p className="text-xs text-muted-foreground">
          A USB or Bluetooth scanner works like a keyboard. Point it at the box, then it types the number and presses Enter.
        </p>
      )}
    </div>
  )
}

export function ScanList({
  name,
  kind = "IMEI",
  required = true,
}: {
  name: string
  kind?: "IMEI" | "SERIAL"
  required?: boolean
}) {
  const [items, setItems] = useState<string[]>([])

  function add(code: string) {
    setItems((current) => {
      if (current.includes(code)) {
        toast.error("That number is already on the list.")
        return current
      }
      return [...current, code]
    })
  }

  return (
    <div className="space-y-2">
      <ScanField kind={kind} onScan={add} />
      <textarea name={name} value={items.join("\n")} readOnly required={required && items.length === 0} className="sr-only" />
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              <span>{item}</span>
              <button type="button" className="text-danger" onClick={() => setItems((current) => current.filter((row) => row !== item))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No number yet. Scan the first box.</p>
      )}
    </div>
  )
}
