import Link from "next/link"
import { Coins, HandCoins, Users, Wallet } from "lucide-react"
import { createSupplier, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import {
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
  TableEmpty,
  TableShell,
  TonePill,
} from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()

  const totalInvoiced = suppliers.reduce((sum, s) => sum + s.purchases.reduce((acc, p) => acc + money(p.totalAmount), 0), 0)
  const totalPaid = suppliers.reduce((sum, s) => sum + s.purchases.reduce((acc, p) => acc + money(p.paidAmount), 0), 0)
  const totalOwed = Math.max(0, totalInvoiced - totalPaid)
  const owingCount = suppliers.filter((s) => s.purchases.reduce((acc, p) => acc + money(p.totalAmount) - money(p.paidAmount), 0) > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="What we bought from each supplier, what we paid, and what we still owe. Open a supplier to see bill by bill."
      />

      <StatGrid>
        <StatCard
          label="Suppliers on the books"
          value={String(suppliers.length)}
          hint={`${owingCount} we still owe something to`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Bought from them, all time"
          value={formatCurrency(totalInvoiced)}
          hint="Total value of every carton billed to us"
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="We have paid them"
          value={formatCurrency(totalPaid)}
          hint="Money already sent out against those bills"
          icon={<HandCoins className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="We still owe"
          value={formatCurrency(totalOwed)}
          hint="Money we have not paid them yet"
          icon={<Wallet className="h-4 w-4" />}
          tone={totalOwed > 0 ? "warning" : "neutral"}
        />
      </StatGrid>

      <div className="page-split">
        <TableShell
          columns={[
            { label: "Supplier" },
            { label: "From" },
            { label: "Bought from them", align: "right" },
            { label: "We have paid", align: "right" },
            { label: "Still owed", align: "right" },
            { label: "", align: "center" },
          ]}
        >
          {suppliers.map((supplier) => {
            const purchased = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
            const paid = supplier.purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
            const owed = Math.max(0, purchased - paid)

            return (
              <tr key={supplier.id}>
                <td>
                  <Link href={`/suppliers/${supplier.id}`} className="font-medium text-primary hover:underline">
                    {supplier.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {supplier.kind === "NEIGHBOR" ? "Neighbouring shop" : "Carton supplier"} · {supplier.phone}
                  </p>
                </td>
                <td className="text-xs text-muted-foreground">
                  {[supplier.city, supplier.country].filter(Boolean).join(", ") || "Not recorded"}
                </td>
                <td className="text-right num font-medium">{formatCurrency(purchased)}</td>
                {/*
                  The client's point: "this is only showing me the amount of stock
                  that I purchased from a particular vendor, and if I am owing or
                  not owing. This is not showing me how much I have paid."
                */}
                <td className="text-right num text-success">{formatCurrency(paid)}</td>
                <td className="text-right num font-semibold">{formatCurrency(owed)}</td>
                <td className="text-center">
                  {owed === 0 ? <TonePill tone="success">Settled</TonePill> : <TonePill tone="warning">Owing</TonePill>}
                </td>
              </tr>
            )
          })}
          {suppliers.length === 0 ? (
            <TableEmpty colSpan={6}>No suppliers on the books yet. Add one on the right.</TableEmpty>
          ) : null}
        </TableShell>

        <SectionCard title="Add a supplier">
          <ActionForm action={createSupplier} className="space-y-3">
            <Select name="kind" defaultValue="SUPPLIER">
              <option value="SUPPLIER">Supplier of cartons</option>
              <option value="NEIGHBOR">Neighboring shop we fill from</option>
            </Select>
            <Input name="name" placeholder="Name" required />
            <Input name="phone" placeholder="Phone" required />
            <Input name="country" placeholder="Country, such as China or UAE" />
            <Input name="city" placeholder="City or market" />
            <Input name="contactPerson" placeholder="Contact person" />
            <Input name="email" placeholder="Email" />
            <Input name="address" placeholder="Address" />
          </ActionForm>
        </SectionCard>
      </div>
    </div>
  )
}

