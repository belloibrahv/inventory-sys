import { withSerwist } from "@serwist/turbopack"

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
}

export default withSerwist(nextConfig)
