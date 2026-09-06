const VIEW_HREFS = [
  "/dashboard",
  "/products",
  "/imei",
  "/inventory",
  "/incoming",
  "/sales",
  "/pos",
  "/purchases",
  "/customers",
  "/suppliers",
  "/transfers",
  "/returns",
  "/swaps",
  "/repairs",
  "/reconciliation",
  "/finance",
  "/expenses",
  "/approvals",
  "/branches",
  "/staff/access",
  "/staff",
  "/reports",
  "/audit",
  "/notifications",
  "/settings",
] as const

export function pathIsAllowed(pathname: string, allowedHrefs: string[]) {
  if (pathname === "/account" || pathname.startsWith("/account/")) return true
  const view = VIEW_HREFS
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((href) => pathname === href || pathname.startsWith(`${href}/`))
  if (!view) return false
  return allowedHrefs.includes(view)
}
