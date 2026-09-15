import type { RoleManual } from "@/lib/manual"
import { DocumentLetterhead, DocumentPaperFooter } from "@/components/document-letterhead"
import { letterheadFromCompany, type PaperCompany } from "@/lib/letterhead"
import { formatLagosStamp } from "@/lib/lagos-day"

export function ManualDocument({
  data,
  company,
  preparedBy,
  statementRef,
  preparedAt,
}: {
  data: RoleManual
  company: PaperCompany
  preparedBy: string
  statementRef: string
  preparedAt: string
}) {
  let lastGroup = ""
  const brand = letterheadFromCompany(company)

  return (
    <section className="manual-pack mx-auto w-full max-w-[210mm] overflow-hidden bg-white text-slate-900 shadow-[0_18px_50px_rgba(0,27,206,0.12)] print:shadow-none">
      <DocumentLetterhead
        brand={brand}
        documentKind="How to use this system"
        documentTitle={data.roleLabel}
        meta={[statementRef, `Lagos time ${formatLagosStamp(new Date(preparedAt))}`]}
      >
        <div className="mt-5 grid gap-3 border-t border-white/15 pt-4 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">This book is for</p>
            <p className="font-semibold">{data.roleLabel}</p>
            <p className="text-white/70">Made for {preparedBy}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Pages in this book</p>
            <p className="font-semibold">{data.pages.length} pages this job can open</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Work this job can do</p>
            <p className="font-semibold">{data.actions.length ? data.actions.length + " actions" : "You can only look"}</p>
          </div>
        </div>
      </DocumentLetterhead>

      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-sm font-semibold">What your job is</h2>
        <p className="mt-2 text-sm text-slate-700">{data.job}</p>
        <p className="mt-2 text-sm text-slate-700">{data.shops}</p>
        {data.actions.length ? (
          <p className="mt-3 text-[12px] text-slate-600">
            You can: {data.actions.join(". ")}.
          </p>
        ) : null}
        <p className="mt-3 text-[11px] text-slate-500">
          If a page is not in this book, your job cannot open it. The computer is not spoilt. Ask the main admin.
        </p>
      </div>

      <div className="border-b border-slate-200 px-6 py-4 print:break-inside-avoid">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">What is inside</p>
        <ol className="mt-2 columns-1 gap-x-8 text-[12px] sm:columns-2">
          {data.sections.map((section, index) => (
            <li key={section.id} className="break-inside-avoid py-0.5">
              <a href={`#manual-${section.id}`} className="text-[#001BCE] print:text-slate-800 print:no-underline">
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </div>

      {data.sections.map((section, index) => {
        const showGroup = section.group !== lastGroup
        lastGroup = section.group
        return (
          <article
            key={section.id}
            id={`manual-${section.id}`}
            data-manual-id={section.id}
            className="manual-section border-b border-slate-200 px-6 py-5"
          >
            {showGroup ? (
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#001BCE]">{section.group}</p>
            ) : null}
            <h2 className="text-base font-semibold">
              {index + 1}. {section.title}
            </h2>
            <p className="mt-3 text-sm text-slate-700">{section.what}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">How to do it</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[13px] text-slate-700">
                  {section.doThis.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Be careful of</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-slate-700">
                  {section.watch.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">What this page cannot do</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-slate-700">
                  {section.cannot.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        )
      })}

      <DocumentPaperFooter brand={brand} extra={`This book only covers the pages ${data.roleLabel} can open.`} />
    </section>
  )
}
