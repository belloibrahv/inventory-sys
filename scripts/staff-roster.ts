import type { UserRole } from "@prisma/client"

export type Seat = { email: string; name: string; role: UserRole; branchCode?: string }

/**
 * One login per role per shop, plus the company-wide seats.
 *
 * A login carries exactly one role, so the person who is both auditor and
 * accountant needs one of each: the audit seat to see the books, the accounts
 * seat to record expenses and supplier payments.
 */
export const SEATS: Seat[] = [
  { email: "oyetundunr@abutwins.com", name: "Oyetunde Onireke", role: "SUPER_ADMIN" },
  { email: "aroadeyemie@abutwins.com", name: "Aro Adeyemi", role: "AUDITOR" },
  { email: "aroadeyemie.accounts@abutwins.com", name: "Aro Adeyemi (accounts)", role: "ACCOUNTANT" },

  { email: "adebayo.ceo@abutwins.com", name: "Adebayo Ogunsanya", role: "CEO" },
  { email: "folasade.uploads@abutwins.com", name: "Folasade Adewumi", role: "STOCK_UPLOADER" },

  { email: "iwo.manager@abutwins.com", name: "Babatunde Olaniyan", role: "BRANCH_MANAGER", branchCode: "IWO" },
  { email: "iwo.vault@abutwins.com", name: "Kehinde Adeleke", role: "VAULT_MANAGER", branchCode: "IWO" },
  { email: "iwo.cashier@abutwins.com", name: "Bolanle Afolabi", role: "CASHIER", branchCode: "IWO" },
  { email: "iwo.sales@abutwins.com", name: "Olumide Fasasi", role: "SALES_EXECUTIVE", branchCode: "IWO" },
  { email: "iwo.engineer@abutwins.com", name: "Gbenga Oyelaran", role: "ENGINEER", branchCode: "IWO" },

  { email: "bodija.manager@abutwins.com", name: "Titilayo Ogundipe", role: "BRANCH_MANAGER", branchCode: "BOD" },
  { email: "bodija.vault@abutwins.com", name: "Taiwo Adebisi", role: "VAULT_MANAGER", branchCode: "BOD" },
  { email: "bodija.cashier@abutwins.com", name: "Yewande Ajayi", role: "CASHIER", branchCode: "BOD" },
  { email: "bodija.sales@abutwins.com", name: "Segun Balogun", role: "SALES_EXECUTIVE", branchCode: "BOD" },
  { email: "bodija.engineer@abutwins.com", name: "Femi Oladipupo", role: "ENGINEER", branchCode: "BOD" },

  { email: "challenge.manager@abutwins.com", name: "Adunni Soyinka", role: "BRANCH_MANAGER", branchCode: "CHL" },
  { email: "challenge.vault@abutwins.com", name: "Kunle Abiodun", role: "VAULT_MANAGER", branchCode: "CHL" },
  { email: "challenge.cashier@abutwins.com", name: "Morenike Ilesanmi", role: "CASHIER", branchCode: "CHL" },
  { email: "challenge.sales@abutwins.com", name: "Damilare Akintola", role: "SALES_EXECUTIVE", branchCode: "CHL" },
  { email: "challenge.engineer@abutwins.com", name: "Tayo Ogunbiyi", role: "ENGINEER", branchCode: "CHL" },
]
