"use client"

import { useEffect, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { BrandLockup, BrandMark } from "@/components/brand-mark"
import { BrandBusyOverlay } from "@/components/brand-busy-overlay"
import { LoginHero } from "@/components/login-hero"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [entering, setEntering] = useState(false)
  const [notice, setNotice] = useState("")

  // After a password change every session ends, this one included, so say why.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("changed") === "1") {
      setNotice("Password changed. Sign in again with your new password.")
    }
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error === "TooManyAttempts") {
      setLoading(false)
      setError(
        "Too many tries that did not work. Sign-in is paused for 15 minutes for this email. If you have forgotten the password, the main admin or the CEO can reset it on Staff."
      )
      return
    }
    if (result?.error) {
      setLoading(false)
      // Never says which part was wrong, so it cannot be used to find real emails.
      setError(
        "That email or password is not correct. Use exactly the email you were given (a @gmail.com and an @abutwins.com address are different logins), and mind capital letters in the password. Forgotten it? The main admin or the CEO can reset it on Staff."
      )
      return
    }
    setEntering(true)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <BrandBusyOverlay
        open={loading || entering}
        title={entering ? "Opening your shop Home" : "Checking your details"}
        detail={
          entering
            ? "Sign in worked. Loading the pages for your job."
            : "Matching this email and password with the staff list."
        }
        phases={
          entering
            ? ["Opening Home", "Loading the pages for your job", "Almost ready"]
            : ["Reading your email", "Checking this login is open", "Preparing the shop system"]
        }
      />
      <LoginHero />
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
              Use the work email the main admin gave you. A locked login cannot enter.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="min-h-12"
            />
          </div>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-500/15 dark:text-amber-200">
            First time here? You will be asked to change your password after you sign in.
          </p>
          {notice && !error ? (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
            >
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={loading || entering} aria-busy={loading || entering}>
            {loading || entering ? "Checking your details" : "Sign in"}
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
