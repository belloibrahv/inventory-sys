"use client"

import { NetworkStatusIndicator } from "@/components/network-status-indicator"

/**
 * Enterprise Network & Offline Connectivity Indicator.
 * Displays real-time connection state, local IndexedDB queue status, and provides
 * access to the Offline Operations & Sync Center.
 */
export function OfflineBanner() {
  return <NetworkStatusIndicator />
}
