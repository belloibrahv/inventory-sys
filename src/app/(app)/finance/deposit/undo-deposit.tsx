"use client"

import { useState } from "react"
import { undoCashDeposit } from "@/app/actions/cash-deposits"
import { ActionForm } from "@/components/action-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Undo a deposit typed by mistake. The CEO or main admin says why. */
export function UndoDeposit({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Undo
      </Button>
    )
  }
  return (
    <ActionForm
      action={undoCashDeposit}
      submit="Undo it"
      pendingLabel="Undoing"
      successMessage={`${label} undone. The cash is back in the till.`}
      className="flex flex-wrap items-center justify-end gap-2"
      buttonClassName="mt-0"
      size="sm"
      confirmModal={{
        title: "Undo this cash deposit?",
        description: "The cash is counted in the till again and taken off the bank. The record stays, marked undone.",
        tone: "danger",
        confirmLabel: "Yes, undo it",
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="Why? e.g. typed twice" required className="h-8 w-44" autoFocus />
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Keep
      </Button>
    </ActionForm>
  )
}
