import { BrandPageBusy } from "@/components/brand-busy-overlay"

/**
 * Shown while a shop screen is being put together.
 *
 * Every screen here reads from the database on the server, so without this the
 * old screen sat frozen and staff could not tell whether their tap had landed.
 */
export default function Loading() {
  return (
    <BrandPageBusy
      title="Opening this page"
      detail="Getting the latest shop numbers ready for your job."
    />
  )
}
