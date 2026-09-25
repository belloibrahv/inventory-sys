"use client"

import { useState } from "react"
import { updateUnitIdentity } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { UNIT_IDENTITY_OPTIONS, type UnitIdentityKind } from "@/lib/unit-identity"

export function UnitIdentityForm({
  id,
  kind,
  imei1,
  imei2,
  serialNumber,
}: {
  id: string
  kind: UnitIdentityKind
  imei1: string
  imei2: string | null
  serialNumber: string | null
}) {
  const [nextKind, setNextKind] = useState<UnitIdentityKind>(kind)

  return (
    <ActionForm
      action={updateUnitIdentity}
      submit="Save the number"
      successMessage="The unit's number was saved"
      confirmModal={{
        title: "Change this unit's number?",
        description: "The till, returns, transfers and warranty will find this unit by the new number from now on. Who did what keeps the old one.",
        confirmLabel: "Change the number",
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">This unit is known by</span>
        <Select
          name="identityKind"
          value={nextKind}
          onChange={(event) => setNextKind(event.target.value === "SERIAL" ? "SERIAL" : "IMEI")}
        >
          {UNIT_IDENTITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">
          {nextKind === "SERIAL" ? "Serial number" : "IMEI 1"}
        </span>
        <Input name="imei1" defaultValue={imei1} required className="font-mono" />
      </label>
      {nextKind === "IMEI" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">IMEI 2 (optional)</span>
            <Input name="imei2" defaultValue={imei2 ?? ""} className="font-mono" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Serial (optional)</span>
            <Input
              name="serialNumber"
              defaultValue={serialNumber && serialNumber !== imei1 ? serialNumber : ""}
              className="font-mono"
            />
          </label>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted-foreground">Why</span>
        <Input name="reason" required placeholder="Typed wrong at intake, or it is a tablet with a serial only" />
      </label>
    </ActionForm>
  )
}
