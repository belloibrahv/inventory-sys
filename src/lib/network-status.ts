"use client"

import * as React from "react"

export type NetworkState = "online" | "offline" | "reconnecting" | "syncing"

export interface NetworkInfo {
  state: NetworkState
  latencyMs: number | null
  lastOnlineAt: Date | null
  offlineSince: Date | null
}

const SERVER_SNAPSHOT: NetworkInfo = Object.freeze({
  state: "online",
  latencyMs: null,
  lastOnlineAt: null,
  offlineSince: null,
})

class NetworkMonitor {
  private state: NetworkState = "online"
  private latencyMs: number | null = null
  private lastOnlineAt: Date | null = null
  private offlineSince: Date | null = null
  private listeners = new Set<() => void>()
  private checkTimer: number | null = null
  private isChecking = false
  private currentSnapshot: NetworkInfo

  constructor() {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
    this.state = isOnline ? "online" : "offline"
    this.lastOnlineAt = isOnline ? new Date() : null
    this.offlineSince = isOnline ? null : new Date()

    this.currentSnapshot = Object.freeze({
      state: this.state,
      latencyMs: this.latencyMs,
      lastOnlineAt: this.lastOnlineAt,
      offlineSince: this.offlineSince,
    })

    if (typeof window !== "undefined") {
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

  private updateSnapshot() {
    this.currentSnapshot = Object.freeze({
      state: this.state,
      latencyMs: this.latencyMs,
      lastOnlineAt: this.lastOnlineAt,
      offlineSince: this.offlineSince,
    })
    for (const listener of this.listeners) {
      listener()
    }
  }

  private handleBrowserOnline() {
    this.state = "reconnecting"
    this.updateSnapshot()
    void this.ping()
  }

  private handleBrowserOffline() {
    this.state = "offline"
    this.offlineSince = new Date()
    this.latencyMs = null
    this.updateSnapshot()
  }

  public setSyncing(isSyncing: boolean) {
    if (isSyncing) {
      this.state = "syncing"
    } else {
      this.state = typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
    }
    this.updateSnapshot()
  }

  public async ping(): Promise<boolean> {
    if (typeof window === "undefined" || this.isChecking) return this.state === "online"
    if (!navigator.onLine) {
      if (this.state !== "offline") {
        this.state = "offline"
        this.offlineSince = this.offlineSince || new Date()
        this.latencyMs = null
        this.updateSnapshot()
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
        this.updateSnapshot()
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
      this.updateSnapshot()
      this.isChecking = false
      return false
    }
  }

  public getSnapshot = (): NetworkInfo => {
    return this.currentSnapshot
  }

  public getServerSnapshot = (): NetworkInfo => {
    return SERVER_SNAPSHOT
  }

  public subscribe = (callback: () => void): () => void => {
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

  const snapshot = React.useSyncExternalStore(
    monitor.subscribe,
    monitor.getSnapshot,
    monitor.getServerSnapshot
  )

  const checkNow = React.useCallback(() => monitor.ping(), [monitor])

  return React.useMemo(
    () => ({
      ...snapshot,
      checkNow,
    }),
    [snapshot, checkNow]
  )
}
