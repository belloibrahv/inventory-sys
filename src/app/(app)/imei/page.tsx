import Link from "next/link"
import { getImeiRecords, intakeImei } from "@/app/actions/imei"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { warrantyState } from "@/lib/warranty"

export default async function ImeiPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams
  const [records, branches, suppliers, products] = await Promise.all([
    getImeiRecords(q, status),
    getBranches(),
    getSuppliers(),
    getProducts(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Phone IMEIs" description="Phones and serial items. Coming units are not for sale until they arrive in the shop." />
      <WorkflowSteps current={1} steps={["Receive phone", "In shop", "Sell or move", "Return or repair"]} />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.7fr]">
        <div className="surface-card overflow-hidden">
          <form className="grid gap-2 border-b border-border p-4 md:grid-cols-[1fr_180px_auto]">
            <Input name="q" defaultValue={q} placeholder="Search IMEI, serial, customer, invoice" />
            <Select name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              {["INCOMING", "IN_STOCK", "SOLD", "RETURNED", "SWAPPED", "REPAIRED", "FAULTY", "TRANSFERRED"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Button type="submit" variant="outline">Search</Button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3">IMEI</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-4 py-3">
                      <Link href={`/imei/${row.id}`} className="font-medium text-primary">{row.imei1}</Link>
                      <p className="text-xs text-muted-foreground">{row.serialNumber}</p>
                    </td>
                    <td className="px-4 py-3">{row.product.name}</td>
                    <td className="px-4 py-3">{row.branch.code}</td>
                    <td className="px-4 py-3">{row.customer?.name ?? row.supplier?.name ?? "Vault"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.status} />
                      {row.status === "SOLD" && row.sale ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {warrantyState(row.sale.saleDate, row.product.warrantyDays).label}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Stock intake</h3>
          <ActionForm action={intakeImei} submit="Add phone to shop" className="space-y-3">
            <Input name="imei1" placeholder="IMEI 1" required />
            <Input name="imei2" placeholder="IMEI 2" />
            <Input name="serialNumber" placeholder="Serial" />
            <Select name="productId" required>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </Select>
            <Select name="branchId" required>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
            <Select name="supplierId">
              <option value="">Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
            <Input name="notes" placeholder="Notes" />
          </ActionForm>
        </div>
      </div>
    </div>
  )
}
