"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { can, canUndo } from "@/lib/permissions"
import { canReachBranch, resolveWritableShopId, viewBranchFilter } from "@/lib/branch-scope"
import { assertCashAvailable } from "@/lib/shop-cash"
import { watBounds, watDayKey } from "@/lib/lagos-day"
import { writeAudit } from "@/lib/audit"
import { generateDocNumber, money } from "@/lib/utils"

/**
 * Move cash to bank: cash taken out of a shop's till and paid into one of our
 * bank accounts. Cash in the till goes down and that bank goes up by the same
 * amount. It is our own money changing place, so it is never an expense, a
 * sale, or profit, and Balance the till (cash taken in a day) does not move.
 */

function revalidateDepositViews() {
  revalidatePath("/finance")
  revalidatePath("/finance/deposit")
  revalidatePath("/expenses/new")
  revalidatePath("/audit")
}

export type CashDepositRow = {
  id: string
  depositNumber: string
  shop: string
  shopCode: string
  bank: string
  amount: number
  slipNumber: string | null
  note: string | null
  depositedAt: string
  by: string
  undoneAt: string | null
  undoneReason: string | null
}

/** Deposits out of, or into, the shops this person can see. Newest first. */
export async function getCashDeposits(): Promise<CashDepositRow[]> {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance"))) return []
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.cashDeposit.findMany({
    where: branchId ? { OR: [{ branchId }, { bankAccount: { branchId } }] } : undefined,
    include: {
      branch: { select: { name: true, code: true } },
      bankAccount: { select: { bankName: true, accountNumber: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { depositedAt: "desc" },
    take: 200,
  })
  return rows.map((row) => ({
    id: row.id,
    depositNumber: row.depositNumber,
    shop: row.branch.name,
    shopCode: row.branch.code,
    bank: `${row.bankAccount.bankName} ${row.bankAccount.accountNumber}`,
    amount: money(row.amount),
    slipNumber: row.slipNumber,
    note: row.note,
    depositedAt: row.depositedAt.toISOString(),
    by: row.createdBy.name || row.createdBy.email,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    undoneReason: row.undoneReason,
  }))
}

export async function createCashDeposit(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.deposit"))) {
    return { error: "You are not allowed to move cash to the bank. Ask the main admin." }
  }
  const shopGate = await resolveWritableShopId(user, String(formData.get("branchId") || user.branchId || ""))
  if ("error" in shopGate) return { error: shopGate.error }
  const branchId = shopGate.shopId

  const amount = Math.round(Number(formData.get("amount") || 0) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Type the amount of cash paid into the bank." }

  const bankAccountId = String(formData.get("bankAccountId") || "")
  const bank = bankAccountId
    ? await prisma.bankAccount.findFirst({ where: { id: bankAccountId, isActive: true } })
    : null
  if (!bank) return { error: "Pick the bank account the cash was paid into." }

  // The day it went into the bank. Today means now; an earlier day is dated
  // midday Lagos time so it sits inside that day on every screen.
  const today = watDayKey()
  const day = String(formData.get("depositedOn") || today).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick the day the cash went into the bank." }
  if (day > today) return { error: "The deposit day cannot be in the future." }
  const depositedAt =
    day === today ? new Date() : new Date(watBounds(day).start.getTime() + 12 * 60 * 60 * 1000)

  const slipNumber = String(formData.get("slipNumber") || "").trim().slice(0, 80) || null
  const note = String(formData.get("note") || "").trim().slice(0, 300) || null

  const cashGate = await assertCashAvailable(branchId, amount)
  if (!cashGate.ok) return { error: cashGate.error }

  const deposit = await prisma.cashDeposit.create({
    data: {
      depositNumber: generateDocNumber("DEP"),
      branchId,
      bankAccountId: bank.id,
      amount: amount.toFixed(2),
      slipNumber,
      note,
      depositedAt,
      createdById: user.id,
    },
  })
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entityType: "CashDeposit",
    entityId: deposit.depositNumber,
    newValue: JSON.stringify({
      amount,
      bank: `${bank.bankName} ${bank.accountNumber}`,
      slipNumber,
      depositedOn: day,
    }),
    branchId,
  })
  revalidateDepositViews()
  return { success: true }
}

/**
 * Take back a deposit typed by mistake: the cash is counted in the till again
 * and leaves the bank. The row stays, marked undone, with who and why.
 */
export async function undoCashDeposit(formData: FormData) {
  const user = await requireUser()
  if (!(await canUndo(user.role))) {
    return { error: "Only the CEO or the main admin can undo a cash deposit." }
  }
  const id = String(formData.get("id") || "")
  const reason = String(formData.get("reason") || "").trim().slice(0, 300)
  if (!reason) return { error: "Say why this deposit is being undone." }
  const row = await prisma.cashDeposit.findUnique({ where: { id } })
  if (!row) return { error: "We could not find that deposit." }
  if (row.undoneAt) return { error: "This deposit was already undone." }
  if (!(await canReachBranch(user, row.branchId))) return { error: "That deposit belongs to another shop." }

  const updated = await prisma.cashDeposit.updateMany({
    where: { id, undoneAt: null },
    data: { undoneAt: new Date(), undoneById: user.id, undoneReason: reason },
  })
  if (updated.count === 0) return { error: "This deposit was already undone." }
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entityType: "CashDeposit",
    entityId: row.depositNumber,
    oldValue: JSON.stringify({ amount: money(row.amount), undone: false }),
    newValue: JSON.stringify({ undone: true, reason }),
    branchId: row.branchId,
    risk: "HIGH",
  })
  revalidateDepositViews()
  return { success: true }
}
