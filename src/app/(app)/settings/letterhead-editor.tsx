"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ImagePlus, Loader2 } from "lucide-react"
import { saveLetterhead } from "@/app/actions/finance"
import { DocumentLetterhead, DocumentPaperFooter } from "@/components/document-letterhead"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEFAULT_LOGO, type LetterheadBrand } from "@/lib/letterhead"

const MAX_EDGE = 256
const MAX_BYTES = 150_000

async function fileToLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  let quality = 0.86
  let data = canvas.toDataURL("image/jpeg", quality)
  while (data.length > MAX_BYTES && quality > 0.5) {
    quality -= 0.08
    data = canvas.toDataURL("image/jpeg", quality)
  }
  if (data.length > MAX_BYTES) throw new Error("too-big")
  return data
}

export function LetterheadEditor({
  brand,
  canEdit,
}: {
  brand: LetterheadBrand
  canEdit: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(brand.name)
  const [tagline, setTagline] = useState(brand.tagline)
  const [address, setAddress] = useState(brand.address)
  const [phone, setPhone] = useState(brand.phone)
  const [email, setEmail] = useState(brand.email)
  const [footer, setFooter] = useState(brand.footer)
  const [logoSrc, setLogoSrc] = useState(brand.logoSrc)
  const [logoPayload, setLogoPayload] = useState("")
  const [clearLogo, setClearLogo] = useState(false)
  const [pending, startTransition] = useTransition()

  const preview: LetterheadBrand = {
    name: name || brand.name,
    tagline,
    address,
    phone,
    email,
    logoSrc,
    footer,
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    try {
      const data = await fileToLogo(file)
      setLogoSrc(data)
      setLogoPayload(data)
      setClearLogo(false)
    } catch {
      toast.error("That picture is too large. Use a square logo under about 150 KB.")
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  function save() {
    const data = new FormData()
    data.set("name", name)
    data.set("tagline", tagline)
    data.set("address", address)
    data.set("phone", phone)
    data.set("email", email)
    data.set("footer", footer)
    if (clearLogo) data.set("clearLogo", "1")
    else if (logoPayload) data.set("logo", logoPayload)
    startTransition(async () => {
      const result = await saveLetterhead(data)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success("Invoice header saved. New prints use this name, logo and address.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <DocumentLetterhead
          brand={preview}
          documentKind="Sales invoice"
          documentTitle="INV-SAMPLE"
          meta={["Preview of the header every shop will print"]}
        />
        <div className="px-6 py-4 text-sm text-slate-600">
          This is how invoices, receipts, reports and the how-to book will look at the top.
        </div>
        <DocumentPaperFooter brand={preview} />
      </div>

      {canEdit ? (
        <div className="surface-card space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold">Invoice header</p>
            <p className="text-xs text-muted-foreground">
              Company logo, name and address printed on every invoice, receipt and report. The main admin, the CEO, the accountant and the auditor can change this.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <img src={logoSrc} alt="" width={56} height={56} className="h-14 w-14 rounded-md border border-border bg-white object-contain p-1" />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onPick(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Upload logo
            </Button>
            {logoSrc !== DEFAULT_LOGO ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setLogoSrc(DEFAULT_LOGO)
                  setLogoPayload("")
                  setClearLogo(true)
                }}
              >
                Use the default mark
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Company name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
            </label>
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Line under the name</span>
              <Input value={tagline} onChange={(event) => setTagline(event.target.value)} disabled={pending} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="eyebrow mb-1 block">Address on invoices</span>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} disabled={pending} />
            </label>
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Phone on invoices</span>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} disabled={pending} />
            </label>
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Email on invoices</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="eyebrow mb-1 block">Thank-you line at the bottom</span>
              <Input value={footer} onChange={(event) => setFooter(event.target.value)} disabled={pending} />
            </label>
          </div>

          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save invoice header
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You can see how papers will print. Only the main admin, the CEO, the accountant or the auditor can change this header.
        </p>
      )}
    </div>
  )
}
