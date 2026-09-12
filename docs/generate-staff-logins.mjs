// Staff login handout. Passwords live in staff-logins.secrets.json (not committed).
// Run: node docs/generate-staff-logins.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip,
} from "docx"

const __dir = dirname(fileURLToPath(import.meta.url))
const RED = "BC0004"
const BLUE = "001BCE"
const BLACK = "000000"
const WHITE = "FFFFFF"
const GREY = "F5F5F5"
const THIN = { style: BorderStyle.SINGLE, size: 8, color: BLACK }
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

const ROLE_LABEL = {
  SUPER_ADMIN: "Super Admin",
  CEO: "Chief Executive",
  AUDITOR: "Auditor",
  ACCOUNTANT: "Accountant",
  STOCK_UPLOADER: "Stock uploader",
  BRANCH_MANAGER: "Shop manager",
  VAULT_MANAGER: "Goods intake",
  CASHIER: "Cashier",
  SALES_EXECUTIVE: "Sales",
  ENGINEER: "Repair engineer",
}

const SHOP_LABEL = {
  IWO: "Iwo Road",
  BOD: "Bodija",
  CHL: "Challenge",
}

const SEATS = [
  { email: "oyetundunr@abutwins.com", name: "Oyetunde Onireke", role: "SUPER_ADMIN" },
  { email: "aroadeyemie@abutwins.com", name: "Aro Adeyemi", role: "AUDITOR" },
  { email: "aroadeyemie.accounts@abutwins.com", name: "Aro Adeyemi (accounts)", role: "ACCOUNTANT" },
  { email: "adebayo.ceo@abutwins.com", name: "Adebayo Ogunsanya", role: "CEO" },
  { email: "folasade.uploads@abutwins.com", name: "Folasade Adewumi", role: "STOCK_UPLOADER" },
  { email: "iwo.manager@abutwins.com", name: "Babatunde Olaniyan", role: "BRANCH_MANAGER", shop: "IWO" },
  { email: "iwo.vault@abutwins.com", name: "Kehinde Adeleke", role: "VAULT_MANAGER", shop: "IWO" },
  { email: "iwo.cashier@abutwins.com", name: "Bolanle Afolabi", role: "CASHIER", shop: "IWO" },
  { email: "iwo.sales@abutwins.com", name: "Olumide Fasasi", role: "SALES_EXECUTIVE", shop: "IWO" },
  { email: "iwo.engineer@abutwins.com", name: "Gbenga Oyelaran", role: "ENGINEER", shop: "IWO" },
  { email: "bodija.manager@abutwins.com", name: "Titilayo Ogundipe", role: "BRANCH_MANAGER", shop: "BOD" },
  { email: "bodija.vault@abutwins.com", name: "Taiwo Adebisi", role: "VAULT_MANAGER", shop: "BOD" },
  { email: "bodija.cashier@abutwins.com", name: "Yewande Ajayi", role: "CASHIER", shop: "BOD" },
  { email: "bodija.sales@abutwins.com", name: "Segun Balogun", role: "SALES_EXECUTIVE", shop: "BOD" },
  { email: "bodija.engineer@abutwins.com", name: "Femi Oladipupo", role: "ENGINEER", shop: "BOD" },
  { email: "challenge.manager@abutwins.com", name: "Adunni Soyinka", role: "BRANCH_MANAGER", shop: "CHL" },
  { email: "challenge.vault@abutwins.com", name: "Kunle Abiodun", role: "VAULT_MANAGER", shop: "CHL" },
  { email: "challenge.cashier@abutwins.com", name: "Morenike Ilesanmi", role: "CASHIER", shop: "CHL" },
  { email: "challenge.sales@abutwins.com", name: "Damilare Akintola", role: "SALES_EXECUTIVE", shop: "CHL" },
  { email: "challenge.engineer@abutwins.com", name: "Tayo Ogunbiyi", role: "ENGINEER", shop: "CHL" },
]

const secrets = JSON.parse(readFileSync(join(__dir, "staff-logins.secrets.json"), "utf8"))
const logoBytes = readFileSync(join(__dir, "../public/brand/ab-mark.jpg"))

function run(text, extra = {}) {
  return new TextRun({
    text,
    font: "Calibri",
    size: extra.size ?? 22,
    bold: extra.bold ?? false,
    italics: extra.italics ?? false,
    color: extra.color ?? BLACK,
  })
}

function para(text, extra = {}) {
  return new Paragraph({
    spacing: { after: extra.after ?? 160, before: extra.before ?? 0, line: 276 },
    alignment: extra.align ?? AlignmentType.LEFT,
    children: Array.isArray(text) ? text : [run(text, extra)],
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } },
    children: [run(text, { bold: true, size: 32, color: RED })],
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [run(text, { bold: true, size: 26, color: BLACK })],
  })
}

function body(text) {
  return para(text, { size: 22, after: 160 })
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    indent: { left: 360 },
    children: [run(`•  ${text}`, { size: 22 })],
  })
}

function step(n, text) {
  return new Paragraph({
    spacing: { after: 100, line: 276 },
    children: [run(`${n}. `, { bold: true, size: 22 }), run(text, { size: 22 })],
  })
}

function cell(text, extra = {}) {
  const width = extra.width ?? 1800
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: extra.header
      ? { type: ShadingType.CLEAR, fill: RED, color: RED }
      : extra.shade
        ? { type: ShadingType.CLEAR, fill: extra.shade, color: extra.shade }
        : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        spacing: { after: 40, before: 40 },
        children: [
          run(String(text), {
            size: extra.size ?? 18,
            bold: extra.bold ?? Boolean(extra.header),
            color: extra.header ? WHITE : BLACK,
          }),
        ],
      }),
    ],
  })
}

function metaRow(k, v) {
  return new TableRow({
    children: [cell(k, { bold: true, width: 2200 }), cell(v, { width: 4800 })],
  })
}

function seatRows(filter) {
  const widths = [1600, 2800, 1600, 1200, 1800]
  const header = new TableRow({
    children: ["Name", "Email", "Job", "Shop", "First password"].map((label, i) =>
      cell(label, { header: true, width: widths[i], size: 17 })
    ),
  })
  const rows = SEATS.filter(filter).map((seat, index) => {
    const password = secrets.passwords[seat.email]
    if (!password) throw new Error(`No password in secrets for ${seat.email}`)
    const shade = index % 2 === 0 ? GREY : undefined
    return new TableRow({
      children: [
        cell(seat.name, { width: widths[0], shade, size: 16 }),
        cell(seat.email, { width: widths[1], shade, size: 15 }),
        cell(ROLE_LABEL[seat.role] ?? seat.role, { width: widths[2], shade, size: 16 }),
        cell(seat.shop ? SHOP_LABEL[seat.shop] : "All shops", { width: widths[3], shade, size: 16 }),
        cell(password, { width: widths[4], shade, size: 15, bold: true }),
      ],
    })
  })
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: widths,
    rows: [header, ...rows],
  })
}

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, before: 200 },
    children: [
      new ImageRun({
        type: "jpg",
        data: logoBytes,
        transformation: { width: 110, height: 110 },
        altText: {
          title: "Abu Twins mark",
          description: "Abu Twins Softskills company mark",
          name: "ab-mark",
        },
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [run("ABU TWINS SOFTSKILLS INVESTMENT", { bold: true, size: 28, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 360 },
    children: [run("Iwo Road  ·  Bodija  ·  Challenge", { size: 20, color: BLACK })],
  }),
  new Paragraph({
    spacing: { after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 48, color: RED, space: 12 } },
    children: [run("STAFF LOGIN HANDOUT", { bold: true, size: 48, color: BLACK })],
  }),
  para("First passwords for the live shop system. Hand each person their own line. Keep this paper locked away.", {
    size: 24,
    after: 280,
  }),
  new Table({
    width: { size: 7000, type: WidthType.DXA },
    columnWidths: [2200, 4800],
    rows: [
      metaRow("Prepared for", "Abu Twins Softskills Investment"),
      metaRow("Prepared by", "Techvaults Limited"),
      metaRow("Document type", "Confidential staff login list"),
      metaRow("Issued on", secrets.issuedOn),
      metaRow("Website", secrets.siteUrl),
      metaRow("Status", "Live. Change your password on first sign-in."),
    ],
  }),
  para("", { after: 280 }),
  new Paragraph({
    spacing: { after: 120 },
    shading: { type: ShadingType.CLEAR, fill: "FFF0F0", color: "FFF0F0" },
    children: [
      run("CONFIDENTIAL. ", { bold: true, size: 22, color: RED }),
      run(
        "These first passwords work only until each person sets their own. Do not post this file in a chat group. Do not leave it on a shared desk.",
        { size: 22 }
      ),
    ],
  }),

  h1("1. How to sign in"),
  body("Use a phone or a computer that can open the internet. The same website works for every shop."),
  step(1, `Open this address in your browser: ${secrets.siteUrl}`),
  step(2, "Type the email from your row in this paper."),
  step(3, "Type the first password from your row. Copy it carefully. Letters, numbers, and marks all matter."),
  step(4, "Press Sign in."),
  step(5, "The system will ask you to set a new password that only you know. Choose one you can remember and will not share."),
  step(6, "After that, use your email and your new password every day."),
  h2("If sign-in fails"),
  bullet("Check that Caps Lock is off."),
  bullet("Check you used the full email, including @abutwins.com."),
  bullet("Try the first password again from this paper if you have not changed it yet."),
  bullet("If you already changed it and forgot it, ask Super Admin to reset your seat. Do not borrow someone else's login."),

  h1("2. Rules for every login"),
  bullet("One person, one login. Never share your password with a colleague."),
  bullet("Sign out when you leave the till or the desk."),
  bullet("A shop login (manager, goods intake, cashier, sales, engineer) only sees that shop's stock, sales, and customers."),
  bullet("Head-office jobs (Super Admin, Chief Executive, Auditor, Accountant, Stock uploader) can work across shops."),
  bullet("Aro Adeyemi has two seats on purpose: one for Auditor work, and one for Accountant work. Use the right email for the job you are doing."),
  bullet("Open How to use this after you sign in. That book only shows the pages your job can open."),
  bullet("If you see a page you should not see, sign out and tell Super Admin."),

  h1("3. What each job is for"),
  bullet("Super Admin: opens shops, manages seats, and fixes blocked work."),
  bullet("Chief Executive: reads the business across shops."),
  bullet("Auditor: checks records without posting cash."),
  bullet("Accountant: records expenses and supplier payments."),
  bullet("Stock uploader: loads opening stock and cartons. Cannot sell or take money."),
  bullet("Shop manager: runs one shop day to day."),
  bullet("Goods intake: books phones and cartons into that shop."),
  bullet("Cashier: takes money and closes the till."),
  bullet("Sales: helps buyers and starts sales."),
  bullet("Repair engineer: logs repair work for that shop."),

  h1("4. Head office seats"),
  body("These five seats work across Iwo Road, Bodija, and Challenge."),
  seatRows((s) => !s.shop),

  h1("5. Iwo Road seats"),
  body("These five seats only see Iwo Road."),
  seatRows((s) => s.shop === "IWO"),

  h1("6. Bodija seats"),
  body("These five seats only see Bodija."),
  seatRows((s) => s.shop === "BOD"),

  h1("7. Challenge seats"),
  body("These five seats only see Challenge."),
  seatRows((s) => s.shop === "CHL"),

  h1("8. After everyone has signed in"),
  bullet("Each person should destroy or return the paper line that held their first password."),
  bullet("Super Admin should keep one locked copy of this handout until every seat has changed its password."),
  bullet("After that, treat this file as spent. New resets get a new password from Super Admin, not from this paper."),
  para("", { after: 200 }),
  para("Techvaults Limited  ·  Product Team", { size: 20, after: 40 }),
  para("Built for Abu Twins Softskills Investment", { size: 20, after: 40 }),
]

const doc = new Document({
  styles: {
    default: {
      document: {
        styles: [{ id: "Normal", run: { font: "Calibri", size: 22 } }],
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.85),
            bottom: convertInchesToTwip(0.85),
            left: convertInchesToTwip(0.85),
            right: convertInchesToTwip(0.85),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("Abu Twins Softskills  ·  Confidential", { size: 16, color: RED })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run("Page ", { size: 16 }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16 }),
                run(" of ", { size: 16 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Calibri", size: 16 }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
})

const out = join(__dir, "Abu-Twins-Staff-Logins.docx")
const buffer = await Packer.toBuffer(doc)
writeFileSync(out, buffer)
console.log(`Wrote ${out}`)
console.log(`${SEATS.length} seats. Hand this file to the owner only.`)
