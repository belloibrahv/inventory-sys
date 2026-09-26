import { Skeleton } from "@/components/ui/skeleton"

/**
 * Shown while a shop screen is being put together.
 *
 * Every screen here reads from the database on the server, so without this the
 * old screen sat frozen and staff could not tell whether their tap had landed.
 * It used to be a full blue brand panel, which flashed on every tap. Now it is
 * the shape of a screen: a title, a row of figures and a list, so the page
 * seems to fill in rather than jump.
 */
export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-busy aria-label="Opening this page">
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/10">
        <div className="brand-page-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="surface-card space-y-3 p-3 sm:p-4">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="surface-card space-y-3 p-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="surface-card divide-y divide-border overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5 rounded-md" />
              <Skeleton className="h-3 w-3/5 rounded-md" />
            </div>
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
        ))}
      </div>
      <span className="sr-only">Opening this page</span>
    </div>
  )
}
