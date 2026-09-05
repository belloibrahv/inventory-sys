import DashboardLayout from "@/app/dashboard/layout"

export default function IMEILayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout>{children}</DashboardLayout>
}