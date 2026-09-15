import type { ReactNode } from "react"
import { letterheadContactLine, type LetterheadBrand } from "@/lib/letterhead"

/**
 * The top and bottom of every paper the shop prints.
 *
 * Kept as one component so an invoice, a report and the how-to book share the
 * same mark, name and address. Background colour is forced for print: Chrome
 * otherwise drops the navy band and the paper looks like a blank list.
 */
export function DocumentLetterhead({
  brand,
  documentKind,
  documentTitle,
  meta,
  children,
}: {
  brand: LetterheadBrand
  documentKind: string
  documentTitle?: string
  meta?: string[]
  children?: ReactNode
}) {
  return (
    <div className="letterhead text-white">
      <div className="letterhead-band px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <img
              src={brand.logoSrc}
              alt=""
              width={56}
              height={56}
              className="letterhead-logo h-14 w-14 shrink-0 rounded-md bg-white object-contain p-1"
            />
            <div className="min-w-0">
              <p className="text-xl font-semibold leading-tight tracking-tight">{brand.name}</p>
              {brand.tagline ? (
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7CFF86]">
                  {brand.tagline}
                </p>
              ) : null}
              <p className="mt-1.5 text-[11px] leading-snug text-white/80">{letterheadContactLine(brand)}</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7CFF86]">{documentKind}</p>
            {documentTitle ? <p className="mt-1 text-lg font-semibold leading-tight">{documentTitle}</p> : null}
            {meta?.filter(Boolean).map((line) => (
              <p key={line} className="text-[11px] text-white/75">
                {line}
              </p>
            ))}
          </div>
        </div>
        {children}
      </div>
      <div className="letterhead-rule" />
    </div>
  )
}

export function DocumentPaperFooter({
  brand,
  extra,
}: {
  brand: LetterheadBrand
  extra?: string
}) {
  return (
    <div className="letterhead-foot flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-[10px] uppercase tracking-[0.12em] text-slate-500">
      <span>{brand.footer}</span>
      <span>{extra || `${brand.phone} · ${brand.email}`}</span>
    </div>
  )
}
