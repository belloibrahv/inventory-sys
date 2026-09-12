import { PageHeader } from "@/components/shared"

/** Same wall on every Phones & items form a role is not cleared to use. */
export function CatalogLocked({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <div className="surface-card p-5 text-sm text-muted-foreground">
        Only staff who are allowed to add items and change prices can use this screen. Ask the main admin, then come
        back. You can still read the price list.
      </div>
    </div>
  )
}
