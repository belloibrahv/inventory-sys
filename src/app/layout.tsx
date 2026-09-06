import type { Metadata } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
})

export const metadata: Metadata = {
  title: "Abu Twins Softskills",
  description: "Shop system for Abu Twins Softskills Investment — phones, laptops, and power.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/brand/ab-mark.jpg",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
