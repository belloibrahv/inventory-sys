import type { IMEIStatus } from "@prisma/client"

/** Life stages on Phone numbers (IMEI). Each stage is a clickable filter. */
export const IMEI_LIFE = [
  { key: "receive", label: "Receive phone", hint: "Still coming in", statuses: ["INCOMING"] as IMEIStatus[] },
  { key: "shop", label: "In shop", hint: "Ready to sell", statuses: ["IN_STOCK"] as IMEIStatus[] },
  { key: "sell", label: "Sell or move", hint: "Sold, swapped, or sent", statuses: ["SOLD", "TRANSFERRED", "SWAPPED"] as IMEIStatus[] },
  {
    key: "return",
    label: "Return or repair",
    hint: "Back from buyer or in repair",
    statuses: ["RETURNED", "RETURNED_TO_SUPPLIER", "REPAIRED", "FAULTY"] as IMEIStatus[],
  },
] as const
