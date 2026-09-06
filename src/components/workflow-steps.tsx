import { cn } from "@/lib/utils"

export function WorkflowSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo"
        return (
          <li
            key={step}
            className={cn(
              "rounded-2xl border px-3 py-2 text-xs font-medium",
              state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200",
              state === "active" && "border-primary/30 bg-primary/10 text-primary",
              state === "todo" && "border-border text-muted-foreground"
            )}
          >
            <span className="mr-1 text-[10px] uppercase tracking-wider opacity-70">{index + 1}</span>
            {step}
          </li>
        )
      })}
    </ol>
  )
}
