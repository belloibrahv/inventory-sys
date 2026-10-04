"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Play, X } from "lucide-react"
import { BrandLockup } from "@/components/brand-mark"

const LOOP = "/media/shop-loop.mp4"
const FILM = "/media/shop-film.mp4"
const POSTER = "/media/shop-poster.jpg"
const SHOPS = ["Iwo Road", "Bodija", "Challenge"]

function prefersStill() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * The full shop film, with sound, in a player over the page. It loads only
 * when someone asks for it: ~13 MB is too much to fetch for every sign-in.
 */
function ShopFilm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const scroll = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = scroll
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Abu Twins shop film"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <video
          src={FILM}
          poster={POSTER}
          controls
          autoPlay
          playsInline
          preload="none"
          className="max-h-[88vh] w-auto max-w-[92vw] rounded-2xl bg-black shadow-2xl"
          style={{ aspectRatio: "9 / 16" }}
        />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close the shop film"
          className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function WatchButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Watch our shop film"
      className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-white/12 py-1.5 pl-1.5 pr-5 text-sm font-medium text-white ring-1 ring-white/30 backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
    >
      <span
        className={`flex items-center justify-center rounded-full bg-white text-[#001BCE] shadow-[0_0_24px_rgba(255,255,255,0.35)] transition group-hover:scale-105 ${compact ? "h-8 w-8" : "h-10 w-10"}`}
      >
        <Play className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} translate-x-[1px] fill-current`} />
      </span>
      {compact ? "Watch" : "Watch our shop"}
    </button>
  )
}

/**
 * The sign-in front door: a silent loop of the Iwo Road shop floor behind the
 * brand, and the full film one click away. People who ask their device for
 * less motion get the still frame instead of the loop.
 */
export function LoginHero() {
  const loopRef = useRef<HTMLVideoElement>(null)
  const [filmOpen, setFilmOpen] = useState(false)

  useEffect(() => {
    const video = loopRef.current
    if (!video || prefersStill()) return
    video.play().catch(() => {
      // Autoplay refused (data saver, low power): the poster stays, which is fine.
    })
  }, [])

  return (
    <>
      {/* Wide screens: the film fills the left half. */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[#001BCE] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <video
          ref={loopRef}
          src={LOOP}
          poster={POSTER}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        {/* Brand-blue wash for legible type over a bright shop floor. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,12,90,0.72)_0%,rgba(0,27,206,0.18)_34%,rgba(0,12,90,0.35)_58%,rgba(0,10,70,0.92)_100%)]"
        />

        <div className="relative z-10 flex items-center justify-between">
          <BrandLockup light />
          <WatchButton onClick={() => setFilmOpen(true)} />
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 ring-1 ring-white/20 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-[#18C020]" />
            Phones · Laptops · Power
          </p>
          <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight xl:text-6xl">
            Every phone, every sale, every naira.
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-white/80">
            The Abu Twins shop system keeps stock, sales and money in one place, across every branch.
          </p>
          <ul className="flex flex-wrap gap-2 pt-2">
            {SHOPS.map((shop) => (
              <li
                key={shop}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1.5 text-sm text-white ring-1 ring-white/15 backdrop-blur-md"
              >
                <MapPin className="h-3.5 w-3.5 text-[#18C020]" />
                {shop}
              </li>
            ))}
            <li className="inline-flex items-center px-1 py-1.5 text-sm text-white/60">Ibadan</li>
          </ul>
        </div>
      </section>

      {/* Phones: a still banner above the form. No autoplay, to spare data. */}
      <section className="relative h-60 overflow-hidden bg-[#001BCE] text-white sm:h-72 lg:hidden">
        <img src={POSTER} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,12,90,0.65)_0%,rgba(0,27,206,0.15)_45%,rgba(0,10,70,0.9)_100%)]"
        />
        <div className="relative flex h-full flex-col justify-between p-5">
          <BrandLockup light compact />
          <div className="flex items-end justify-between gap-3">
            <p className="min-w-0 max-w-[15rem] text-xl font-semibold leading-tight tracking-tight">
              Every phone, every sale, every naira.
            </p>
            <WatchButton compact onClick={() => setFilmOpen(true)} />
          </div>
        </div>
      </section>

      <ShopFilm open={filmOpen} onClose={() => setFilmOpen(false)} />
    </>
  )
}
