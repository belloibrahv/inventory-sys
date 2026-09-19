// Short system handbook for every Abu Twins staff member.
// Plain shop words. No passwords. No CEO-only test plan.
// Run: node docs/generate-staff-handbook.mjs
import { writeFileSync } from "node:fs"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
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

const RED = "BC0004"
const BLACK = "000000"
const WHITE = "FFFFFF"
const THIN = { style: BorderStyle.SINGLE, size: 8, color: BLACK }
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

const PAGE = {
  margin: {
    top: convertInchesToTwip(0.9),
    bottom: convertInchesToTwip(0.85),
    left: convertInchesToTwip(0.95),
    right: convertInchesToTwip(0.95),
  },
}

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
    spacing: { after: extra.after ?? 140, before: extra.before ?? 0, line: 276 },
    alignment: extra.align ?? AlignmentType.LEFT,
    children: Array.isArray(text) ? text : [run(text, extra)],
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } },
    children: [run(text, { bold: true, size: 30, color: RED })],
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [run(text, { bold: true, size: 24, color: BLACK })],
  })
}

function body(text) {
  return para(text, { size: 22, after: 140 })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 70, line: 276 },
    children: [run(text, { size: 22 })],
  })
}

function step(n, text) {
  return new Paragraph({
    spacing: { after: 70, line: 276 },
    children: [run(`${n}. `, { bold: true, size: 22 }), run(text, { size: 22 })],
  })
}

function cell(text, extra = {}) {
  const width = extra.width ?? 2340
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: extra.header
      ? { type: ShadingType.CLEAR, fill: RED, color: RED }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        spacing: { after: 40, before: 40 },
        children: [
          run(String(text), {
            bold: extra.header || extra.bold,
            size: extra.header ? 18 : 20,
            color: extra.header ? WHITE : BLACK,
          }),
        ],
      }),
    ],
  })
}

function table(headers, rows, widths) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => cell(h, { header: true, width: widths[i] })),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((c, i) => cell(c, { width: widths[i] })),
          })
      ),
    ],
  })
}

const children = [
  para("ABU TWINS SOFTSKILLS INVESTMENT", { bold: true, size: 20, color: RED, after: 60, align: AlignmentType.CENTER }),
  para("Staff System Handbook", { bold: true, size: 40, after: 80, align: AlignmentType.CENTER }),
  para("A plain guide to the shop system for every staff member", {
    size: 22,
    italics: true,
    after: 280,
    align: AlignmentType.CENTER,
  }),
  table(
    ["", ""],
    [
      ["Prepared for", "Every Abu Twins shop person"],
      ["Prepared by", "Techvaults Limited"],
      ["Document type", "Staff handbook"],
      ["Date", "19 September 2026"],
      ["Version", "1.3"],
      ["Status", "Updated: initial sell price floor; raise freely for walk-in buyers"],
    ].map(([k, v]) => [k, v]),
    [2400, 4200]
  ),
  para("", { after: 200 }),
  body("This book uses everyday shop words. You do not need to be a computer expert. Read it once. Keep it at the till. Open How to use this on the system for the pages your own job can see."),

  h1("1. What this system is"),
  body("Abu Twins runs one shop system for phones, laptops, and accessories across the Ibadan shops. Every phone, every sale, and every naira should leave a name, a time, and a shop record."),
  body("If it is not on the system, it did not happen for the books."),
  bullet("Stock goes in with a bill or an opening list, then sits In shop until it sells."),
  bullet("Sales print an invoice. You do not secretly edit an old invoice."),
  bullet("Money in, money out, and still owed stay on Money in and out and Check the books."),
  bullet("Who did what keeps a diary. Important steps keep a person and a time."),

  h1("2. How to sign in"),
  body("Open the live website your manager shared with you. Use the email and first password you were given."),
  step(1, "Open the sign-in page."),
  step(2, "Type your email and first password."),
  step(3, "Click Sign in."),
  step(4, "On first sign-in the system forces a new password. Choose one only you know."),
  step(5, "After that, always use your new password. The first password stops working."),
  body("Forgot your password or locked out? Ask your branch manager. Do not share your login. Do not sign in as another person."),
  h2("Your name, How to use this, and Sign out"),
  body("After you sign in, your name sits at the top. How to use this is the short book for your job only. Account lets you change your password later. Sign out when you leave the till."),

  h1("3. Golden rules"),
  bullet("Your shop sees your shop. A person at Challenge cannot open Iwo Road sales, customers, or phones."),
  bullet("Coming is not In shop. Do not promise a Coming phone as if it is on the shelf."),
  bullet("Scanning an IMEI only fills the box. It does not save. Fill the rest, then press the save button."),
  bullet("A sale is finished paper. Fix mistakes with a return, a payment, or a new step, not by rewriting the invoice."),
  bullet("Close the day when cash came into the till. Transfer and POS days can close without a till count when cash expected is zero."),
  bullet("Opening stock is value on the shelf when the shop started. It is not a supplier bill to pay."),
  bullet("Only the Managing Director can permanently remove brands, items, banks, or lock a staff login."),
  bullet("If the line drops, park the sale on the phone. Send it when the line returns. The invoice is born only on the server."),

  h1("4. Words we use"),
  table(
    ["Word", "Meaning"],
    [
      ["In shop", "On the shelf and ready to sell."],
      ["Coming", "Expected from a supplier. Not for Sell now yet."],
      ["IMEI", "The unique phone number on the unit."],
      ["Sell now", "The till where you ring a sale."],
      ["Close the day", "Count and lock yesterday so today can sell."],
      ["Cost", "What Abu Twins paid for the item."],
      ["Sell price", "What the buyer pays."],
      ["Lowest price", "The floor. Do not sell below it without the right to."],
      ["Still owed", "Money a customer or a supplier balance still needs."],
      ["Who did what", "The diary of important actions."],
      ["Needs approval", "Work waiting for a manager or CEO yes."],
      ["Swap Deal", "Trade-in or exchange with a named buyer."],
    ],
    [2200, 5600]
  ),

  h1("5. The left menu"),
  body("The dark bar on the left is your map. You only see pages your job may open. If a page is missing, that is correct for your job."),
  table(
    ["Group", "Pages", "What it is for"],
    [
      ["Start", "Home, How to use this", "Today’s picture and your job handbook."],
      ["Stock", "Upload stock, Correct & close opening stock, Phones & items, Phone numbers (IMEI), Shop stock, Goods on the way", "Put stock on the shelf, name items, see phones and counts."],
      ["Sell & buy", "Sales, Sell now, Close the day, Goods from supplier, Customers & money owed, Suppliers", "Sell, count the till, buy, follow people who owe."],
      ["Daily work", "Shop to shop, Stock Outsourcing, Returns, Swap Deal, Repairs, Stock count", "Move stock, neighbour fill, returns, swaps, repairs, counts."],
      ["Money", "Money in & out, Check the books, Profit, Shop expenses, Needs approval", "Cash, banks, books, profit, bills, approvals."],
      ["Shop & people", "Shops, Staff, Who can see what, Reports, Who did what, Alerts, Settings", "People, shops, reports, and rules (mostly managers)."],
    ],
    [1600, 3200, 3000]
  ),
  para("", { after: 120 }),
  body("At the top, search finds an IMEI, invoice, supplier bill, or customer. Every page also has a shop calculator. It adds numbers by hand. It does not post money."),

  h1("6. Stock: how goods get on the shelf"),
  h2("Upload stock"),
  body("Three clear doors:"),
  bullet("Supplier bill: add phones one after another, or many lines, with the supplier and paid or not paid."),
  bullet("Many at once (Excel): load a whole shop sheet (PHONES, ACCESSORIES, SCREEN, LAPTOPS). Opening stock is value only."),
  bullet("One phone at a time: put one unit on the shelf quickly."),
  body("A repeated IMEI in a sheet is counted once. A number already on the system is not doubled."),
  h2("Phones & items"),
  body("The price list: names, cost, lowest price, sell price, warranty days. Staff who may edit can change details or reduce stock. Removing an item for good is for the Managing Director only."),
  h2("Shop stock and Phone numbers"),
  body("Shop stock shows how many pieces sit in each shop you can see. Phone numbers (IMEI) shows each unit and its status: In shop, Sold, Coming, and the rest."),
  h2("Goods on the way and Goods from supplier"),
  body("Goods on the way tracks cartons still Coming. Goods from supplier is the carton trail: expected, scanned, sold, still in shop. Send back to supplier works by scanning IMEI only."),

  h1("7. Selling and the till"),
  h2("Sell now"),
  body("Scan an IMEI, or type to find by IMEI, phone name, brand, category, storage, or a piece item such as a pouch or charger cord. Phones with IMEI or serial stay one unit each. Piece items have a Pieces box on this sale so you can sell as many as you have on hand. The line shows storage, Uk or Brand new, and colour under the name. The uploaded initial sell price is the floor (often the wholesale price). You may raise it for a walk-in buyer. You cannot go under it unless the CEO or Super Admin overrides. Amount received updates with the price you charge, and the invoice keeps that amount."),
  h2("Returns"),
  body("Cashiers and sales reps can open Returns. Pick a sold phone with a buyer name, or Find sold IMEI if it is not in the recent list. A manager must still say yes before stock or money moves."),
  h2("Close the day"),
  body("If yesterday is not closed, Sell now can stay shut. Close the oldest open day first. Cash remittance is required only when cash came into the till."),
  h2("Sales"),
  body("Find old invoices, print again, or take a further payment on credit sales. You cannot secretly rewrite the lines of a finished sale."),
  h2("When the line drops"),
  body("After Sell now has opened while online, you can still work from the list on that phone. Park the sale. When the line returns, send waiting work. The invoice is only born on the server."),

  h1("8. Money and books"),
  bullet("Money in & out: cash and bank movement, opening cash, named banks, people who still owe."),
  bullet("Check the books: a bank-style statement for a Lagos day or period. Print PDF or CSV."),
  bullet("Profit: sell minus cost, neighbour fill profit, and expenses."),
  bullet("Shop expenses: ask for a shop bill. Money does not leave before Needs approval says yes when approval is required."),
  bullet("Customers & money owed / Suppliers: who owes us, and who we still owe."),
  body("Opening cash and named banks live on Money in and out. They are not opening stock phones."),

  h1("9. Moves, returns, and special jobs"),
  table(
    ["Page", "What you do"],
    [
      ["Shop to shop", "Send stock from one Abu Twins shop to another. Stock stays In shop at the sending shop until Accept or Reject."],
      ["Stock Outsourcing", "Collect one unit from the dealer next door for a named customer, sell here, pay the neighbour their cost, keep the profit."],
      ["Returns", "Log a return with return value. Replace from our stock shows Receivable or Payable. Apply after approval."],
      ["Swap Deal", "Trade-in or exchange. Stock moves only after Needs approval says yes."],
      ["Repairs", "Open and track hardware repair jobs."],
      ["Stock count", "Count with your hands when the shelf does not match Still in shop. Manager approval before numbers change."],
    ],
    [2400, 5400]
  ),

  h1("10. What each job usually does"),
  body("Your left menu shows only what you may open. This table is a plain guide, not a lock list. Super Admin can change Who can see what."),
  table(
    ["Job", "Usual work"],
    [
      ["Branch Manager", "Run the shop day: approvals, stock moves, staff view for that shop, oversee sales and expenses."],
      ["Vault Manager", "Goods intake, IMEIs, supplier bills, send-backs, shelf accuracy."],
      ["Sales Executive", "Help buyers, Sell now, log a return, follow customers who still owe."],
      ["Cashier / Till", "Sell now, Close the day, print invoices, take deposits on credit."],
      ["Stock Uploader", "Upload stock, price list names and prices, warranty days. Usually cannot sell or post cash."],
      ["Engineer", "Repairs and diagnostics."],
      ["Accountant / Auditor", "Books, money pages, Who did what across shops. Cannot sell or change Who can see what."],
      ["CEO / Super Admin", "All shops, reports, settings, corrections. Only the CEO permanently removes or locks logins."],
    ],
    [2400, 5400]
  ),

  h1("11. Home and Do these next"),
  body("Home shows sales, expenses, and money figures for the shops you can see. Do these next lists work waiting: unclosed days, parked sales, overdue goods, transfers, walk-in sales with no name, low stock, approvals."),
  body("IMEI vs shop count sits on Home. Match means the phone list and the shelf count agree. A gap means find the missing unit before you sell."),

  h1("12. Safety and good habits"),
  bullet("A sale must stay at or above the initial sell price uploaded for that item, unless the CEO or Super Admin overrides. Cashiers may raise the price for a walk-in buyer. The invoice and day books keep the price that was charged."),
  bullet("Never share your password on WhatsApp groups."),
  bullet("Sign out when you leave the counter."),
  bullet("Do not invent buyers or fake cash to close the day."),
  bullet("If a button is missing, ask your manager. Do not borrow another login."),
  bullet("If the screen says Signing you out, wait until Sign in appears."),
  bullet("Long uploads show a branded wait screen. Keep the page open until it finishes."),
  bullet("Names, IMEIs, and amounts wrap in full. Read the whole value before you act."),

  h1("13. Where to get help"),
  bullet("How to use this on the system: the handbook for your job."),
  bullet("Your branch manager: first stop for password and day-to-day questions."),
  bullet("The full CEO user guide: deeper stories and the full test plan (managers and owners)."),
  bullet("Techvaults: if a page is missing on the live website or Sign in fails after a correct password."),
  para("", { after: 200 }),
  body("Short close: sell with a name, book stock with a trail, close the day, and leave every step in Who did what. That is how Abu Twins keeps the shops safe."),
]

const doc = new Document({
  creator: "Techvaults Limited",
  title: "Abu Twins Staff System Handbook",
  description: "Plain-language system guide for every Abu Twins shop staff member.",
  styles: {
    default: {
      document: {
        styles: [
          {
            id: "Normal",
            run: { font: "Calibri", size: 22, color: BLACK },
          },
        ],
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420, hanging: 220 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: { page: PAGE },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("Abu Twins  ·  Staff System Handbook", { size: 16, color: RED })],
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
                run("For Abu Twins staff  ·  Built by Techvaults Limited  ·  Page ", { size: 16 }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16 }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
const out = new URL("./Abu-Twins-Staff-System-Handbook.docx", import.meta.url)
writeFileSync(out, buffer)
console.log(`Wrote ${out.pathname}`)
