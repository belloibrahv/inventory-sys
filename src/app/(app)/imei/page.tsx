import { getImeiRecords, getImeiStatusCounts } from "@/app/actions/imei"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { FilterChips } from "@/components/filter-chips"
import { Button } from "@/components/ui/button"
import { ImeiIntakeForm } from "@/app/(app)/imei/intake-form"
import { ImeiTable } from "@/app/(app)/imei/imei-table"
import { Input } from "@/components/ui/input"
import { IMEI_LIFE } from "@/lib/imei-life"
import { statusLabel } from "@/lib/status"

function buildHref(base: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(base)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/imei?${query}` : "/imei"
}

export default async function ImeiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; life?: string; when?: string }>
}) {
  const { q, status, life, when } = await searchParams
  const [records, counts, branches, suppliers, products] = await Promise.all([
    getImeiRecords(q, status, life, when),
    getImeiStatusCounts(),
    getBranches(),
    getSuppliers(),
    getProducts(),
  ])

  const activePath = buildHref({ q, status, life, when })
  const fineStatuses = [
    "INCOMING",
    "IN_STOCK",
    "SOLD",
    "RETURNED",
    "RETURNED_TO_SUPPLIER",
    "SWAPPED",
    "REPAIRED",
    "FAULTY",
    "TRANSFERRED",
  ] as const

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phone numbers (IMEI)"
        description="Every phone has a life: received, in shop, sold or moved, returned or repaired. Tap a stage to see only those phones. Time is Lagos time."
      />

      <WorkflowSteps
        activeHref={activePath}
        steps={IMEI_LIFE.map((step) => ({
          label: step.label,
          hint: step.hint,
          count: counts.byLife[step.key] ?? 0,
          href: buildHref({ q, when, life: step.key }),
        }))}
      />

      <div className="surface-card space-y-4 p-4">
        <FilterChips
          label="When it last changed"
          activeKey={when || "all"}
          chips={[
            { key: "all", label: "Any day", href: buildHref({ q, status, life }) },
            { key: "today", label: "Today", href: buildHref({ q, status, life, when: "today" }), tone: "primary" },
            { key: "week", label: "Last 7 days", href: buildHref({ q, status, life, when: "week" }) },
            { key: "month", label: "Last 30 days", href: buildHref({ q, status, life, when: "month" }) },
          ]}
        />
        <FilterChips
          label="Exact status"
          activeKey={status || (life ? `life:${life}` : "all")}
          chips={[
            {
              key: "all",
              label: "All phones",
              count: counts.total,
              href: buildHref({ q, when }),
            },
            ...fineStatuses.map((item) => ({
              key: item,
              label: statusLabel(item),
              count: counts.byStatus[item] ?? 0,
              href: buildHref({ q, when, status: item }),
              tone:
                item === "IN_STOCK"
                  ? ("success" as const)
                  : item === "INCOMING"
                    ? ("primary" as const)
                    : item === "FAULTY"
                      ? ("danger" as const)
                      : ("neutral" as const),
            })),
          ]}
        />
      </div>

      <div className="page-split">
        <div className="surface-card overflow-hidden">
          <form className="grid gap-2 border-b border-border p-4 md:grid-cols-[1fr_auto]">
            <Input name="q" defaultValue={q} placeholder="Search IMEI, serial, or item name" />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {life && !status ? <input type="hidden" name="life" value={life} /> : null}
            {when ? <input type="hidden" name="when" value={when} /> : null}
            <Button type="submit">Search</Button>
          </form>
          <ImeiTable records={records} resetKey={`${q ?? ""}|${status ?? ""}|${life ?? ""}|${when ?? ""}`} />
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Stock intake</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Put a phone that is already in your hands onto the shelf. It will show under{" "}
            <span className="font-medium text-foreground">In shop</span> with today&apos;s time.
          </p>
          <ImeiIntakeForm
            products={products.map((product) => ({ id: product.id, name: product.name }))}
            branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          />
        </div>
      </div>
    </div>
  )
}
