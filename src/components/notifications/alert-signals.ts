"use client"

/**
 * The ways an alert reaches a person besides the screen they are looking at:
 * a short chime, and a notification on the device when the app is in the
 * background. Both are gentle and both fail quietly.
 */

let audio: AudioContext | null = null

/**
 * Browsers only allow sound after the person has touched the page, so the
 * audio is set up on the first tap or key press.
 */
export function primeChime() {
  if (typeof window === "undefined") return
  const unlock = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!audio && Ctx) audio = new Ctx()
      void audio?.resume()
    } catch {
      // No sound on this device; the toast still shows.
    }
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
  }
  window.addEventListener("pointerdown", unlock, { once: true })
  window.addEventListener("keydown", unlock, { once: true })
}

/** Two soft notes; "urgent" (price approvals and their answers) rises, "soft" is one note. */
export function playChime(kind: "soft" | "urgent") {
  if (!audio || audio.state !== "running") return
  try {
    const notes = kind === "urgent" ? [660, 880] : [740]
    notes.forEach((frequency, index) => {
      const start = audio!.currentTime + index * 0.16
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.type = "sine"
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain).connect(audio!.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })
  } catch {
    // Sound is a nicety.
  }
}

export function deviceAlertsState(): "on" | "off" | "blocked" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  if (Notification.permission === "granted") return "on"
  if (Notification.permission === "denied") return "blocked"
  return "off"
}

/** Ask once, from a button the person pressed, to show alerts on this device. */
export async function turnOnDeviceAlerts() {
  if (deviceAlertsState() === "unsupported") return "unsupported" as const
  const answer = await Notification.requestPermission()
  return answer === "granted" ? ("on" as const) : answer === "denied" ? ("blocked" as const) : ("off" as const)
}

/**
 * A notification on the phone or computer, for when the app is not in front.
 * Goes through the service worker where there is one (needed on Android and
 * for installed apps), so tapping it opens the right screen.
 */
export async function showDeviceNotification(input: { title: string; body: string; url: string; tag: string; urgent?: boolean }) {
  if (deviceAlertsState() !== "on") return
  if (document.visibilityState === "visible" && !input.urgent) return
  const options: NotificationOptions & { renotify?: boolean } = {
    body: input.body,
    tag: input.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: input.url },
    requireInteraction: Boolean(input.urgent),
    renotify: true,
  }
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(input.title, options)
      return
    }
    const note = new Notification(input.title, options)
    note.onclick = () => {
      window.focus()
      window.location.assign(input.url)
    }
  } catch {
    // Some browsers refuse in private windows; the in-app alert still shows.
  }
}
