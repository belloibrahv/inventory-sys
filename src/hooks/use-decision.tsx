"use client"

import * as React from "react"
import { DecisionModal, type DecisionTone } from "@/components/ui/decision-modal"

export interface DecisionOptions {
  title: string
  description?: string
  tone?: DecisionTone
  impactItems?: string[]
  confirmLabel?: string
  secondaryLabel?: string
  cancelLabel?: string
}

export type DecisionResult = "confirm" | "secondary" | "cancel"

interface DecisionContextType {
  confirm: (options: Omit<DecisionOptions, "secondaryLabel">) => Promise<boolean>
  decide: (options: DecisionOptions) => Promise<DecisionResult>
}

const DecisionContext = React.createContext<DecisionContextType | null>(null)

export function DecisionProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = React.useState<{
    isOpen: boolean
    options: DecisionOptions
    resolve: (val: DecisionResult) => void
  } | null>(null)

  const decide = React.useCallback((options: DecisionOptions): Promise<DecisionResult> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        options,
        resolve,
      })
    })
  }, [])

  const confirm = React.useCallback(
    async (options: Omit<DecisionOptions, "secondaryLabel">): Promise<boolean> => {
      const result = await decide(options)
      return result === "confirm"
    },
    [decide]
  )

  const handleConfirm = React.useCallback(() => {
    modalState?.resolve("confirm")
    setModalState(null)
  }, [modalState])

  const handleSecondary = React.useCallback(() => {
    modalState?.resolve("secondary")
    setModalState(null)
  }, [modalState])

  const handleCancel = React.useCallback(() => {
    modalState?.resolve("cancel")
    setModalState(null)
  }, [modalState])

  return (
    <DecisionContext.Provider value={{ confirm, decide }}>
      {children}
      {modalState?.isOpen ? (
        <DecisionModal
          open={modalState.isOpen}
          title={modalState.options.title}
          description={modalState.options.description}
          tone={modalState.options.tone}
          impactItems={modalState.options.impactItems}
          confirmLabel={modalState.options.confirmLabel}
          secondaryLabel={modalState.options.secondaryLabel}
          cancelLabel={modalState.options.cancelLabel}
          onConfirm={handleConfirm}
          onSecondary={modalState.options.secondaryLabel ? handleSecondary : undefined}
          onCancel={handleCancel}
        />
      ) : null}
    </DecisionContext.Provider>
  )
}

export function useDecision() {
  const context = React.useContext(DecisionContext)
  if (!context) {
    throw new Error("useDecision must be used within a DecisionProvider")
  }
  return context
}
