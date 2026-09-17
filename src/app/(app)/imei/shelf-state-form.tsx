"use client"

import { setImeiShelfState } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"

/** Good (sellable) vs Damaged — deliberate shelf state for phones still in the shop. */
export function ImeiShelfStateForm({
  id,
  status,
}: {
  id: string
  status: string
}) {
  const adjustable = status === "IN_STOCK" || status === "FAULTY"
  if (!adjustable) {
    return (
      <p className="text-sm text-muted-foreground">
        This phone is {status === "SOLD" ? "sold" : "not sitting as In shop or Damaged"}, so Good or Damaged cannot be set here.
      </p>
    )
  }

  const isDamaged = status === "FAULTY"

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Now: <span className="font-semibold text-foreground">{isDamaged ? "Damaged" : "Good (sellable)"}</span>.
        Pick the other state when the phone changes.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionForm
          action={setImeiShelfState}
          submit="Set Good (sellable)"
          successMessage="Phone is Good and sellable on Sell now"
          pendingLabel="Saving Good"
          variant={isDamaged ? "default" : "outline"}
          className="rounded-xl border border-border p-3"
          confirmModal={
            isDamaged
              ? {
                  title: "Set this phone to Good (sellable)?",
                  description: "It goes back on In shop stock and can be sold on Sell now.",
                  confirmLabel: "Set Good (sellable)",
                  tone: "warning",
                }
              : undefined
          }
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="shelfState" value="GOOD" />
          <p className="text-xs text-muted-foreground">In shop. Cashiers can sell it.</p>
        </ActionForm>
        <ActionForm
          action={setImeiShelfState}
          submit="Set Damaged"
          successMessage="Phone marked Damaged and taken off Sell now"
          pendingLabel="Saving Damaged"
          variant={!isDamaged ? "destructive" : "outline"}
          className="rounded-xl border border-border p-3"
          confirmModal={
            !isDamaged
              ? {
                  title: "Set this phone to Damaged?",
                  description: "It leaves sellable In shop stock. Sell now will refuse it until someone sets Good again.",
                  confirmLabel: "Set Damaged",
                  tone: "danger",
                }
              : undefined
          }
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="shelfState" value="DAMAGED" />
          <p className="text-xs text-muted-foreground">Not for sale until set back to Good.</p>
        </ActionForm>
      </div>
    </div>
  )
}
