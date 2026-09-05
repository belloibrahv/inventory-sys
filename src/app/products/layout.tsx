import DashboardLayout from "@/app/dashboard/layout"

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout>{children}</DashboardLayout>
}