"use client"

import { updateImeiCondition } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"
import { PhotoField } from "@/components/photo-field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { PHONE_LOOK_OPTIONS } from "@/lib/phone-look"

export function ImeiConditionForm({
  id,
  cosmeticGrade,
  conditionNotes,
  photoData,
}: {
  id: string
  cosmeticGrade?: string | null
  batteryHealth?: number | null
  conditionNotes?: string | null
  photoData?: string | null
}) {
  return (
    <ActionForm action={updateImeiCondition} submit="Save condition" className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Select name="cosmeticGrade" defaultValue={cosmeticGrade ?? ""}>
        <option value="">How the phone looks</option>
        {PHONE_LOOK_OPTIONS.map((row) => (
          <option key={row.value} value={row.value}>{row.label}</option>
        ))}
      </Select>
      <Input name="conditionNotes" defaultValue={conditionNotes ?? ""} placeholder="Anything else about its condition" />
      <PhotoField defaultValue={photoData} />
    </ActionForm>
  )
}
