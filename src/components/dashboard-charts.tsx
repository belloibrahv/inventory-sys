"use client"

import { formatCurrency } from "@/lib/utils"
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

export function SalesPurchaseChart({
  data,
}: {
  data: Array<{ month: string; sales: number; purchases: number; target?: number }>
}) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
          <Bar dataKey="sales" fill="url(#salesGrad)" radius={[8, 8, 0, 0]} />
          <Bar dataKey="purchases" fill="url(#buyGrad)" radius={[8, 8, 0, 0]} />
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B6BFF" />
              <stop offset="100%" stopColor="#001BCE" />
            </linearGradient>
            <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3EC845" />
              <stop offset="100%" stopColor="#18C020" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
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
