import DashboardLayout from "@/app/dashboard/layout"

export default function BranchesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout>{children}</DashboardLayout>
}