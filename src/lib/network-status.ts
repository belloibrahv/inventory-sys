"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

export type NetworkState = "online" | "offline" | "reconnecting" | "syncing"

export interface NetworkInfo {
  state: NetworkState
  latencyMs: number | null
  lastOnlineAt: Date | null
  offlineSince: Date | null
}

class NetworkMonitor {
  private state: NetworkState = "online"
  private latencyMs: number | null = null
  private lastOnlineAt: Date | null = new Date()
  private offlineSince: Date | null = null
  private listeners = new Set<() => void>()
  private checkTimer: number | null = null
  private isChecking = false

  constructor() {
    if (typeof window !== "undefined") {
      this.state = navigator.onLine ? "online" : "offline"
      if (!navigator.onLine) {
        this.offlineSince = new Date()
      }

      window.addEventListener("online", () => this.handleBrowserOnline())
      window.addEventListener("offline", () => this.handleBrowserOffline())

      // Initial active probe
      void this.ping()

      // Regular heartbeat every 30 seconds
      this.checkTimer = window.setInterval(() => {
        void this.ping()
      }, 30_000)
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private handleBrowserOnline() {
    this.state = "reconnecting"
    this.notify()
    void this.ping()
  }

  private handleBrowserOffline() {
    this.state = "offline"
    this.offlineSince = new Date()
    this.latencyMs = null
    this.notify()
  }

  public setSyncing(isSyncing: boolean) {
    if (isSyncing) {
      this.state = "syncing"
    } else {
      this.state = navigator.onLine ? "online" : "offline"
    }
    this.notify()
  }

  public async ping(): Promise<boolean> {
    if (typeof window === "undefined" || this.isChecking) return this.state === "online"
    if (!navigator.onLine) {
      if (this.state !== "offline") {
        this.state = "offline"
        this.offlineSince = this.offlineSince || new Date()
        this.notify()
      }
      return false
    }

    this.isChecking = true
    const start = performance.now()

    try {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 6000)

      const response = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      })

      window.clearTimeout(timeoutId)

      if (response.ok) {
        const roundTrip = Math.round(performance.now() - start)
        this.latencyMs = roundTrip
        this.lastOnlineAt = new Date()
        this.offlineSince = null
        if (this.state !== "syncing") {
          this.state = "online"
        }
        this.notify()
        this.isChecking = false
        return true
      } else {
        throw new Error(`Health ping returned ${response.status}`)
      }
    } catch {
      // Failed to reach the server despite navigator.onLine
      this.latencyMs = null
      this.state = "offline"
      if (!this.offlineSince) {
        this.offlineSince = new Date()
      }
      this.notify()
      this.isChecking = false
      return false
    }
  }

  public getSnapshot(): NetworkInfo {
    return {
      state: this.state,
      latencyMs: this.latencyMs,
      lastOnlineAt: this.lastOnlineAt,
      offlineSince: this.offlineSince,
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }
}

let monitorInstance: NetworkMonitor | null = null

export function getNetworkMonitor(): NetworkMonitor {
  if (!monitorInstance) {
    monitorInstance = new NetworkMonitor()
  }
  return monitorInstance
}

export function useNetworkStatus(): NetworkInfo & { checkNow: () => Promise<boolean> } {
  const monitor = getNetworkMonitor()

  const snapshot = useSyncExternalStore(
    (callback) => monitor.subscribe(callback),
    () => monitor.getSnapshot(),
    () => ({
      state: "online" as NetworkState,
      latencyMs: null,
      lastOnlineAt: null,
      offlineSince: null,
    })
  )

  return {
    ...snapshot,
    checkNow: () => monitor.ping(),
  }
}
