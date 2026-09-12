import { BulkProductUpload } from "@/app/(app)/products/bulk-upload"
import { PageHeader } from "@/components/shared"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

/** Many models at once, from a pasted or uploaded sheet. */
export default async function BulkProductsPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Add from a sheet" />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add items from a sheet"
        description="For a long list of new models. Download the sample, fill it, and upload it. Item codes already on the system are left alone."
      />
      <BulkProductUpload />
    </div>
  )
}
