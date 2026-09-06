"use client"

import type { ReactNode } from "react"
import { useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function ActionForm({
  action,
  children,
  submit = "Save",
  className,
  buttonClassName = "mt-4",
  variant = "default",
  size = "default",
}: {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean; redirectTo?: string } | void>
  children: ReactNode
  submit?: string
  className?: string
  buttonClassName?: string
  variant?: "default" | "outline"
  size?: "default" | "sm"
}) {
  const router = useRouter()
  const ref = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={ref}
      className={className}
      action={async (formData) => {
        const result = await action(formData)
        if (result && "error" in result && result.error) {
          toast.error(result.error)
          return
        }
        toast.success("Saved")
        ref.current?.reset()
        if (result && "redirectTo" in result && result.redirectTo) {
          router.push(result.redirectTo)
          return
        }
        router.refresh()
      }}
    >
      {children}
      <Button type="submit" variant={variant} size={size} className={buttonClassName}>{submit}</Button>
    </form>
  )
}
