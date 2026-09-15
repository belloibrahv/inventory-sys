"use client"

import * as React from "react"
import { AlertTriangle, AlertCircle, HelpCircle, Info, ShieldAlert, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DecisionTone = "danger" | "warning" | "info" | "primary"

export interface DecisionModalProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  tone?: DecisionTone
  title: string
  description?: string
  /** Bullet points outlining specific consequences/impact of this decision */
  impactItems?: string[]
  /** Primary confirm button (e.g., "Yes, Confirm", "Yes, Delete") */
  confirmLabel?: string
  /** Secondary action for 3-way decision (e.g., "No, Save Draft", "No, Reject") */
  secondaryLabel?: string
  /** Cancel label for safe dismissal (e.g., "Cancel", "Keep Editing") */
  cancelLabel?: string
  /** When true, shows loading spinner on the confirm button */
  busy?: boolean
  /** Callback when user clicks Confirm / Yes */
  onConfirm: () => void | Promise<void>
  /** Callback when user clicks Secondary / No (optional) */
  onSecondary?: () => void | Promise<void>
  /** Callback when user cancels / dismisses */
  onCancel: () => void
}

const TONE_CONFIG: Record<
  DecisionTone,
  {
    icon: typeof AlertTriangle
    iconContainerClass: string
    confirmButtonVariant: "destructive" | "default" | "outline"
    confirmButtonClass?: string
  }
> = {
  danger: {
    icon: AlertTriangle,
    iconContainerClass: "bg-destructive/10 text-destructive border-destructive/20",
    confirmButtonVariant: "destructive",
  },
  warning: {
    icon: ShieldAlert,
    iconContainerClass: "bg-warning-soft text-warning border-warning/20",
    confirmButtonVariant: "default",
    confirmButtonClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  info: {
    icon: Info,
    iconContainerClass: "bg-primary/10 text-primary border-primary/20",
    confirmButtonVariant: "default",
  },
  primary: {
    icon: HelpCircle,
    iconContainerClass: "bg-primary/10 text-primary border-primary/20",
    confirmButtonVariant: "default",
  },
}

export function DecisionModal({
  open,
  onOpenChange,
  tone = "warning",
  title,
  description,
  impactItems,
  confirmLabel = "Yes, Proceed",
  secondaryLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onSecondary,
  onCancel,
}: DecisionModalProps) {
  const config = TONE_CONFIG[tone] || TONE_CONFIG.warning
  const Icon = config.icon

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !busy) {
      onCancel()
    }
    onOpenChange?.(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="gap-3 sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
              config.iconContainerClass
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </DialogDescription>
            ) : null}
          </div>
        </DialogHeader>

        {impactItems && impactItems.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Consequences & Impact
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-foreground/90">
              {impactItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onCancel()}
            className="sm:min-w-[80px]"
          >
            {cancelLabel}
          </Button>

          {secondaryLabel && onSecondary ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                await onSecondary()
              }}
              className="sm:min-w-[90px]"
            >
              {secondaryLabel}
            </Button>
          ) : null}

          <Button
            type="button"
            variant={config.confirmButtonVariant}
            disabled={busy}
            onClick={async () => {
              await onConfirm()
            }}
            className={cn("sm:min-w-[100px]", config.confirmButtonClass)}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
