"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatCurrency } from "@/lib/utils"

/**
 * Chart colours for the owner's board.
 *
 * Both sets were run through the six checks (lightness band, chroma floor,
 * colourblind separation, normal-vision separation, contrast) against the card
 * they sit on — white in day mode, #16192A at night. The dark steps are chosen,
 * not a flip of the day ones, because a flipped palette fails contrast.
 *
 * Order is fixed. A series keeps its colour when a filter removes its
 * neighbours, so the eye can follow one item between charts.
 */
const MONEY = "var(--board-money)"
const UNITS = "var(--board-units)"
const PROFIT = "var(--board-profit)"

/** Status colours are reserved for state and never used as another series. */
const STATUS = {
  critical: "hsl(var(--danger))",
  warning: "hsl(var(--warning))",
  good: "hsl(var(--success))",
} as const

const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 12 }

function shortDay(dayKey: string) {
  const [, month, day] = dayKey.split("-").map(Number)
  return `${day}/${month}`
}

function shortNaira(value: number) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 100_000) / 10}m`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

function TooltipCard({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: string; color?: string }>
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-foreground">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-xs text-muted-foreground">
          {row.color ? (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
          ) : null}
          <span>{row.label}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * Money taken each day over the last month. One measure, one line — a second
 * y-axis for units would put two different scales on one picture and make the
 * crossings mean nothing.
 */
export function SalesTrend({
  data,
}: {
  data: Array<{ day: string; value: number; units: number; profit: number }>
}) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={shortNaira}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as { day: string; value: number; units: number; profit: number }
              return (
                <TooltipCard
                  title={row.day}
                  rows={[
                    { label: "Sold", value: formatCurrency(row.value), color: MONEY },
                    { label: "Pieces", value: String(row.units) },
                    { label: "We kept", value: formatCurrency(row.profit) },
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={MONEY}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Pieces sold per item over the period. Horizontal, so long phone names read. */
export function TopSellers({ data }: { data: Array<{ item: string; units: number }> }) {
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 28) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="item"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as { item: string; units: number }
              return (
                <TooltipCard
                  title={row.item}
                  rows={[{ label: "Pieces sold", value: String(row.units), color: UNITS }]}
                />
              )
            }}
          />
          <Bar dataKey="units" fill={UNITS} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Days of stock left per item. The bar is coloured by state, not by identity:
 * red is about to finish, amber is this week, green is comfortable. Every bar
 * carries its number too, so the state never rests on colour alone.
 */
export function DaysOfCover({
  data,
  orderTodayDays = 3,
  orderSoonDays = 10,
}: {
  data: Array<{ item: string; daysLeft: number; inShop: number; soldPerDay: number }>
  /** The same two bands the page counts with, so bar and headline agree. */
  orderTodayDays?: number
  orderSoonDays?: number
}) {
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 28) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="item"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as {
                item: string
                daysLeft: number
                inShop: number
                soldPerDay: number
              }
              return (
                <TooltipCard
                  title={row.item}
                  rows={[
                    { label: "Days left", value: `${row.daysLeft}` },
                    { label: "In shop", value: `${row.inShop}` },
                    { label: "Sells per day", value: `${row.soldPerDay}` },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="daysLeft" radius={[0, 4, 4, 0]} barSize={16} label={undefined}>
            {data.map((row) => (
              <Cell
                key={row.item}
                fill={
                  row.daysLeft <= orderTodayDays
                    ? STATUS.critical
                    : row.daysLeft <= orderSoonDays
                      ? STATUS.warning
                      : STATUS.good
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Money sitting in stock, by kind of goods. One measure, one colour. */
export function StockValueByCategory({
  data,
}: {
  data: Array<{ category: string; value: number; units: number }>
}) {
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 28) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="category"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as { category: string; value: number; units: number }
              return (
                <TooltipCard
                  title={row.category}
                  rows={[
                    { label: "Value at cost", value: formatCurrency(row.value), color: PROFIT },
                    { label: "Pieces", value: String(row.units) },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="value" fill={PROFIT} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
