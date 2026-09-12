"use client"

import { updateImeiCondition } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"
import { PhotoField } from "@/components/photo-field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

export function ImeiConditionForm({
  id,
  cosmeticGrade,
  batteryHealth,
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
        <option value="A">A. Looks like new</option>
        <option value="B">B. Small marks</option>
        <option value="C">C. You can see it has been used</option>
        <option value="D">D. Badly used or cracked</option>
      </Select>
      <Input name="batteryHealth" type="number" min={1} max={100} defaultValue={batteryHealth ?? ""} placeholder="Battery health %" />
      <Input name="conditionNotes" defaultValue={conditionNotes ?? ""} placeholder="Condition notes" />
      <PhotoField defaultValue={photoData} />
    </ActionForm>
  )
}
