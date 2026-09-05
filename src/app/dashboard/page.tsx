import Dashboard from "@/components/dashboard"
import { getCurrentUser } from "@/lib/auth-utils"

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || "User"}
        </p>
      </div>
      <Dashboard />
    </div>
  )
}