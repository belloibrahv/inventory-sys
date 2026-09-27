import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { Plus_Jakarta_Sans } from "next/font/google"
import { SerwistProvider } from "@serwist/turbopack/react"
import "./globals.css"
import { Providers } from "./providers"

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
})

export const metadata: Metadata = {
  title: "Abu Twins Softskills",
  description: "Shop system for Abu Twins Softskills Investment: phones, laptops, and power.",
  applicationName: "Abu Twins Softskills",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Abu Twins",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  // Lets the bottom tab bar and till bar sit clear of the iPhone home bar.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#001BCE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F121A" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.variable} font-sans`}>
        <Script id="theme-boot" strategy="beforeInteractive">
          {`try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`}
        </Script>
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  )
}
