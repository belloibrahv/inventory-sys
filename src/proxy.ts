import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Tells each screen which address it is answering.
 *
 * The shop layout decides whether this person's job may open this screen, and
 * writes a refused attempt into Who did what. To do that it needs the address,
 * which a server component cannot read on its own. This passes it along on a
 * header.
 *
 * Without this the layout read an empty address, so the check never ran: the
 * screen still came back empty, because every figure on it is fetched behind
 * its own permission check, but the shell was drawn and nothing was recorded.
 *
 * This is only the messenger. The decision, and the refusal, stay on the server
 * where they cannot be skipped.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-pathname", request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Screens only. Sign-in, the service worker, and static files are left alone.
  matcher: ["/((?!api|_next/static|_next/image|brand|icons|favicon.ico|manifest.webmanifest|sw.js|offline).*)"],
}
