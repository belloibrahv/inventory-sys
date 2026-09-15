/**
 * How the phone looks when it is booked into the shop.
 * These are the shop words cashiers and goods intake use every day.
 */
export const PHONE_LOOK_OPTIONS = [
  { value: "BRAND_NEW", label: "Brand new" },
  { value: "UK", label: "Uk" },
  { value: "OPENBOX", label: "OPENBOX" },
  { value: "FAULTY", label: "Faulty" },
  { value: "NON_ACTIVE", label: "Non Active" },
] as const

export type PhoneLookValue = (typeof PHONE_LOOK_OPTIONS)[number]["value"]

export function phoneLookLabel(value?: string | null) {
  if (!value) return ""
  const match = PHONE_LOOK_OPTIONS.find((row) => row.value === value)
  return match?.label ?? value
}
