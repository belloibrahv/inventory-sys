"use client"

import { ActionForm } from "@/components/action-form"
import { SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import {
  createBankAccount,
  saveBankOpening,
  saveOpeningCash,
  takeBankOffTheBooks,
  type NamedBankRow,
  type OpeningCashShop,
} from "@/app/actions/finance"
import { formatCurrency } from "@/lib/utils"

export function OpeningMoneyPanel({
  shops,
  bankAccounts,
  canSet,
  openingCash,
  openingBank,
}: {
  shops: OpeningCashShop[]
  bankAccounts: NamedBankRow[]
  canSet: boolean
  openingCash: number
  openingBank: number
}) {
  return (
    <SectionCard
      title="Money we started with"
      description="Cash in the till and money in each bank on the day the shops started using this software. This is not opening stock. Opening stock is phones and pieces on the shelf. Sales, expenses, and supplier payments sit on top of these figures."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <p>
            Opening cash: <span className="num font-semibold">{formatCurrency(openingCash)}</span>
          </p>
          <p>
            Opening banks: <span className="num font-semibold">{formatCurrency(openingBank)}</span>
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Opening cash by shop</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Shop</th>
                  <th className="px-3 py-2 text-right font-medium">Opening cash</th>
                  {canSet ? <th className="px-3 py-2 font-medium">Save a new figure</th> : null}
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium">{shop.name}</p>
                      <p className="text-xs text-muted-foreground">{shop.code}</p>
                    </td>
                    <td className="px-3 py-2 text-right num font-semibold">{formatCurrency(shop.openingCash)}</td>
                    {canSet ? (
                      <td className="px-3 py-2">
                        <ActionForm
                          action={saveOpeningCash}
                          submit="Save opening cash for this shop"
                          pendingLabel="Saving opening cash for this shop"
                          successMessage={`Opening cash saved for ${shop.name}`}
                          resetOnSuccess={false}
                          className="flex flex-wrap items-end gap-2"
                          buttonClassName="mt-0"
                          size="sm"
                        >
                          <input type="hidden" name="branchId" value={shop.id} />
                          <div className="min-w-40 flex-1">
                            <Label htmlFor={`opening-cash-${shop.id}`} className="sr-only">
                              Opening cash at {shop.name}
                            </Label>
                            <Input
                              id={`opening-cash-${shop.id}`}
                              name="amount"
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={shop.openingCash || ""}
                              placeholder="Cash in the till, in naira"
                              required
                            />
                          </div>
                        </ActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shop is open to hold opening cash.</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Bank accounts</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Bank</th>
                  <th className="px-3 py-2 font-medium">Account number</th>
                  <th className="px-3 py-2 font-medium">Shop</th>
                  <th className="px-3 py-2 text-right font-medium">Opening balance</th>
                  {canSet ? <th className="px-3 py-2 font-medium">Change</th> : null}
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.bankName}</p>
                      {row.accountName ? <p className="text-xs text-muted-foreground">{row.accountName}</p> : null}
                    </td>
                    <td className="px-3 py-2 num">{row.accountNumber}</td>
                    <td className="px-3 py-2">{row.branchName}</td>
                    <td className="px-3 py-2 text-right num font-semibold">{formatCurrency(row.openingBalance)}</td>
                    {canSet ? (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <ActionForm
                            action={saveBankOpening}
                            submit="Save this opening"
                            pendingLabel="Saving this opening"
                            successMessage={`Opening balance saved for ${row.bankName}`}
                            resetOnSuccess={false}
                            className="flex flex-wrap items-end gap-2"
                            buttonClassName="mt-0"
                            size="sm"
                          >
                            <input type="hidden" name="id" value={row.id} />
                            <Input
                              name="openingBalance"
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={row.openingBalance || ""}
                              placeholder="Opening balance, in naira"
                              required
                              className="w-40"
                            />
                          </ActionForm>
                          <ActionForm
                            action={takeBankOffTheBooks}
                            submit="Take this bank off the books"
                            pendingLabel="Taking this bank off the books"
                            successMessage={`${row.bankName} is off the books`}
                            className="flex"
                            buttonClassName="mt-0"
                            size="sm"
                            variant="outline"
                            confirmModal={{
                              title: `Take ${row.bankName} off the books?`,
                              description: `Account ${row.accountNumber} will leave Money in and out. Who did what keeps this step.`,
                              confirmLabel: "Take this bank off the books",
                              cancelLabel: "Keep this bank",
                              tone: "danger",
                            }}
                          >
                            <input type="hidden" name="id" value={row.id} />
                          </ActionForm>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {bankAccounts.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={canSet ? 5 : 4}>
                      No bank account is on the books yet. Add GTBank, Access, or another account the shops use.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {canSet && shops.length > 0 ? (
          <div className="max-w-xl space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">Add a bank account</h3>
            <p className="text-sm text-muted-foreground">
              Type the bank name, the account number, and the money already in that account when this software started.
            </p>
            <ActionForm
              action={createBankAccount}
              submit="Save this bank account"
              pendingLabel="Saving this bank account"
              successMessage="Bank account saved"
              className="space-y-3"
            >
              {shops.length > 1 ? (
                <div className="space-y-1">
                  <Label htmlFor="bank-shop">Shop</Label>
                  <Select id="bank-shop" name="branchId" required>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <input type="hidden" name="branchId" value={shops[0]?.id || ""} />
              )}
              <div className="space-y-1">
                <Label htmlFor="bank-name">Bank name</Label>
                <Input id="bank-name" name="bankName" placeholder="GTBank, Access Bank, or OPay" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-number">Account number</Label>
                <Input id="bank-number" name="accountNumber" inputMode="numeric" placeholder="Account number" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-holder">Name on the account</Label>
                <Input id="bank-holder" name="accountName" placeholder="Abu Twins Softskills, if it is on the account" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-opening">Opening balance, in naira</Label>
                <Input
                  id="bank-opening"
                  name="openingBalance"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Money already in this account"
                  required
                />
              </div>
            </ActionForm>
          </div>
        ) : canSet ? null : (
          <p className="text-sm text-muted-foreground">
            The main admin, the CEO, the accountant, or the records checker can type opening cash and add a bank.
          </p>
        )}
      </div>
    </SectionCard>
  )
}
