import { BrandPageBusy } from "@/components/brand-busy-overlay"

export default function LoginLoading() {
  return (
    <BrandPageBusy
      className="min-h-screen rounded-none"
      title="Opening Sign in"
      detail="Getting the Abu Twins shop system ready."
    />
  )
}
