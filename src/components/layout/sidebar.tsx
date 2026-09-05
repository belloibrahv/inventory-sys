"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Branches", href: "/branches" },
  { name: "Products", href: "/products" },
  { name: "IMEI Tracking", href: "/imei" },
  { name: "Inventory", href: "/inventory" },
  { name: "Sales", href: "/sales" },
  { name: "Customers", href: "/customers" },
  { name: "Suppliers", href: "/suppliers" },
  { name: "Transfers", href: "/transfers" },
  { name: "Returns", href: "/returns" },
  { name: "Finance", href: "/finance" },
  { name: "Reports", href: "/reports" },
  { name: "Audit", href: "/audit" },
  { name: "Settings", href: "/settings" },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 border-r border-gray-200 bg-white h-screen fixed left-0 top-0 pt-16">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}