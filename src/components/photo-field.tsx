"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

function compress(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const scale = Math.min(1, 800 / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error("Could not read photo"))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.7))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read photo"))
    }
    image.src = url
  })
}

export function PhotoField({
  name = "photoData",
  defaultValue,
}: {
  name?: string
  defaultValue?: string | null
}) {
  const [data, setData] = useState(defaultValue ?? "")

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={data} />
      {data ? <img src={data} alt="Phone condition" className="h-36 w-full rounded-xl object-cover" /> : null}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-border px-4 text-sm">
          {data ? "Replace photo" : "Take or upload photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                setData(await compress(file))
              } catch {
                toast.error("Could not use that photo. Try again.")
              }
            }}
          />
        </label>
        {data ? (
          <Button type="button" variant="outline" className="min-h-12" onClick={() => setData("")}>
            Remove photo
          </Button>
        ) : null}
      </div>
    </div>
  )
}
