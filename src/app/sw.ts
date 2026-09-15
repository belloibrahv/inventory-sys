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

/** Health pings and sign-in must hit the live server, never a cached reply. */
const liveOnly: RuntimeCaching = {
  matcher: ({ url, sameOrigin }) =>
    sameOrigin && (url.pathname.startsWith("/api/health") || url.pathname.startsWith("/api/auth")),
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
    if (request.mode === "navigate") return true
    const accept = request.headers.get("accept") || ""
    return request.method === "GET" && accept.includes("text/html")
  },
  handler: new NetworkFirst({
    cacheName: "app-pages",
    networkTimeoutSeconds: 3,
    plugins: [pageExpiry],
  }),
}

const rscPages: RuntimeCaching = {
  matcher: ({ request, url, sameOrigin }) =>
    sameOrigin &&
    !url.pathname.startsWith("/api/") &&
    (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1"),
  handler: new NetworkFirst({
    cacheName: "app-rsc",
    networkTimeoutSeconds: 3,
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
