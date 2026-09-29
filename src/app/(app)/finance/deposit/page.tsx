import Link from "next/link"
import { createCashDeposit, getCashDeposits } from "@/app/actions/cash-deposits"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { FormField } from "@/components/form-field"
import { FormScreen, ShopTag, TableEmpty, TableShell } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { can, canUndo } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { shopCashOnHand } from "@/lib/shop-cash"
import { watDayKey } from "@/lib/lagos-day"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { UndoDeposit } from "./undo-deposit"

export default async function MoveCashToBankPage() {
  const me = await requireUser()
  const [mayDeposit, mayUndo, branches, deposits] = await Promise.all([
    can(me.role, "action.deposit"),
    canUndo(me.role),
    getBranches(),
    getCashDeposits(),
  ])
  const shops = branches.filter((branch) => branch.isActive)

  // What each till can give right now: the cash on the books, less shop bills
  // still waiting for a yes (the same rule that refuses a cash pay-out).
  const [tills, waiting, banks] = await Promise.all([
    Promise.all(shops.map((shop) => shopCashOnHand(shop.id))),
    prisma.expense.groupBy({
      by: ["branchId"],
      where: { approvedAt: null, branchId: { in: shops.map((shop) => shop.id) } },
      _sum: { amount: true },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      include: { branch: { select: { name: true } } },
      orderBy: [{ bankName: "asc" }, { accountNumber: "asc" }],
    }),
  ])
  const waitingByShop = new Map(waiting.map((row) => [row.branchId, money(row._sum.amount)]))
  const ready = shops.map((shop, index) => ({
    id: shop.id,
    name: shop.name,
    cash: Math.max(0, tills[index].available - (waitingByShop.get(shop.id) ?? 0)),
  }))
  const myShop = ready.find((shop) => shop.id === me.branchId) ?? ready[0]
  // The shop's own accounts first, then the rest of our accounts.
  const bankOptions = [...banks].sort(
    (a, b) => Number(b.branchId === myShop?.id) - Number(a.branchId === myShop?.id)
  )
  const today = watDayKey()
  const liveDeposits = deposits.filter((row) => !row.undoneAt)
  const movedTotal = liveDeposits.reduce((sum, row) => sum + row.amount, 0)

  const aside = (
    <div className="surface-card p-4">
      <h2 className="text-sm font-semibold">Cash in the till now</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        What each shop can move to the bank. Bills waiting for a yes are held back.
      </p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {ready.map((shop) => (
          <li key={shop.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{shop.name}</span>
            <span className="num shrink-0 font-semibold">{formatCurrency(shop.cash)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="space-y-6">
      <FormScreen
        title="Move cash to bank"
        description="Cash paid from the till into one of our bank accounts. The till goes down and the bank goes up by the same amount. It is not an expense."
        backHref="/finance"
        aside={aside}
      >
        {!mayDeposit ? (
          <p className="text-sm text-muted-foreground">
            You can see the cash moved to the bank below. Moving cash is for the shop manager, the accountant, the
            CEO and the main admin.
          </p>
        ) : banks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank account is listed yet. Add one under{" "}
            <Link href="/finance" className="font-medium text-primary hover:underline">
              Money in &amp; out
            </Link>{" "}
            first, then come back to move cash into it.
          </p>
        ) : (
          <ActionForm
            action={createCashDeposit}
            submit="Move this cash to the bank"
            pendingLabel="Moving the cash"
            successMessage="Cash moved to the bank."
            className="space-y-4"
            confirmModal={{
              title: "Move this cash to the bank?",
              description: "Cash in the till goes down by this amount and the bank account goes up by the same amount.",
              tone: "primary",
              confirmLabel: "Yes, move it",
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="From the till at">
                <Select name="branchId" required defaultValue={myShop?.id}>
                  {ready.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name} · {formatCurrency(shop.cash)} in the till
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Into the bank account">
                <Select name="bankAccountId" required defaultValue="">
                  <option value="" disabled>
                    Pick the account
                  </option>
                  {bankOptions.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bankName} {bank.accountNumber}
                      {bank.accountName ? ` · ${bank.accountName}` : ""} ({bank.branch.name})
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Amount paid in (₦)" hint="It cannot be more than the cash in that till.">
                <Input name="amount" type="number" inputMode="decimal" min={1} step="0.01" required />
              </FormField>
              <FormField label="Day it went into the bank">
                <Input name="depositedOn" type="date" max={today} defaultValue={today} required />
              </FormField>
              <FormField label="Teller slip or reference" hint="From the bank slip or the transfer alert.">
                <Input name="slipNumber" placeholder="e.g. 0041552" maxLength={80} />
              </FormField>
              <FormField label="Who took it to the bank, or a note">
                <Input name="note" placeholder="e.g. Tunde took it to GTBank Ring Road" maxLength={300} />
              </FormField>
            </div>
          </ActionForm>
        )}
      </FormScreen>

      <TableShell
        className="mx-auto w-full max-w-6xl"
        caption={
          <>
            <h2 className="text-sm font-semibold tracking-tight">Cash moved to the bank</h2>
            <span className="text-xs text-muted-foreground">
              {liveDeposits.length} deposit{liveDeposits.length === 1 ? "" : "s"} · {formatCurrency(movedTotal)}
            </span>
          </>
        }
        columns={[
          { label: "Day" },
          { label: "From" },
          { label: "Into" },
          { label: "Slip and note" },
          { label: "By" },
          { label: "Amount", align: "right" },
          ...(mayUndo ? [{ label: "", align: "right" as const }] : []),
        ]}
      >
        {deposits.map((row) => (
          <tr key={row.id} className={row.undoneAt ? "opacity-60" : undefined}>
            <td className="whitespace-nowrap">{formatDate(new Date(row.depositedAt))}</td>
            <td>
              <ShopTag>{row.shopCode}</ShopTag>
            </td>
            <td className="whitespace-nowrap">{row.bank}</td>
            <td className="min-w-40">
              <p>{row.slipNumber ? `Slip ${row.slipNumber}` : "No slip number"}</p>
              {row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
              {row.undoneAt ? (
                <p className="text-xs font-medium text-danger">Undone: {row.undoneReason}</p>
              ) : null}
            </td>
            <td className="whitespace-nowrap">{row.by}</td>
            <td className={`text-right num font-semibold ${row.undoneAt ? "line-through" : ""}`}>
              {formatCurrency(row.amount)}
            </td>
            {mayUndo ? (
              <td className="text-right">
                {row.undoneAt ? null : <UndoDeposit id={row.id} label={row.depositNumber} />}
              </td>
            ) : null}
          </tr>
        ))}
        {deposits.length === 0 ? (
          <TableEmpty colSpan={mayUndo ? 7 : 6}>No cash has been moved to the bank yet.</TableEmpty>
        ) : null}
      </TableShell>
    </div>
  )
}
