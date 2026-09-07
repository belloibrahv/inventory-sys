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
  "/neighbor-fills",
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
  "/profits",
  "/reports",
  "/audit",
  "/notifications",
  "/settings",
] as const

export function pathIsAllowed(pathname: string, allowedHrefs: string[]) {
  if (pathname === "/account" || pathname.startsWith("/account/")) return true
  if (pathname === "/help" || pathname.startsWith("/help/")) return true
  if (pathname === "/finance/close" || pathname.startsWith("/finance/close/")) {
    return allowedHrefs.includes("/finance") || allowedHrefs.includes("/pos") || allowedHrefs.includes("/finance/close")
  }
  if (pathname === "/audit/books" || pathname.startsWith("/audit/books/")) {
    return (
      allowedHrefs.includes("/audit") ||
      allowedHrefs.includes("/finance") ||
      allowedHrefs.includes("/reports") ||
      allowedHrefs.includes("/audit/books")
    )
  }
  const view = VIEW_HREFS
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((href) => pathname === href || pathname.startsWith(`${href}/`))
  if (!view) return false
  return allowedHrefs.includes(view)
}
