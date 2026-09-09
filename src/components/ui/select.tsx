import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * What to show when there is nothing to choose from. Say why the list is
   * empty and what to do about it, e.g. "No phones In shop here yet. Receive
   * goods first."
   */
  emptyLabel?: string
}

/**
 * A dropdown that never renders as a blank box.
 *
 * A shop that has not received goods yet, or has no customers on its books,
 * gives a list with nothing in it. That used to show as an empty white
 * rectangle: staff could not tell whether the shop system was still loading,
 * whether it was broken, or whether there was genuinely nothing to pick.
 *
 * When there is nothing to choose, this shows a greyed line saying so. The line
 * carries no value, so a required field still refuses to be submitted and the
 * browser points at it.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, emptyLabel, ...props }, ref) => {
    const isEmpty = React.Children.toArray(children).length === 0
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-10 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isEmpty && "text-muted-foreground",
          className
        )}
        {...props}
      >
        {isEmpty ? (
          <option value="" disabled>
            {emptyLabel ?? "Nothing to choose here yet"}
          </option>
        ) : (
          children
        )}
      </select>
    )
  }
)
Select.displayName = "Select"

export { Select }
