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
        <option value="">Cosmetic grade</option>
        <option value="A">A. Like new</option>
        <option value="B">B. Light marks</option>
        <option value="C">C. Visible wear</option>
        <option value="D">D. Heavy wear / crack</option>
      </Select>
      <Input name="batteryHealth" type="number" min={1} max={100} defaultValue={batteryHealth ?? ""} placeholder="Battery health %" />
      <Input name="conditionNotes" defaultValue={conditionNotes ?? ""} placeholder="Condition notes" />
      <PhotoField defaultValue={photoData} />
    </ActionForm>
  )
}
