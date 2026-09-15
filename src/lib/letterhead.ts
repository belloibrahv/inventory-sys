/**
 * What every printed paper in the shop shows at the top: name, logo, address.
 *
 * The main admin, the CEO and the books desk (accountant / auditor) set this
 * on Shop details. Receipts, invoices, reports and the how-to book all read
 * the same fields so a change of address or logo lands everywhere at once.
 */

export const DEFAULT_LOGO = "/brand/ab-mark.jpg"

export type LetterheadBrand = {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  /** Data URL, or the default mark on disk. */
  logoSrc: string
  footer: string
}

export type LetterheadInput = {
  companyName?: string
  productName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyLogo?: string
  companyFooter?: string
}

/** Company block carried on reports, books and the how-to book. */
export type PaperCompany = {
  name: string
  product?: string
  phone?: string
  address?: string
  email?: string
  logo?: string
  footer?: string
}

export function letterheadFromSettings(settings: LetterheadInput): LetterheadBrand {
  const logo = (settings.companyLogo || "").trim()
  return {
    name: settings.companyName || "Abu Twins",
    tagline: settings.productName || "Abu Twins Softskills",
    address: settings.companyAddress || "Iwo Road, Ibadan, Oyo State",
    phone: settings.companyPhone || "07062454854",
    email: settings.companyEmail || "hello@abutwins.com",
    logoSrc: logo.startsWith("data:image/") ? logo : DEFAULT_LOGO,
    footer: settings.companyFooter || "Thank you for buying from Abu Twins",
  }
}

export function letterheadFromCompany(company: PaperCompany): LetterheadBrand {
  return letterheadFromSettings({
    companyName: company.name,
    productName: company.product,
    companyPhone: company.phone,
    companyAddress: company.address,
    companyEmail: company.email,
    companyLogo: company.logo,
    companyFooter: company.footer,
  })
}

export function letterheadContactLine(brand: LetterheadBrand) {
  return [brand.address, brand.phone, brand.email].filter(Boolean).join("  ·  ")
}

export const LETTERHEAD_KEYS = [
  "company.name",
  "company.product",
  "company.phone",
  "company.address",
  "company.email",
  "company.logo",
  "company.footer",
] as const

export function isLetterheadKey(key: string) {
  return (LETTERHEAD_KEYS as readonly string[]).includes(key)
}
