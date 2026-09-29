"use client"

import { useEffect, useState } from "react"
import { Calculator, X } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useUI } from "@/store/ui"

type Op = "+" | "-" | "×" | "÷"

function apply(left: number, op: Op, right: number) {
  if (op === "+") return left + right
  if (op === "-") return left - right
  if (op === "×") return left * right
  return right === 0 ? Number.NaN : left / right
}

function show(value: number) {
  if (!Number.isFinite(value)) return "You cannot divide by 0"
  const text = value.toFixed(6).replace(/\.?0+$/, "")
  return text === "-0" ? "0" : text
}

/**
 * The shop calculator opens from the top bar. It used to be a round button
 * floating over the bottom corner, where it covered table columns and the
 * till's pay bar.
 */
export function ShopCalculator() {
  const open = useUI((state) => state.calculatorOpen)
  const setOpen = useUI((state) => state.setCalculatorOpen)
  const [display, setDisplay] = useState("0")
  const [stored, setStored] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [fresh, setFresh] = useState(true)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return
      const key = event.key
      if (key >= "0" && key <= "9") pressDigit(key)
      else if (key === ".") pressDot()
      else if (key === "+" || key === "-" || key === "*" || key === "/") {
        pressOp(key === "*" ? "×" : key === "/" ? "÷" : key)
      } else if (key === "Enter" || key === "=") {
        event.preventDefault()
        pressEquals()
      } else if (key === "Backspace") pressBack()
      else if (key === "Escape") setOpen(false)
      else if (key === "c" || key === "C") pressClear()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, display, stored, op, fresh])

  function pressDigit(digit: string) {
    setDisplay((current) => {
      if (fresh || current === "0" || current === "You cannot divide by 0") return digit
      if (current.replace("-", "").replace(".", "").length >= 12) return current
      return current + digit
    })
    setFresh(false)
  }

  function pressDot() {
    setDisplay((current) => {
      if (fresh || current === "You cannot divide by 0") return "0."
      if (current.includes(".")) return current
      return `${current}.`
    })
    setFresh(false)
  }

  function pressClear() {
    setDisplay("0")
    setStored(null)
    setOp(null)
    setFresh(true)
  }

  function pressBack() {
    if (fresh) return
    setDisplay((current) => {
      const next = current.slice(0, -1)
      return next === "" || next === "-" ? "0" : next
    })
  }

  function pressOp(next: Op) {
    const value = Number(display)
    if (!Number.isFinite(value)) {
      pressClear()
      return
    }
    if (stored != null && op && !fresh) {
      const result = apply(stored, op, value)
      setStored(result)
      setDisplay(show(result))
    } else {
      setStored(value)
    }
    setOp(next)
    setFresh(true)
  }

  function pressEquals() {
    const value = Number(display)
    if (stored == null || !op || !Number.isFinite(value)) return
    const result = apply(stored, op, value)
    setDisplay(show(result))
    setStored(null)
    setOp(null)
    setFresh(true)
  }

  function pressPercent() {
    const value = Number(display)
    if (!Number.isFinite(value)) return
    setDisplay(show(value / 100))
    setFresh(true)
  }

  const naira = Number(display)
  const keys = [
    ["C", pressClear],
    ["⌫", pressBack],
    ["%", pressPercent],
    ["÷", () => pressOp("÷")],
    ["7", () => pressDigit("7")],
    ["8", () => pressDigit("8")],
    ["9", () => pressDigit("9")],
    ["×", () => pressOp("×")],
    ["4", () => pressDigit("4")],
    ["5", () => pressDigit("5")],
    ["6", () => pressDigit("6")],
    ["-", () => pressOp("-")],
    ["1", () => pressDigit("1")],
    ["2", () => pressDigit("2")],
    ["3", () => pressDigit("3")],
    ["+", () => pressOp("+")],
    ["0", () => pressDigit("0")],
    [".", pressDot],
    ["=", pressEquals],
  ] as const

  return (
    <div className="shop-calculator">
      {open ? (
        <div className="motion-pop fixed right-3 top-16 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 shadow-xl sm:right-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calculator className="h-3.5 w-3.5" /> Shop calculator · it stays on this phone only
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close calculator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 break-all text-right text-3xl font-semibold tabular-nums">{display}</p>
          <p className="min-h-5 text-right text-xs text-muted-foreground">
            {Number.isFinite(naira) ? formatCurrency(naira) : ""}
            {op && stored != null ? ` · ${show(stored)} ${op}` : ""}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {keys.map(([label, action]) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={`min-h-12 rounded-xl text-base font-semibold ${
                  label === "="
                    ? "col-span-2 bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
