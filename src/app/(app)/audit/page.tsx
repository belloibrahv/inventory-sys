import { getAuditMonitor } from "@/app/actions/audit"
import { getBooksCheck } from "@/app/actions/books-check"
import { AuditExportButton } from "@/app/(app)/audit/export-button"
import { AuditLogRows } from "@/app/(app)/audit/log-rows"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { statusLabel } from "@/lib/status"

const ACTIONS = ["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "EXPORT", "IMPORT", "DENIED", "VIEW"]

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; risk?: string; userId?: string; result?: string; from?: string; to?: string; views?: string }>
}) {
  const filters = await searchParams
  const [data, books] = await Promise.all([getAuditMonitor(filters), getBooksCheck()])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who did what"
        description="Every sign-in, sale, stock move, money change, export, and blocked screen is kept. Rows cannot be edited. Super Admin, CEO, and Records checker get an alert when something looks wrong."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/audit/books" className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm">
              Check the books
            </a>
            <AuditExportButton filters={filters} />
          </div>
        }
      />

      <div className={`rounded-xl px-4 py-3 text-sm ${data.integrity.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" : "bg-rose-50 text-rose-900"}`}>
        {data.integrity.ok
          ? `Trail is sound. ${data.integrity.checked} sealed rows checked. Nobody can quietly rewrite a past action.`
          : "A sealed row no longer matches. Treat this as a break-in on the trail and keep a backup."}
      </div>
      {books ? (
        <a
          href="/audit/books"
          className={`block rounded-xl px-4 py-3 text-sm ${books.openCount ? "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" : "surface-card"}`}
        >
          <p className="font-medium">Owner and records checker</p>
          <p className="mt-1">{books.verdict}</p>
          <p className="mt-1 text-primary">Open the working paper</p>
        </a>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <WatchCard href="/audit?result=failed&action=LOGIN" label="Failed sign-ins (24h)" value={data.watch.failedLogins} hot={data.watch.failedLogins > 0} />
        <WatchCard href="/audit?risk=HIGH" label="High risk (24h)" value={data.watch.highRisk} hot={data.watch.highRisk > 0} />
        <WatchCard href="/audit?action=DENIED" label="Blocked screens (24h)" value={data.watch.denied} hot={data.watch.denied > 0} />
        <WatchCard href="/audit?action=EXPORT" label="Downloads (7 days)" value={data.watch.exports} hot={data.watch.exports > 0} />
        <WatchCard href="/audit" label="Night activity (7 days)" value={data.watch.afterHours} hot={data.watch.afterHours > 3} />
        <WatchCard href="/audit?action=VIEW&views=1" label="Watched screens (24h)" value={data.watch.screens} />
      </div>

      <form className="surface-card grid gap-2 p-4 md:grid-cols-[1fr_160px_140px_180px_140px_auto] md:items-end">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Search</span>
          <Input name="q" defaultValue={filters.q} placeholder="Name, email, IMEI, or invoice" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Action</span>
          <Select name="action" defaultValue={filters.action ?? ""}>
            <option value="">All actions</option>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>{statusLabel(action)}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Risk</span>
          <Select name="risk" defaultValue={filters.risk ?? ""}>
            <option value="">Any</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Staff</span>
          <Select name="userId" defaultValue={filters.userId ?? ""}>
            <option value="">Anyone</option>
            {data.staff.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Result</span>
          <Select name="result" defaultValue={filters.result ?? ""}>
            <option value="">All</option>
            <option value="ok">Worked</option>
            <option value="failed">Failed</option>
          </Select>
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground">
          Filter
        </button>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">From</span>
          <Input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">To</span>
          <Input name="to" type="date" defaultValue={filters.to} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="views" value="1" defaultChecked={filters.views === "1"} />
          Include screen opens
        </label>
      </form>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="surface-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold">Activity</h3>
            <p className="text-xs text-muted-foreground">Tap a row for the device, the page, and what changed in shop words.</p>
          </div>
          <AuditLogRows
            logs={data.logs.map((log) => ({
              ...log,
              when: log.when,
            }))}
          />
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Busiest staff this week</h3>
          <div className="space-y-3 text-sm">
            {data.activity.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3">
                <span>{row.name}</span>
                <span className="text-muted-foreground">
                  {row.count} actions{row.high ? ` · ${row.high} high` : ""}
                </span>
              </div>
            ))}
            {data.activity.length === 0 ? <p className="text-muted-foreground">No staff actions this week yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function WatchCard({ href, label, value, hot }: { href: string; label: string; value: number; hot?: boolean }) {
  return (
    <a href={href} className={`surface-card p-4 ${hot ? "border-rose-300" : ""}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </a>
  )
}
