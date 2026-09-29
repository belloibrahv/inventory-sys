"use client"

import { formatCurrency, formatCurrencyShort } from "@/lib/utils"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const pieColors = ["#001BCE", "#18C020", "#3B6BFF", "#7C8CFF", "#0E8A18", "#F59E0B"]

/**
 * Sales against goods bought, month by month. The current month is drawn in
 * full colour and earlier months faded, so the eye lands on the latest figure.
 * Blue is sales (the brand), grey is goods bought; green stays for "good".
 */
export function SalesPurchaseChart({
  data,
}: {
  data: Array<{ month: string; sales: number; purchases: number; target?: number }>
}) {
  const last = data.length - 1
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Sold
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/60" /> Bought from suppliers
        </span>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => formatCurrencyShort(Number(value))}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
              formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === "sales" ? "Sold" : "Bought"]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Bar dataKey="sales" radius={[6, 6, 0, 0]} animationDuration={500} animationEasing="ease-out">
              {data.map((row, index) => (
                <Cell key={row.month} fill="hsl(var(--primary))" fillOpacity={index === last ? 1 : 0.45} />
              ))}
            </Bar>
            <Bar dataKey="purchases" radius={[6, 6, 0, 0]} animationDuration={500} animationEasing="ease-out">
              {data.map((row, index) => (
                <Cell key={row.month} fill="hsl(var(--muted-foreground))" fillOpacity={index === last ? 0.75 : 0.3} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function DevicePie({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[index % pieColors.length] }} />
            {item.name}
            <span className="text-muted-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </>
  )
}
