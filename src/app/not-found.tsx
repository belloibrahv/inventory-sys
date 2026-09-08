import Link from "next/link"
import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface-card w-full max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Compass className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">There is no such page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the record may have been removed. Head back to Home
          and find it from the menu.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/dashboard">Go to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
