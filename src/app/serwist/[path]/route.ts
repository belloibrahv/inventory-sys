import { spawnSync } from "node:child_process"
import { createSerwistRoute } from "@serwist/turbopack"

function getRevision(): string {
  const envSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.npm_package_version

  if (envSha) return envSha

  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8",
      timeout: 2000,
    })
    if (result && typeof result.stdout === "string" && result.stdout.trim()) {
      return result.stdout.trim()
    }
  } catch {
    // Ignore git failure in container/serverless environments
  }

  return "1.0.0"
}

const revision = getRevision()

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  // Only pages and routes go here. Files in public/ (icons, brand mark) are
  // already precached by Serwist with a content hash; listing one again with a
  // different revision makes the worker throw add-to-cache-list-conflicting-entries
  // and never install, which silently turns off offline mode.
  additionalPrecacheEntries: [
    { url: "/offline", revision },
    { url: "/manifest.webmanifest", revision },
  ],
  // The shop film and its poster stay off the precache: fetching ~14 MB of
  // video onto every staff phone when the app installs would eat their data.
  // The sign-in page streams them only when it is open.
  // Setting this replaces Serwist's own default, so that default is kept here.
  globIgnores: ["**/node_modules/**/*", "public/media/**"],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
})
