"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

/**
 * Slice a filtered list into pages. When the filter changes (`resetKey`), we
 * jump back to page 1 so the staff never land on an empty page after a search.
 */
export function usePagedRows<T>(rows: T[], resetKey: string | number, pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)

  useEffect(() => {
    setPage(1)
  }, [resetKey, size])

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(page, pageCount)
  const start = total === 0 ? 0 : (safePage - 1) * size
  const end = Math.min(start + size, total)
  const pageRows = useMemo(() => rows.slice(start, end), [rows, start, end])

  return {
    page: safePage,
    setPage,
    pageSize: size,
    setPageSize: setSize,
    pageCount,
    total,
    start: total === 0 ? 0 : start + 1,
    end,
    pageRows,
  }
}

/** Footer under every long table: “Showing 1–25 of 410” plus Prev / Next. */
export function TablePager({
  page,
  pageCount,
  pageSize,
  total,
  start,
  end,
  onPageChange,
  onPageSizeChange,
  className,
  noun = "rows",
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  start: number
  end: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  className?: string
  /** Plain word for what the rows are, e.g. "items", "customers", "bills". */
  noun?: string
}) {
  if (total === 0) return null

  const summary =
    total === 1
      ? `1 ${noun.replace(/s$/, "")}`
      : `Showing ${start}–${end} of ${total} ${noun}`

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Rows per page</span>
            <Select
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 w-[4.5rem]"
              aria-label="How many rows to show on each page"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="min-w-[5.5rem] px-2 text-center text-sm tabular-nums text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
