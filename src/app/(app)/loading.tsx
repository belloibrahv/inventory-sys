import { Skeleton } from "@/components/ui/skeleton"

/**
 * Shown while a shop screen is being put together.
 *
 * Every screen here reads from the database on the server, so without this the
 * old screen sat frozen and staff could not tell whether their tap had landed.
 * It also lets Next start the move to the new screen straight away.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy role="status">
      <span className="sr-only">Loading this screen</span>

      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="surface-card space-y-3 p-5">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>

      <div className="surface-card p-5">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-32 sm:block" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
