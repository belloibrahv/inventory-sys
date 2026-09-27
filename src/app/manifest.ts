import type { MetadataRoute } from "next"

/**
 * What a phone, tablet or computer needs to install the shop as an app: its
 * name, icons, colours, and the screen it opens on. Served at
 * /manifest.webmanifest and linked from every page by Next.
 *
 * Icons come in two shapes. "any" is the round mark as drawn. "maskable" is
 * full-bleed blue with the letters kept inside the middle 80%, so Android can
 * cut it to a circle, squircle or rounded square without clipping the "ab".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Abu Twins Softskills",
    short_name: "Abu Twins",
    description: "Sell, stock, swaps, transfers and money for every Abu Twins shop.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F5F7FB",
    theme_color: "#001BCE",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // Long-press the app icon to jump straight to these.
    shortcuts: [
      { name: "Sell now", url: "/pos", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Find a phone", short_name: "IMEI", url: "/imei", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Shop stock", short_name: "Stock", url: "/inventory", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Start a swap", short_name: "Swap", url: "/swaps/new", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
    ],
  }
}
