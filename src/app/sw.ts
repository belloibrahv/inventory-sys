/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker"
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, type PrecacheEntry, type RuntimeCaching, type SerwistGlobalConfig } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const pageExpiry = new ExpirationPlugin({
  maxEntries: 60,
  maxAgeSeconds: 7 * 24 * 60 * 60,
  maxAgeFrom: "last-used",
})

/** Health pings, alerts and sign-in must hit the live server, never a cached copy. */
const liveOnly: RuntimeCaching = {
  matcher: ({ url, sameOrigin }) =>
    sameOrigin &&
    (url.pathname.startsWith("/api/health") ||
      // Alerts and price approvals must always be the live answer.
      url.pathname.startsWith("/api/notifications") ||
      url.pathname.startsWith("/api/auth") ||
      url.pathname === "/login" ||
      url.pathname === "/"),
  handler: new NetworkOnly(),
}

/**
 * Every shop screen, not only Sell now. Firefox often leaves
 * request.destination empty on a refresh, so we match navigate mode.
 */
const appPages: RuntimeCaching = {
  matcher: ({ request, url, sameOrigin }) => {
    if (!sameOrigin) return false
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/serwist/")) return false
    if (url.pathname === "/login" || url.pathname === "/") return false
    if (request.mode === "navigate") return true
    const accept = request.headers.get("accept") || ""
    return request.method === "GET" && accept.includes("text/html")
  },
  // The live server always wins while it answers at all. A 3-second limit
  // served the saved copy whenever a busy screen (Home runs dozens of queries)
  // took longer, so figures sat a refresh or more behind on a slow line, and a
  // shared phone could show the last person's page. The saved copy is for a
  // line that is down or hung, not one that is slow.
  handler: new NetworkFirst({
    cacheName: "app-pages",
    networkTimeoutSeconds: 20,
    plugins: [pageExpiry],
  }),
}

const rscPages: RuntimeCaching = {
  matcher: ({ request, url, sameOrigin }) =>
    sameOrigin &&
    !url.pathname.startsWith("/api/") &&
    url.pathname !== "/login" &&
    url.pathname !== "/" &&
    (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1"),
  handler: new NetworkFirst({
    cacheName: "app-rsc",
    networkTimeoutSeconds: 20,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 24 * 60 * 60,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [liveOnly, appPages, rscPages, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          // Firefox Work Offline often has an empty destination on refresh.
          return request.mode === "navigate" || request.destination === "document"
        },
      },
    ],
  },
})

serwist.addEventListeners()

self.addEventListener("sync", (event) => {
  const syncEvent = event as Event & { tag?: string; waitUntil: (p: Promise<unknown>) => void }
  if (syncEvent.tag !== "abutwins-flush") return
  syncEvent.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "ABUTWINS_FLUSH" })
      }
    })
  )
})

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type !== "ABUTWINS_FLUSH") return
  void self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: "ABUTWINS_FLUSH" })
    }
  })
})

// A tap on a shop alert (a price approval, or its answer) opens that screen,
// reusing an open window of the app when there is one.
self.addEventListener("notificationclick", (event) => {
  const note = (event as NotificationEvent).notification
  note.close()
  const url = (note.data as { url?: string } | undefined)?.url || "/notifications"
  ;(event as NotificationEvent).waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await (client as WindowClient).focus()
          await (client as WindowClient).navigate(url).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(url)
    })
  )
})

