import { withSerwist } from "@serwist/turbopack"

/**
 * Sent on every response. These are defence-in-depth: they do not replace the
 * per-action permission checks, they harden the browser around them.
 *
 * - X-Frame-Options / frame-ancestors: the shop cannot be framed, so a hidden
 *   iframe cannot trick a signed-in manager into clicking a real button
 *   (clickjacking).
 * - X-Content-Type-Options: the browser must not guess a file's type, so an
 *   uploaded sheet cannot be re-read as a script.
 * - Referrer-Policy: an invoice or customer id in the address bar is not leaked
 *   to other sites.
 * - Permissions-Policy: the shop asks for no camera, microphone or location.
 * - HSTS: once seen over HTTPS, the browser refuses plain HTTP for a year.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // A conservative policy that still allows Next's own inline runtime and the
    // Tailwind styles the app ships. It blocks framing and foreign plugins, and
    // keeps scripts, styles and data to this origin.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; "),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default withSerwist(nextConfig)
