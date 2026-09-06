export const pageTitles: Record<string, string> = {
  "/dashboard": "Home",
  "/products": "Phones & items",
  "/imei": "Phone IMEIs",
  "/inventory": "Shop stock",
  "/incoming": "Goods on the way",
  "/sales": "Sales",
  "/pos": "Sell now",
  "/purchases": "Goods from supplier",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/transfers": "Send to another shop",
  "/returns": "Returns",
  "/swaps": "Swaps",
  "/repairs": "Repairs",
  "/reconciliation": "Stock count",
  "/finance": "Money in & out",
  "/finance/close": "Close the day",
  "/account": "Your login",
  "/expenses": "Expenses",
  "/approvals": "Needs approval",
  "/branches": "Shops",
  "/staff": "Staff",
  "/staff/access": "Who can see what",
  "/reports": "Reports",
  "/audit": "Who did what",
  "/audit/books": "Check the books",
  "/notifications": "Alerts",
  "/settings": "Settings",
}

export function titleFor(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname]
  const match = Object.keys(pageTitles).find((key) => pathname.startsWith(`${key}/`))
  return match ? pageTitles[match] : "Abu Twins"
}
