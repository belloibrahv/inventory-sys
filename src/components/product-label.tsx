import { productSpecLine, type ProductSpecSource } from "@/lib/product-specs"
import { cn } from "@/lib/utils"

/**
 * An item's name with what sets it apart (storage, RAM, colour, condition)
 * faintly underneath. Works on the server and in the browser.
 */
export function ProductLabel({
  product,
  className,
  nameClassName,
  extra,
}: {
  product: { name: string } & ProductSpecSource
  className?: string
  nameClassName?: string
  /** Anything unit-specific to add after the item's specs, e.g. "Battery 87%". */
  extra?: string | null
}) {
  const line = [productSpecLine(product), extra].filter(Boolean).join(" · ")
  return (
    <span className={cn("block min-w-0", className)}>
      <span className={cn("block font-medium", nameClassName)}>{product.name}</span>
      {line ? <span className="block text-xs font-normal text-muted-foreground">{line}</span> : null}
    </span>
  )
}
