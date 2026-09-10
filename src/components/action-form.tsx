"use client"

import type { ReactNode } from "react"
import { useRef } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The submit button for a server action.
 *
 * It has to be its own component because useFormStatus only reports on the form
 * above it. While the shop is waiting it says so and refuses further presses,
 * which is what stops a cashier on slow mobile data from tapping Complete sale
 * three times because nothing looked like it happened.
 */
export function SubmitButton({
  children = "Save",
  pendingLabel,
  variant = "default",
  size = "default",
  className,
  disabled,
}: {
  children?: ReactNode
  pendingLabel?: string
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {pendingLabel ?? "Working..."}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function ActionForm({
  action,
  children,
  submit = "Save",
  pendingLabel,
  successMessage = "Saved",
  resetOnSuccess = true,
  className,
  buttonClassName = "mt-4",
  variant = "default",
  size = "default",
}: {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean; redirectTo?: string } | void>
  children: ReactNode
  submit?: string
  /** What the button says while the shop waits, e.g. "Completing sale...". */
  pendingLabel?: string
  /** What the toast says on success. Say what happened, not just "Saved". */
  successMessage?: string
  resetOnSuccess?: boolean
  className?: string
  buttonClassName?: string
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
}) {
  const router = useRouter()
  const ref = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={ref}
      className={className}
      action={async (formData) => {
        let result
        try {
          result = await action(formData)
        } catch (err) {
          console.error("ActionForm submission failed:", err)
          // A dropped connection used to leave the button spinning with no word
          // to the person standing at the counter.
          toast.error("That did not reach the shop system. Check your connection and try once more.")
          return
        }
        if (result && "error" in result && result.error) {
          toast.error(result.error)
          return
        }
        toast.success(successMessage)
        if (result && "redirectTo" in result && result.redirectTo) {
          router.push(result.redirectTo)
          return
        }
        if (resetOnSuccess) ref.current?.reset()
        router.refresh()
      }}
    >
      {children}
      <SubmitButton
        variant={variant}
        size={size}
        className={cn(buttonClassName)}
        pendingLabel={pendingLabel}
      >
        {submit}
      </SubmitButton>
    </form>
  )
}
