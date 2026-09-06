"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { BrandLockup, BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    const result = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError("Email or password is not correct, or this login is locked.")
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <div className="relative hidden overflow-hidden bg-primary text-white lg:flex lg:flex-col lg:justify-between p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_38%),radial-gradient(circle_at_85%_80%,rgba(24,192,32,0.22),transparent_32%)]" />
        <div className="relative">
          <BrandLockup light />
        </div>
        <div className="relative max-w-lg space-y-6">
          <p className="text-5xl font-semibold tracking-tight leading-tight">Own The Future</p>
          <p className="text-lg text-white/75">
            Phones, laptops, and power. Every IMEI and sale in one record. Old figures cannot be secretly changed.
          </p>
        </div>
        <div className="relative space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-white/45">Abu Twins Softskills Investment</p>
          <p className="text-xs text-white/55">
            Built by{" "}
            <a href="https://techvaults.com/" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
              Techvaults Limited
            </a>
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <BrandMark size={40} />
            <p className="text-sm font-medium text-primary">Sign in to the shop system</p>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the work email Super Admin gave you. Locked accounts cannot enter.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <Button className="w-full" disabled={loading}>
            {loading ? "Checking..." : "Sign in"}
          </Button>
          <p className="pt-2 text-center text-xs text-muted-foreground">
            Software by{" "}
            <a
              href="https://techvaults.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#BC0004] underline-offset-2 hover:underline"
            >
              Techvaults Limited
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
