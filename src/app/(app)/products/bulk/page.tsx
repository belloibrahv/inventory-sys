import { getProductLookups } from "@/app/actions/catalog"
import { BulkProductUpload } from "@/app/(app)/products/bulk-upload"
import { PageHeader } from "@/components/shared"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

/** Many product names at once, from a sheet. */
export default async function BulkProductsPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Add from a sheet" />

  const lookups = await getProductLookups()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add items from a sheet"
        description="Register many product names and brands. Pick All shops or one shop. Names already on the system stay."
      />
      <BulkProductUpload shops={lookups.branches} />
    </div>
  )
}
