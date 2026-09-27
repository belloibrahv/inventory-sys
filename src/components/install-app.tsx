"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { Download, PlusSquare, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

/**
 * Putting the shop on a phone's home screen.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt` once, early, and only
 * that event can open their install sheet later. It is caught here at module
 * load (Providers imports this file) and kept, so a button pressed minutes
 * later still works. iPhone and iPad Safari have no such event: there the
 * button opens a two-step guide to Share, then Add to Home Screen.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type InstallState = { deferred: InstallPromptEvent | null; installed: boolean }

let state: InstallState = { deferred: null, installed: false }
const listeners = new Set<() => void>()

function setState(next: Partial<InstallState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini-bar away; the shop shows its own button.
    event.preventDefault()
    setState({ deferred: event as InstallPromptEvent })
  })
  window.addEventListener("appinstalled", () => setState({ deferred: null, installed: true }))
}

const serverState: InstallState = { deferred: null, installed: false }

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function runningAsApp() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

export function useInstallApp() {
  const current = useSyncExternalStore(subscribe, () => state, () => serverState)
  // Standalone and platform are only known in the browser; start false so the
  // server render and the first browser render agree.
  const [env, setEnv] = useState({ standalone: false, apple: false })
  useEffect(() => {
    setEnv({ standalone: runningAsApp(), apple: isAppleMobile() })
  }, [])

  const installed = current.installed || env.standalone
  const canPrompt = !installed && current.deferred !== null
  const needsGuide = !installed && !canPrompt && env.apple

  async function install() {
    const deferred = state.deferred
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    // A prompt can only be used once, whatever the answer.
    setState({ deferred: null, installed: choice.outcome === "accepted" })
    return choice.outcome === "accepted"
  }

  return { installed, canPrompt, needsGuide, available: canPrompt || needsGuide, install }
}

function AppleGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Put Abu Twins on your home screen</DialogTitle>
          <DialogDescription>It then opens full screen like any other app, and keeps working when the network drops.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
              <Share className="h-4 w-4" aria-hidden />
            </span>
            <span className="pt-1.5">
              Tap <strong>Share</strong> in Safari&apos;s bar.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
              <PlusSquare className="h-4 w-4" aria-hidden />
            </span>
            <span className="pt-1.5">
              Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </span>
          </li>
        </ol>
        <Button className="w-full" onClick={() => onOpenChange(false)}>
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Install app" in the avatar menu. Hidden once the shop runs as an app. The
 * Safari guide lives outside the menu (the menu unmounts when it closes), so
 * the header passes `onShowGuide` and renders <InstallAppGuide> itself.
 */
export function InstallAppMenuItem({ onShowGuide }: { onShowGuide: () => void }) {
  const { available, canPrompt, install } = useInstallApp()
  if (!available) return null
  return (
    <DropdownMenuItem
      onSelect={() => {
        if (canPrompt) void install()
        // Let the menu finish closing before the dialog takes focus.
        else setTimeout(onShowGuide, 0)
      }}
    >
      <Download className="mr-2 h-4 w-4" /> Install app
    </DropdownMenuItem>
  )
}

export { AppleGuide as InstallAppGuide }

const DISMISS_KEY = "install-banner-dismissed"

/** A one-time nudge on Home for phones and tablets. Closing it keeps it closed. */
export function InstallAppBanner() {
  const { available, canPrompt, install } = useInstallApp()
  const [dismissed, setDismissed] = useState(true)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Private mode: it simply shows again next time.
    }
  }

  if (!available || dismissed) return null

  return (
    <div className="surface-card flex items-center gap-3 p-3 lg:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Use Abu Twins as an app</p>
        <p className="text-xs text-muted-foreground">Opens full screen from your home screen, and keeps working offline.</p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          if (canPrompt) void install()
          else setGuide(true)
        }}
      >
        Install
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <AppleGuide open={guide} onOpenChange={setGuide} />
    </div>
  )
}
