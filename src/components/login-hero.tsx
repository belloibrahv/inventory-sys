"use client"

import { useState } from "react"
import { BrandLockup } from "@/components/brand-mark"

/**
 * Sign-in banner. The film is painted with colour and motion, not a photo
 * sitting under a video. Click the play mark to start. Click again to pause.
 */
export function LoginHero() {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="relative hidden min-h-screen overflow-hidden bg-[#001BCE] text-white lg:flex lg:flex-col lg:justify-between p-12">
      <div
        className={`login-film pointer-events-none absolute inset-0 ${playing ? "is-playing" : ""}`}
        aria-hidden
      />

      <div className="relative z-10">
        <BrandLockup light />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-10">
        <button
          type="button"
          onClick={() => setPlaying((on) => !on)}
          className="group relative flex h-28 w-28 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
          aria-label={playing ? "Pause the shop film" : "Play the shop film"}
        >
          <span className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/40 transition group-hover:bg-white/16" />
          <span className="absolute -inset-3 rounded-full border border-white/25" />
          <span className="absolute -inset-6 rounded-full border border-white/10" />
          {playing ? (
            <span className="relative flex items-center gap-2">
              <span className="h-8 w-2.5 rounded-sm bg-white" />
              <span className="h-8 w-2.5 rounded-sm bg-white" />
            </span>
          ) : (
            <span
              className="relative ml-1 block h-0 w-0 border-y-[18px] border-y-transparent border-l-[30px] border-l-white drop-shadow-[0_0_18px_rgba(24,192,32,0.55)]"
              aria-hidden
            />
          )}
        </button>
        <p className="mt-6 text-sm font-medium tracking-wide text-white/80">
          {playing ? "Playing the shop film. Click to pause." : "Click the play mark to watch the shop film."}
        </p>
      </div>

      <div className="relative z-10 max-w-lg space-y-6">
        <p className="text-5xl font-semibold tracking-tight leading-tight">Run the shop with clear numbers</p>
        <p className="text-lg text-white/75">
          See every phone, every sale, and every naira in one place. Old records stay as they are. Nobody can hide a change.
        </p>
      </div>

      <div className="relative z-10 mt-10 space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Abu Twins Softskills Investment</p>
        <p className="text-xs text-white/55">
          Built by{" "}
          <a href="https://techvaults.com/" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
            Techvaults Limited
          </a>
        </p>
      </div>
    </div>
  )
}
