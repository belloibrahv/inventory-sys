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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Abu Twins",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/brand/ab-mark.jpg",
  },
}

export const viewport: Viewport = {
  themeColor: "#001BCE",
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
