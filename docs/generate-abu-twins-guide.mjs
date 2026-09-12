// Shop user guide. After any staff-facing change, edit this file, bump Version,
// then run: node docs/generate-abu-twins-guide.mjs
import { writeFileSync } from "node:fs"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
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
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: WHITE }

const PAGE = {
  margin: {
    top: convertInchesToTwip(1),
    bottom: convertInchesToTwip(0.9),
    left: convertInchesToTwip(1),
    right: convertInchesToTwip(1),
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
    underline: extra.underline ? {} : undefined,
  })
}

function para(text, extra = {}) {
  return new Paragraph({
    spacing: { after: extra.after ?? 160, before: extra.before ?? 0, line: extra.line ?? 276 },
    alignment: extra.align ?? AlignmentType.LEFT,
    keepNext: extra.keepNext,
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

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [run(text, { bold: true, size: 24, color: BLACK })],
  })
}

function body(text) {
  return para(text, { size: 22, after: 160 })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 276 },
    children: [run(text, { size: 22 })],
  })
}

function step(n, text) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    children: [
      run(`${n}. `, { bold: true, size: 22 }),
      run(text, { size: 22 }),
    ],
  })
}

function cell(text, extra = {}) {
  const width = extra.width ?? 2340
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: extra.header
      ? { type: ShadingType.CLEAR, fill: RED, color: RED }
      : extra.shade
        ? { type: ShadingType.CLEAR, fill: extra.shade, color: extra.shade }
        : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: extra.align ?? AlignmentType.LEFT,
        children: [run(String(text), { bold: extra.header || extra.bold, size: extra.size ?? 20, color: extra.header ? WHITE : BLACK })],
      }),
    ],
  })
}

function table(headers, rows, widths) {
  const cols = widths ?? headers.map(() => Math.floor(9360 / headers.length))
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({
        tableHeader: true,
        height: { value: 360, rule: HeightRule.ATLEAST },
        children: headers.map((h, i) => cell(h, { header: true, width: cols[i] })),
      }),
      ...rows.map((row, index) =>
        new TableRow({
          height: { value: 320, rule: HeightRule.ATLEAST },
          children: row.map((value, i) =>
            cell(value, { width: cols[i], shade: index % 2 === 1 ? "F7F7F7" : WHITE })
          ),
        })
      ),
    ],
  })
}

function noteBox(title, lines) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: THIN, bottom: THIN, left: { style: BorderStyle.SINGLE, size: 24, color: RED }, right: THIN },
            width: { size: 9360, type: WidthType.DXA },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              para(title, { bold: true, size: 22, after: 80 }),
              ...lines.map((line) => para(line, { size: 21, after: 60 })),
            ],
          }),
        ],
      }),
    ],
  })
}

function feature(block) {
  return [
    h2(block.title),
    h3("What this page is"),
    body(block.what),
    h3("Why it is here"),
    body(block.why),
    h3("A real shop story"),
    body(block.story),
    h3("How to try it"),
    ...block.steps.map((line, i) => step(i + 1, line)),
    h3("What you should see"),
    ...block.expect.map((line) => bullet(line)),
  ]
}

const children = [
  new Paragraph({
    spacing: { after: 80 },
    children: [run("TECHVAULTS LIMITED", { bold: true, size: 20, color: RED })],
  }),
  new Paragraph({
    spacing: { after: 400 },
    children: [run("Product Team  ·  techvaults.com", { size: 20, color: BLACK })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { left: { style: BorderStyle.SINGLE, size: 48, color: RED, space: 12 } },
    children: [run("ABU TWINS SHOP SYSTEM", { bold: true, size: 56, color: BLACK })],
  }),
  para("How to use it. How to test it. Written in plain words.", { size: 28, after: 360 }),
  new Table({
    width: { size: 6000, type: WidthType.DXA },
    columnWidths: [2200, 3800],
    rows: [
      ["Prepared for", "The Chief Executive Officer, Abu Twins Softskills Investment"],
      ["Prepared by", "Product Team, Techvaults Limited"],
      ["Document type", "User guide and test plan"],
      ["Date", "9 September 2026"],
      ["Version", "1.20"],
      ["Status", "Updated: List pages have tap filters and clear Lagos When times"],
    ].map(([k, v]) =>
      new TableRow({
        children: [
          cell(k, { bold: true, width: 2200 }),
          cell(v, { width: 3800 }),
        ],
      })
    ),
  }),
  para("", { after: 480 }),
  para("This paper is for people who run shops, sell phones, take money, and count stock. You do not need to be a computer expert.", { size: 22, italics: true }),
  para("Techvaults Limited built this software for Abu Twins. The shops stay yours. The records stay yours.", { size: 22 }),

  h1("1. A letter to the CEO"),
  body("Dear Sir,"),
  body("You asked for one place where every phone, every sale, and every naira can be seen. You also asked that old numbers cannot be quietly changed. Abu Twins has lost money when accounts were not kept and staff work could not be named. This book shows what Techvaults built, why each part exists, and how your team can try it."),
  body("The rule is simple. Money and phones must leave a name, a time, and a shop record. If it is not on the system, it did not happen."),
  body("We wrote this for shop people, not for engineers. Short sentences. Everyday words. Real shop stories from Ibadan."),
  body("Today Abu Twins has two shops: Iwo Road, Ibadan (head office) and Challenge, Ibadan. The system can add more shops in Nigeria later. Super Admin opens a new shop when you are ready."),
  body("Please treat the login list at the end as practice only. Those names and passwords are for testing. You can lock them or remove them when live work starts."),
  body("If a page is missing on the live website, ask Techvaults. We will put the newest version up for you."),
  body("Three things matter most in this release. Abu Twins now runs three shops in Ibadan: Iwo Road, Bodija, and Challenge. Each shop keeps its own records, so a person working at one shop cannot read another shop's sales, customers, or phones. And you can look at the three shops together, or at one shop on its own, from the same screens."),
  body("That last point is the one to try first. A weak shop hides inside a healthy total. Now you can pick Bodija at the top of the screen and read Bodija alone, then pick All shops together and read the business. The figures are the same figures your staff are working from, not a report someone prepared for you."),
  body("This release also answers the question of how the shops get loaded in the first place. Your team can now put the whole business into the system from an Excel sheet: the item list, what is on each shelf, and every phone by IMEI. Booking a container in by hand, one phone at a time, is where an evening goes. A sheet does it in one press."),
  body("Because that is powerful, it is also narrow. A new job called Stock uploader does only that work. It cannot sell, cannot see money, and cannot approve anything. Loading the item list is now limited to that job and to Super Admin, so three shops cannot end up with three different names for the same phone."),
  body("Every sale can now be handed over as a receipt: saved as a file to send to a customer, printed for a whole day at once, or printed the moment the sale is finished at the till."),
  body("Long lists are easier to read now. On Sales, Goods from supplier, Expenses, Shop to shop, Needs approval, Returns, Swaps, Repairs, Goods on the way, and Phone IMEIs, you can tap a status chip or a stage to show only that cut. Time on each row is Lagos time, in plain words like Today, 14:30."),
  body("The system has grown steadily since we began. Section 16 lists what each release added, in order, if you want that history. You do not need to read it to use the system."),
  para("", { after: 160 }),
  para("Product Team", { bold: true, after: 40 }),
  para("Techvaults Limited", { after: 40 }),
  para("techvaults.com", { after: 200 }),

  h1("2. What this book is"),
  body("This book has three jobs."),
  bullet("Explain the shop system in plain words."),
  bullet("Show what problem each page solves."),
  bullet("Give a test for each page, and the result you should see."),
  body("Anyone in the company can use this book: the CEO, a shop manager, a cashier, goods intake, accounts, or a repair engineer."),
  h3("How to read it"),
  bullet("Read section 3 and 4 first. That is the big picture."),
  bullet("Read section 6 and 7 to know shops and jobs."),
  bullet("Use section 10 when you sit at a computer and click each page. Start with Home, How to use this, Sell now, Close the day, and Check the books."),
  bullet("On the live system, open How to use this. That book only covers the job you signed in as."),
  bullet("Use section 12 when you share test logins."),

  h1("3. The problem we set out to fix"),
  body("A phone shop can lose money in quiet ways. A phone leaves the shelf and nobody writes it down. Two shops argue about who has a carton. A sale is made and the paper is lost. A return happens and the old invoice is rubbed out. A charger cord has no number, so nobody knows how many came in."),
  body("When shops grow, paper and chat messages are not enough. People forget. People guess. People hide mistakes."),
  h3("What was going wrong"),
  bullet("Phones could be sold without a clear record of the unique phone number on the box."),
  bullet("Goods on a bus or with a rider looked the same as goods already on the shelf."),
  bullet("One shop could not see what another shop still had."),
  bullet("A sale could be changed later, so the day’s money no longer matched."),
  bullet("The till was not counted, so yesterday’s cash could walk and today’s sales still went on."),
  bullet("A sale parked on a phone when the line dropped could sit, or be wiped, and nobody was told."),
  bullet("The shelf count and the IMEI list could drift apart, and Home hid that until someone hunted."),
  bullet("Returns, swaps, and repairs lived in people’s heads."),
  bullet("The boss could not see who did what, and when."),
  h3("What we built as the fix"),
  body("One shop system for all Abu Twins shops. Each phone has a unique number (IMEI). Accessories can have a serial number. Simple items like charger cords are counted by pieces. Goods that are still coming stay marked Coming. Goods in the shop stay marked In shop. A sale makes an invoice that cannot be edited. Money, returns, swaps, and repairs are written as new steps. Super Admin can show or hide a coming list. Super Admin can undo a money collection if a true mistake happened."),
  body("A shop day follows West Africa Time (Lagos time). If a shop had completed sales on a past day and nobody counted the till, Sell now will not take a new live sale. Already parked sales from a dead line can still be sent. If a parked sale sits more than two hours, or disappears from that device, Super Admin, the CEO, and the records checker get an alert, and Who did what keeps the story. Home always lists IMEI versus shop count, including the match."),

  h1("4. What the system does for you"),
  table(
    ["Need", "What the system does"],
    [
      ["Know what is in each shop", "Shop stock shows In shop and Coming as two different numbers."],
      ["Know each phone", "Phone IMEIs keep the unique number from the box."],
      ["Book goods before they arrive", "Goods on the way lets Super Admin or Goods intake type IMEIs, serials, or a piece count."],
      ["Sell without guesswork", "Sell now only offers phones that are already In shop. Scan the box or type the IMEI."],
      ["Stop sales until the till is counted", "If yesterday had sales and nobody closed that day, Complete sale stays locked."],
      ["Keep a sale when the line drops", "The sale stays on that device, then posts when the line returns. Who did what keeps the trail."],
      ["Catch a parked sale that sits or vanishes", "Sitting more than two hours, or wiped off the device, raises an alert."],
      ["See phone count versus IMEI", "Home always shows shop qty and IMEI count, including when they match."],
      ["Give the buyer a paper", "Every sale makes a sales invoice you can print."],
      ["Move goods between our shops", "Shop to shop. Upload a CSV of IMEIs and accessories. The other Abu Twins shop must confirm arrival."],
      ["Fill from a neighboring dealer", "Neighbor shop fill. Sell here, return their money, keep our profit."],
      ["See profit", "Profit shows sell minus cost, neighbor fill profit, and approved expenses."],
      ["Handle returns and swaps", "The old invoice stays. A new record is made."],
      ["Watch money", "Money in & out, Close the day, expenses, and reports show real figures."],
      ["Check a past day's books", "Check the books reprints money, phones, and the trail for any Lagos day. You can compare two periods."],
      ["Print official books", "Download a branded PDF or CSV, or print the statement. It does not change any invoice."],
      ["Change many selling prices at once", "On Phones & items, tick any mix of phones and accessories, type each new selling price, and click Update selected prices. Sales stay by the unit."],
      ["Control who sees what", "Super Admin ticks pages for each job."],
      ["See who changed a record", "Who did what keeps a list that is not deleted."],
    ],
    [3600, 5760]
  ),
  para("", { after: 200 }),
  body("The system does not guess. If a phone is still Coming, a cashier cannot sell it. If a walk-in sale has no customer name, a return cannot start until you add the buyer."),

    para("", { after: 120 }),
  h3("Three shops, one business"),
  body("Iwo Road, Bodija, and Challenge each run their own stock, their own till, and their own customers. Nothing crosses between them by accident. Head office sits above all three and can read them together or one at a time."),
  bullet("A shop sees itself only. That is enforced by the system, not by staff being careful."),
  bullet("Head office sees all three added up, or any one shop on its own, from the same screens."),
  bullet("Stock moves between shops only through Shop to shop, which leaves a record at both ends."),
  bullet("Each shop closes its own till, on its own day."),
h1("5. Words we use"),
  body("We keep computer words out of daily talk. Here are the few words you will see on the screen."),
  table(
    ["Word on the screen", "What it means in the shop"],
    [
      ["Shop", "A place that sells. Iwo Road or Challenge today."],
      ["Head office / HQ", "Iwo Road, Ibadan. The main shop."],
      ["IMEI", "The unique number printed on a phone. No two phones share it."],
      ["Serial", "A unique number on some accessories, like buds or a tablet."],
      ["No number", "Items with no unique mark, like many charger cords. We count pieces."],
      ["In shop", "It is physically here. You may sell it."],
      ["Coming", "It is booked, but it has not arrived yet. Do not sell it."],
      ["Invoice", "The sales paper. It has a number. It cannot be edited later."],
      ["Business day", "The shop day in Lagos time, not the time on a phone set to another country."],
      ["Close the day", "Count the cash in the drawer against cash sales for that business day."],
      ["Check the books", "The official statement for a shop and period. Open a past day. Compare it. Print or download."],
      ["Statement of account", "The branded books paper with the ab mark, a statement number, and sign-off lines."],
      ["Compare with", "The other day or period the system puts beside this period, so movement is visible."],
      ["Parked sale", "A finished cart saved on this device because the line was down. It is not an invoice yet."],
      ["IMEI vs shop count", "How many unique phones the system holds, compared with the shop quantity."],
      ["Line down", "This device has no internet. Sell now can still park a sale if the till is not locked. Refresh is safe after Sell now has been opened on that phone."],
      ["The till is still here", "The recovery page if a refresh cannot reach the server. Parked sales and the last In shop list on this phone are there."],
      ["List on this phone", "The last In shop IMEIs and named customers saved when Sell now was open and the line was up."],
      ["Goods intake", "The person who books and receives goods."],
      ["Super Admin", "The person who can see and do everything, and can undo a true mistake."],
      ["Needs approval", "A request waiting for a yes or a no from a manager."],
      ["Walk-in", "A buyer with no name on the sale yet."],
      ["Lowest price", "The floor. Staff cannot sell below it unless Super Admin allows it."],
      ["Update selected prices", "Tick any mix of phones and accessories, type each new selling price, and save once. Sales stay by the unit."],
      ["Opening stock sheet", "The Excel Abu Twins already uses: one file per shop, with PHONES, ACCESSORIES, SCREEN, and LAPTOPS. Upload it on Upload stock when you have many lines. Pick the supplier and paid or not paid."],
      ["Add one item to the shelf", "On Upload stock, book a single phone, laptop, or piece count by hand under an open upload bill. Scan or type the IMEI or serial. The form clears for the next unit."],
      ["Upload bill", "A Goods from supplier PO started on Upload stock. It carries the supplier, submission value, and paid or not paid for that load."],
      ["Submission value", "The cost total of everything loaded on that upload bill. Cost times quantity."],
      ["Upload list", "Add many item names from an Excel or CSV file. This does not put stock on the shelf. Use Goods on the way for that."],
      ["Your login", "The page where a person changes their own password."],
      ["Shop backup", "A Super Admin copy of shops, staff emails, stock, IMEIs, sales, and purchases. Keep that file off this computer."],
      ["How to use this", "The handbook for your job. Look up a word. Print the book. It only covers pages you can open."],
      ["Shop to shop", "Send stock that already belongs to Abu Twins from Iwo Road to Challenge, or the other way. The list is a CSV of IMEIs and accessory lines."],
      ["Neighbor shop fill", "Collect one unit from a neighboring dealer for a named customer. Sell it here. Return their money. Keep the profit."],
      ["Expected goods", "What a supplier still owes you in units. Coming is not In shop until the carton is checked."],
      ["Never scanned versus the bill", "Units on the supplier bill that were never given an IMEI or piece count on this system."],
      ["Sold today", "Units from that supplier carton that already have an invoice on this Lagos day. Check this before Close the day."],
      ["Still in shop", "What the system still believes is on the shelf from that carton. If the shelf has fewer, open Stock count."],
      ["Stock count", "Count the shelf with your hands. Compare with the system. A manager must approve before any number changes."],
      ["Profit", "Sell price minus cost, plus neighbor fill profit, minus approved expenses."],
    ],
    [2800, 6560]
  ),

  h1("6. Shops today"),
  body("Abu Twins works in Ibadan only. There are three shops. The system is ready for more cities later."),
  table(
    ["Shop", "Code", "What it is"],
    [
      ["Iwo Road, Ibadan", "IWO", "Head office. Main stock and most staff sit here."],
      ["Bodija, Ibadan", "BOD", "Second shop. Has its own shop manager and its own stock."],
      ["Challenge, Ibadan", "CHL", "Third shop. Has its own shop manager and its own stock."],
    ],
    [3600, 1400, 4360]
  ),
  para("", { after: 160 }),
  body("Old Lagos, Abuja, and Port Harcourt shops are closed in the system. Past sales from those names stay in history so old invoices are not lost. They do not appear when you sell or when you book new goods."),
  body("When Abu Twins opens a shop in another city, Super Admin goes to Shops and opens a new shop. Staff in that shop will then see only their shop, unless Super Admin lets them see every shop."),

  h1("7. Who uses the system"),
  body("Each person has a job. The job decides which pages they see. Super Admin can change that on Who can see what."),
  table(
    ["Job on the screen", "Who this is", "What they mainly do"],
    [
      ["Super Admin", "Techvaults or a trusted Abu Twins lead", "Everything. Open shops. Tick pages. Undo a money mistake. Show or hide coming goods."],
      ["CEO", "Abu Twins leadership", "See all shops. Watch sales, stock, and money. Cannot change Who can see what."],
      ["Records checker", "Internal check person", "Look at records. Check the books. Approve some requests. Does not sell."],
      ["Accountant", "Accounts", "See sales and money. Check the books. Record pay-outs. See every shop."],
      ["Shop manager", "The manager at Iwo Road, Bodija, or Challenge", "Run one shop. Sell, receive, transfer, approve shop work. Sees only that shop. Does not add items or change prices."],
      ["Goods intake", "The person who books incoming goods", "Book goods before they arrive. Receive phones. Send goods to a shop."],
      ["Stock uploader", "The person who puts stock on the shelf in the system", "Start an upload bill with a supplier, add units by hand or upload the opening stock Excel. Each load gets a PO. Nothing else. No selling, no posting cash, no approving."],
      ["Cashier", "Front desk money person", "Sell now. Close the day. Collect money. Record a return."],
      ["Sales person", "Floor seller", "Sell now. Close the day. See customers and items."],
      ["Repair engineer", "Workshop", "Take phones for repair. Move a repair from step to step."],
    ],
    [2200, 3000, 4160]
  ),
  para("", { after: 160 }),
  noteBox("What changed for shop managers", [
    "Adding an item to the list, and changing a price, has moved to the Stock uploader and Super Admin.",
    "This is on purpose. When each shop could add its own items, one phone ended up on the system under three names, and no report could add them up.",
    "A shop manager still sells, receives goods, transfers, approves shop work, and runs their own staff.",
    "If your shop needs a new item on the list, send it to whoever holds the Stock uploader login.",
  ]),
  para("", { after: 160 }),
  noteBox("A simple rule", [
    "If you cannot see a page, Super Admin has not given that page to your job. That is not a broken computer. Ask Super Admin.",
    "Super Admin can do and undo everything. Other jobs only do what Super Admin ticks.",
  ]),

  h1("8. How to sign in"),
  body("Open the shop system in a web browser. The live address Techvaults gave you is:"),
  para("https://inventory-sys-production.up.railway.app", { bold: true, size: 22 }),
  h3("Steps"),
  step(1, "Open the address above."),
  step(2, "Type the work email Super Admin gave you."),
  step(3, "Type your password."),
  step(4, "Click Sign in."),
  h3("What you should see"),
  bullet("The left side says abutwins Softskills and Own The Future."),
  bullet("The bottom of the sign-in page says Software by Techvaults Limited. You can click it to open techvaults.com."),
  bullet("After a correct login you land on Home, or the first page your job is allowed to see."),
  bullet("While it checks, the button says Checking your sign-in, not three dots."),
  bullet("A wrong email or password shows: Email or password is not correct, or this login is locked."),
  bullet("A locked staff account cannot enter."),
  h3("If you get stuck"),
  bullet("Check you are using the email, not a phone number."),
  bullet("Ask Super Admin to restore the account if it was locked."),
  bullet("Do not share your password in a group chat."),

  h1("9. The left menu"),
  body("After you sign in, the dark bar on the left is your map. You only see the pages your job may open."),
  table(
    ["Group", "Pages", "In one sentence"],
    [
      ["Start", "Home, How to use this", "Today’s numbers, IMEI versus shop count, and the printable handbook for this job."],
      ["Stock", "Phones & items, Upload stock, Phone IMEIs, Shop stock, Goods on the way", "What you sell, adding stock with a supplier bill, each phone number, what is here, what is still coming."],
      ["Sell & buy", "Sales, Sell now, Close the day, Goods from supplier, Customers, Suppliers", "Sell, count the till, print invoices, buy from a supplier, trace a carton if a unit is missing, keep people lists."],
      ["Daily work", "Shop to shop, Neighbor shop fill, Returns, Swaps, Repairs, Stock count", "Move our stock, fill from next door, take phones back, trade, fix, count shelves."],
      ["Money", "Money in & out, Check the books, Profit, Expenses, Needs approval", "Cash movement, official books, profit, bills, and yes-or-no requests."],
      ["Shop & people", "Shops, Staff, Who can see what, Reports, Who did what, Alerts, Settings", "People, shops, reports, and rules."],
    ],
    [1800, 3600, 3960]
  ),
  para("", { after: 160 }),
  body("At the top there is a search box: Find IMEI, invoice, supplier bill, or customer. Type a phone number, an invoice number, a supplier bill, or a buyer name. An IMEI can open the carton that unit came from."),
  body("How to use this, Account, and Sign out sit beside your name. They use the same size as the job name, such as Super Admin, so they are easy to tap."),
  body("On a computer you can hide the left menu if you need more room. The choice stays on that device. On a phone the menu stays a drawer."),
  body("Every signed-in page has a shop calculator. Use it to add a line by hand. It does not post money. It does not change an invoice."),

  h1("10. Features, stories, and tests"),
  body("This is the heart of the book. For each page you get what it is, why it exists, a real Ibadan story, the clicks to try, and the result you should see."),
  body("Use Super Admin or the job named in the test. If a button is missing, your job is not allowed to do that work."),

  ...feature({
    title: "10.1 Home",
    what: "Home is the first picture of the day. It shows sales, expenses, money sent out, and money collected. At the top it lists work that still needs a person: days not closed, parked sales sitting too long, parked sales that vanished, overdue goods, transfers waiting, walk-in sales with no name, low stock, and approvals. Below that, IMEI vs shop count is always on the page. It lists every phone and laptop the shops you can see, with shop qty, IMEI count, and Match or a gap.",
    why: "A boss should not hunt through ten pages to know if the day is healthy. If the IMEI list and the shop count disagree, phones can leave without a name. If a day is not closed, cash can leave without a count. Home puts those facts on one screen, including when they match, so a clean shop is as visible as a broken one.",
    story: "It is Monday morning at Iwo Road. The CEO opens Home. Do these next says one day is not closed, so Sell now is locked. IMEI vs shop count shows Camon 30 at IWO: shop qty 4, IMEIs 3, short by 1. The CEO clicks the unclosed day, tells the cashier to count the till, and asks the manager to find the missing IMEI before anyone sells.",
    steps: [
      "Sign in as CEO (ceo@abutwins.com).",
      "If you are not on Home, click Home on the left.",
      "Read Do these next. If a day is not closed, click it. You should land on Close the day for that date.",
      "Scroll to IMEI vs shop count. Read Match or Gaps.",
      "Click Stock count vs IMEI mismatch to jump to the same table.",
      "If a parked sale sat too long or vanished, open that card. Sitting goes to Sell now. Vanished goes to Who did what.",
    ],
    expect: [
      "You see Total sales, Total expenses, Money sent out, and Money collected.",
      "IMEI vs shop count is always there, even when every row says Match.",
      "A gap row says extra IMEI or short. Treat a missing row as unproven stock.",
      "Unclosed days, sitting parked sales, and vanished parked sales appear only when they exist.",
      "A cashier who has no Home page will not see this. That is correct for that job if Super Admin hid it.",
    ],
  }),

  ...feature({
    title: "10.2 Phones & items",
    what: "This is the list of things Abu Twins sells: phones, tablets, buds, charger cords, and more. Each line has a name, an item code, a brand, a condition, cost, lowest price, selling price, warranty days, units in shop, and a tracking type: IMEI, serial, or no number. Staff who can add items may upload many names from Excel or CSV, add one product by hand, and change warranty days. Staff who can change prices can tick many lines at once, type a new selling price on each line, and save them together. Find item code, brand, or model to narrow the list first.",
    why: "If staff invent names at the till, reports become junk. One list keeps names and prices the same in every shop. Uploading a file is how you add fifty names without typing each one. When ten or fifty prices move on the same morning, ticking those lines is faster than opening each item one by one. The mix can be iPhone, Samsung, and accessories on the same save. That is not a carton sale. You still sell by the unit. Upload does not put stock on the shelf.",
    story: "Monday at Iwo Road. Goods intake downloads the sample file, adds Type-C charger cord with no number, and uploads the list. The cord appears as a name with zero units. Later the manager must raise selling prices on two iPhones, one Samsung, and that charger cord. They tick those four lines, type the four new selling prices, write Weekend price review, and click Update selected prices. Sell now shows the new numbers. Who did what names the four items.",
    steps: [
      "Sign in as Super Admin or shop manager.",
      "Click Phones & items.",
      "Read the list. Each line shows IMEI, serial, or no number under the name, plus cost, lowest price, selling price, warranty days, and units.",
      "On the right, download the sample file. That Excel or CSV is for names and prices only. Upload list does not book Coming stock. Use Goods on the way when the carton is coming.",
      "Add one product by hand only if Super Admin agrees you may create practice items. Pick Phone, IMEI, Accessory with serial, or No number. Set cost, lowest price, selling price, and warranty days. Save.",
      "If you can change prices, tick two or more items from different brands, including an accessory. Type a new selling price on each ticked line. You may write why these prices changed. Click Update selected prices.",
      "To change warranty days for one item, pick it under Warranty days and save.",
    ],
    expect: [
      "Phones show · IMEI. Buds or tablets can show · serial. Cords show · no number.",
      "An uploaded file adds names to the list. Shop stock units stay at zero until goods arrive.",
      "The new hand-added item appears in the list with the tracking type you picked.",
      "Ticked lines take a new selling price. One save updates all of them. The list then shows the new Sell figures.",
      "A mix of brands and accessories is allowed. The save is not limited to one brand or one carton. Sales stay by the unit.",
      "Warranty days on that item change after you save Warranty days.",
      "A person without Add items and change prices cannot use upload, add, ticks, or warranty. They only see the list.",
    ],
  }),

  ...feature({
    title: "10.3 Phone IMEIs",
    what: "This page is the life of each unique phone or serial item. Tap a life stage (Received, In shop, Sold or moved, Returned or repaired) or an exact status chip to cut the list. Tap When it last changed for Any day, Today, Last 7 days, or Last 30 days. Each row shows Last change in Lagos time. You can search the number. You can also receive a phone that is already in your hands.",
    why: "The unique number is how you prove a phone is yours, sold, or missing. Without it, two black iPhones look the same. Filters and clear times stop staff scrolling a long list when they only need today’s moves.",
    story: "A customer comes back with a Camon 30. The cashier types the IMEI in the top search. The record opens. It shows the invoice, the buyer, and the warranty days left. Nobody has to hunt a notebook.",
    steps: [
      "Click Phone IMEIs.",
      "Tap In shop under the life stages, or tap an exact status chip.",
      "Tap Today under When it last changed if you only want phones that moved today.",
      "Type an IMEI in the search box, or leave it empty and click Search.",
      "Open one number. Read Last change and First booked in Lagos time.",
    ],
    expect: [
      "Coming phones are listed but are not for sale on Sell now.",
      "In shop phones can be sold.",
      "A sold phone shows the invoice number.",
      "The same IMEI cannot be received twice. The system says it is already on the system.",
      "Tapping a stage or chip changes the list below. Showing now marks the active chip.",
    ],
  }),

  ...feature({
    title: "10.4 Shop stock",
    what: "Shop stock is the shelf view. For each item and each open shop you see In shop (you may sell this) and Coming (booked, not here yet). For phones you also see how many IMEIs sit in that shop.",
    why: "Managers used to mix ‘we ordered ten’ with ‘we have ten’. Those are not the same. This page splits them.",
    story: "Challenge calls Iwo Road: ‘Do you have Galaxy S24?’ The Iwo Road manager opens Shop stock. In shop is 0. Coming is 2. They tell Challenge: ‘Two are on the way. They are not on the shelf yet. Do not promise a same-day pickup.’",
    steps: [
      "Click Shop stock.",
      "Find a phone that was booked on Goods on the way but has not arrived.",
      "Find a charger cord row.",
      "Look at shop names. You should see Iwo Road and Challenge only.",
    ],
    expect: [
      "In shop is what you can sell today.",
      "Coming is a separate column. It does not add to In shop until someone confirms arrival.",
      "Charger cords show a dash under IMEIs in shop, because they have no unique number.",
      "Closed Lagos or Abuja shops do not appear here.",
      "If IMEIs in shop and In shop do not match for a phone, a warning asks you to do a stock count. Do not type a new number by hand.",
    ],
  }),

  ...feature({
    title: "10.5 Goods on the way",
    what: "This is the booking page for supplier cartons that have not reached Ibadan yet. Tap All cartons, Still coming, In shop, or Cancelled to cut the list. Each carton shows when it was booked in Lagos time. Super Admin and Goods intake can upload phones (IMEIs), serial items, or a piece count for cords and chargers. A USB scanner works like a keyboard. The list stays Coming until someone says they have arrived. Super Admin can keep a list Hidden, or show it to staff who have this page. Shop to shop is a different page.",
    why: "Cartons leave China or Lagos before your shelf is ready. If you wait to type numbers until the rider arrives, the day is chaos. If you type them too early and mix them with shelf stock, cashiers sell phones that are still on the road.",
    story: "Friday. A carton of ten iPhones and twenty charger cords is on a bus to Iwo Road. Goods intake opens Goods on the way. They pick Iwo Road, Ibadan · HQ. They paste ten IMEIs for iPhone 15 Pro. They add another line, pick Type-C charger cord, and type 20. They save. Shop stock now shows Coming 10 and Coming 20. On Saturday the carton arrives. They click They have arrived — add to shop. In shop goes up. Sell now can now find those IMEIs.",
    steps: [
      "Sign in as Super Admin (admin@abutwins.com) or Goods intake (vault@abutwins.com).",
      "Click Goods on the way.",
      "Pick the shop the carton is going to: Iwo Road or Challenge.",
      "Pick a phone. Paste one IMEI per line. The IMEI must be a real-looking number, at least 14 digits. Click Book goods on the way.",
      "Book a second list: pick a no-number item such as a charger cord and type how many pieces.",
      "If you are Super Admin, click Show to staff who can open this page on a Hidden list.",
      "When you are ready to finish the test, click They have arrived — add to shop.",
    ],
    expect: [
      "A list number like IN-… appears. Status is Coming.",
      "New lists start Hidden. Super Admin sees a button to show or hide.",
      "CEO and Goods intake can see lists they are allowed to see. A cashier with only view rights sees a list only after Super Admin shows it.",
      "Shop stock Coming goes up. In shop does not go up yet.",
      "Sell now does not offer that IMEI until arrival is confirmed.",
      "After arrival, Coming goes down and In shop goes up. The IMEI status becomes In shop.",
      "The same IMEI cannot be booked twice.",
    ],
  }),

  ...feature({
    title: "10.6 Sell now",
    what: "Sell now is the till. You scan or search a phone number or an item name, put it in the cart, pick the buyer, pick cash, transfer, POS, or credit, collect money, and finish. The system then makes an invoice. A USB scanner works like a keyboard: scan, then Enter. A phone camera can read the barcode if the browser allows it. If yesterday had sales and nobody closed that day, Complete sale stays locked for everyone, including Super Admin, until the till is counted. If the line drops and the till is not locked, the sale stays on this device as a parked sale and posts when the line returns. After you have opened Sell now on that phone, a refresh is safe, and you can still scan from the last In shop list saved on that phone.",
    why: "Selling from memory is how phones vanish. Selling after a day with no till count is how cash vanishes. The till only offers what is In shop, and only after older days with sales are closed.",
    story: "Monday at Iwo Road. Sunday had cash sales and nobody closed. The cashier opens Sell now. A red note says the shop has not closed 6 September. Complete sale is locked. They open Close the day, count the drawer, and close Sunday. Sell now opens. A buyer wants a Camon 30. They scan the IMEI. The phone is In shop. They collect transfer and finish. The invoice is created. Later the line drops. They still finish a second sale. It stays on that phone as parked. When the line returns, the banner says send parked work. After it posts, Who did what shows it came from offline.",
    steps: [
      "Sign in as cashier (cashier@abutwins.com) or sales person (sales@abutwins.com).",
      "Click Sell now.",
      "If you see Count the till, do not force a sale. Click the link and close that day first. Super Admin is locked too.",
      "Confirm the shop is the shop you are standing in.",
      "Scan an In shop IMEI, or type it and press Enter. Add it.",
      "Try to search an IMEI that is still Coming. It should not appear.",
      "Pick or add a customer. Do not invent a fake person for a live test if the CEO forbids dummy buyers. For practice, add a clearly marked test buyer only if leadership agrees.",
      "Set the amount paid and the method. Finish the sale.",
      "If the line is down and the till is not locked, finish anyway. You should see that the sale is saved on this device.",
      "While the line is down, scan an IMEI that was In shop when you last opened Sell now. It should add to the cart.",
      "Refresh the page while the line is still down. Sell now should come back, or you should see The till is still here with the parked sale and the shop list.",
    ],
    expect: [
      "If an older day with sales is open, Complete sale is blocked. Parking a new live sale is also blocked.",
      "Coming phones do not appear in the search.",
      "A phone already in the cart cannot be added twice.",
      "If you type a price below the lowest price, the sale is blocked unless Super Admin has allowed that override.",
      "When the sale succeeds you are taken to the invoice page.",
      "Shop stock In shop goes down by one for that phone.",
      "A parked sale shows a banner on every signed-in page until it is sent. After two hours Super Admin, CEO, and the records checker get an alert. If someone wipes it off the device, Who did what records a vanished parked sale.",
      "A refresh while the line is down does not wipe the parked sale.",
      "An IMEI from the last In shop list can be scanned while the line is down. A Coming IMEI cannot.",
      "A new customer cannot be saved while the line is down.",
    ],
  }),

  ...feature({
    title: "10.7 Sales and the printed invoice",
    what: "Sales is the list of every invoice. Tap Paid up, Part paid, or Unpaid to cut the list by money on the bill. Tap Today, Last 7 days, or Last 30 days under When it was sold. Each row has a When column in Lagos time. Open one invoice to collect remaining money, attach a buyer name, or print. The invoice itself cannot be edited. Items, IMEIs, and prices stay as they were on the day of the sale.",
    why: "If staff can change yesterday’s sale, the day’s cash never matches. The paper the buyer holds must match the system.",
    story: "A buyer paid half yesterday. Today they bring the rest. The cashier opens the invoice, types the rest, and posts the collection. The old lines do not change. A new payment line is added. The printed invoice still shows the same phones.",
    steps: [
      "Click Sales.",
      "Open any invoice.",
      "Read the yellow note: This sale cannot be changed.",
      "Scroll to the blue invoice header.",
      "Click Print invoice. (You may cancel the print box after you see the preview.)",
    ],
    expect: [
      "Every sale has an invoice number, such as INV-…",
      "The printable paper has a blue header, the ab mark, Abu Twins, Softskills Investment, the shop name, Iwo Road address, phone, and email.",
      "Columns are Item, IMEI / serial, Qty, and Amount.",
      "Footer says Own The Future.",
      "There is no edit button for items or prices.",
      "If money is still due and a buyer is attached, you can collect the rest.",
      "Super Admin can reverse the last collection if a true mistake was posted. Other jobs cannot.",
    ],
  }),

  ...feature({
    title: "10.8 Customers",
    what: "Customers is the list of buyers. You keep a name and a phone. A sale can start as walk-in, but a return needs a real name first.",
    why: "Warranty and refunds need a person you can call. A nameless sale cannot be returned safely.",
    story: "A walk-in bought a phone in a hurry. Two days later they want a return. The cashier opens the invoice, attaches the buyer name and phone, then starts the return. The invoice lines stay the same.",
    steps: [
      "Click Customers.",
      "Open one customer if any exist.",
      "From a walk-in invoice, attach a buyer only when you have a real name the CEO accepts for the test.",
    ],
    expect: [
      "Customers belong to a shop.",
      "A walk-in invoice shows a warning: Needs a named buyer for returns.",
      "After you attach a name, returns can start.",
    ],
  }),

  ...feature({
    title: "10.9 Suppliers",
    what: "Suppliers is the list of people and companies you buy from.",
    why: "You need one name for each source so money owed to them is clear.",
    story: "Iwo Road buys a carton from a known grey-line supplier. The purchase is tied to that supplier. Money in & out later shows what Abu Twins still owes them.",
    steps: [
      "Click Suppliers.",
      "Read the list.",
      "Open one supplier if you have permission.",
    ],
    expect: [
      "Each supplier has a name you can pick on Goods from supplier and on Goods on the way.",
      "Country and city show where the carton is coming from.",
      "A neighboring dealer is marked Neighboring shop and is used on Neighbor shop fill.",
    ],
  }),

  ...feature({
    title: "10.10 Goods from supplier",
    what: "This page documents expected cartons from named suppliers in other countries and cities. Tap a bill status chip (Received, Part received, Waiting, and so on) to cut the list. Each bill shows when it was booked or received in Lagos time. It is also the trail if a product goes missing. You can see how many were supplied, how many were scanned, how many were sold on invoices (including today before close), and how many the system still says are In shop. Coming is not In shop until the boxes are checked. You can also send a failed unit, including a phone a customer returned to us, back to that supplier. This is not Shop to shop, and it is not Neighbor shop fill.",
    why: "If a phone leaves without a sale, the supplier bill is the first count. Expected minus recorded shows units that never got a number. Still in shop versus the shelf shows units that may have been sold off the books. Sold today helps you check before Close the day.",
    story: "A carton of twenty Tecno units is booked from Dubai to Iwo Road. Eighteen IMEIs are scanned. Two never appear. Later the shelf has sixteen In shop phones, but the bill still says eighteen In shop and two sold on invoices. The manager searches one missing IMEI, opens the bill, and sees it is still In shop on the system with no invoice. That is a missing product, not a typing job. They count stock before close.",
    steps: [
      "Click Goods from supplier.",
      "Add expected goods: supplier, shop, item, quantity, cost, country or city, and due date if you know it.",
      "Open the bill. Book IMEIs as Coming if the carton is still on the road, or confirm they are in this shop if the boxes are on the counter.",
      "Search by IMEI, bill number, supplier, or product when you need that carton trail.",
      "Read Expected, Recorded, Sold on the system, Sold today, and Still in shop. If the shelf is short, count stock.",
      "Pay the supplier as a separate money step.",
      "If a unit must go back, scan those IMEIs on Send back to supplier, or pick Send back to the supplier on Returns.",
    ],
    expect: [
      "Expected, recorded, sold, sold today, and still in shop are separate numbers.",
      "Never scanned versus the bill is expected minus recorded.",
      "Each IMEI on the bill shows its status, shop, and invoice if it was sold.",
      "The origin country or city is visible on the bill.",
      "Coming IMEIs cannot be sold on Sell now.",
      "A unit sent back shows Sent back to supplier. It is not Shop to shop.",
    ],
  }),

  ...feature({
    title: "10.11 Shop to shop",
    what: "Use this when Iwo Road sends phones and accessories that already belong to Abu Twins to Challenge, or the other way. Tap a stage (Waiting to leave, On the way, In that shop) to cut the list. Each send shows when it was booked, sent, or received in Lagos time. You do not tick phones on the screen. You upload a CSV with IMEI, serial, item code, name, quantity, color, and notes. The other Abu Twins shop must confirm the numbers that actually arrived. This is not a supplier carton and not a neighboring dealer.",
    why: "A rider can lose a phone. A long list is easier to check in Excel than on a till screen. If the other shop does not confirm, the system still knows the phones are on the way between our shops, not sold, and not on the old shelf.",
    story: "Iwo Road is sending two iPhones and twenty charger cords to Challenge. The manager downloads the In shop IMEI list, keeps the two iPhone lines, adds a cord line with item code and quantity 20, and uploads the CSV. Challenge opens Shop to shop, pastes the two IMEIs, and confirms. Those phones now show Challenge as the shop. Iwo Road no longer has them In shop.",
    steps: [
      "Sign in as a shop manager.",
      "Click Shop to shop.",
      "Pick Iwo Road as the sending shop and Challenge as the receiving shop.",
      "Download the sample file or Download IMEIs in this sending shop.",
      "Keep only the units that are leaving. Add accessory lines with item code and quantity. Save as CSV.",
      "Upload the file and click Send this list.",
      "Sign in as the Challenge manager (challenge.manager@abutwins.com).",
      "Open the same send and confirm the IMEIs that arrived.",
    ],
    expect: [
      "The send has a transfer number. Status is on the way until Challenge confirms.",
      "The phone’s shop becomes Challenge after confirm.",
      "Iwo Road In shop drops. Challenge In shop rises.",
      "An IMEI that is not In shop at the sending shop is refused.",
      "The other shop must confirm. Sending the file alone is not enough.",
    ],
  }),

  ...feature({
    title: "10.12 Neighbor shop fill",
    what: "A named customer wants a unit this shop does not have. Instead of sending the buyer to another place, staff collect the unit from a neighboring dealer, sell it here, return that dealer their money, and keep the profit. The unit does not sit on our shelf as In shop stock.",
    why: "If this lives in chat, the neighbor is not paid, the customer has no invoice, and nobody can see the profit Abu Twins kept.",
    story: "A buyer at Iwo Road wants a model Challenge also does not have, but the shop next door has it. The cashier records the neighbor, the named customer, the cost to the neighbor, and the sell price. They sell it here. They return the neighbor their cost. Profit stays on Profit.",
    steps: [
      "Add the real customer first if they are not on the list.",
      "Click Neighbor shop fill.",
      "Enter the neighboring shop, the customer, the item, the IMEI if it has one, what the neighbor is owed, and what the customer will pay.",
      "Sell to this customer. Then return money to the neighboring shop.",
    ],
    expect: [
      "An invoice is created. The old pack does not invent a buyer.",
      "Profit equals sell price minus what the neighbor is owed.",
      "Money returned to the neighbor shows as money out. Our profit is not sent with it.",
      "This page is not Shop to shop and not Goods from supplier.",
    ],
  }),

  ...feature({
    title: "10.13 Profit",
    what: "Profit is sell price minus cost on completed shop sales, plus profit kept on neighbor fills, minus approved expenses. Neighbor fill sales are not counted twice.",
    why: "Revenue on Reports is money in. Profit is what remains after cost and bills. The boss asked to see that clearly.",
    story: "The CEO opens Profit. Iwo Road shop sales profit and Challenge neighbor fill profit sit in two columns. Approved fuel is subtracted. Net is the figure for the meeting.",
    steps: [
      "Sign in as CEO or accountant.",
      "Click Profit.",
      "Read shop sales profit, neighbor fill profit, expenses, net, and By shop.",
    ],
    expect: [
      "Neighbor fill invoices do not also inflate shop sales profit.",
      "Figures come from real invoices, fills, and approved expenses.",
      "A cashier without this page does not see it.",
    ],
  }),

  ...feature({
    title: "10.14 Returns",
    what: "A return starts from a sold IMEI. You say why it came back. A manager approves. Then you refund, give credit, send to repair, replace, or send the unit back to the supplier. The old invoice is not rewritten. Tap Waiting, Approved, or Done to cut the list. Each card shows when it was asked, approved, or finished in Lagos time.",
    why: "If staff edit the old sale, the day’s cash lies. A return is a new story that points at the old invoice.",
    story: "A buyer returns a faulty Camon 30. The cashier enters the IMEI and the reason. The shop manager approves. The phone comes back to the shop or goes to repair. The original invoice still shows the sale.",
    steps: [
      "Open a sold invoice that has a named buyer.",
      "Click Returns.",
      "Enter the sold IMEI and the reason.",
      "Ask a manager to open Needs approval and say yes.",
      "Complete the return outcome.",
    ],
    expect: [
      "Walk-in sales block the return until a buyer name is attached.",
      "The old invoice does not change.",
      "The IMEI status can become Returned, move to repair, or become Sent back to supplier.",
      "A refund is a new money record, not an erase.",
    ],
  }),

  ...feature({
    title: "10.15 Swaps",
    what: "A swap is when a customer brings an old phone and takes another. You agree a trade value. A manager approves. You give the new phone, collect or pay the difference, and print an invoice. Tap Waiting, Approved, or Done to cut the list. Each card shows when it started or finished in Lagos time.",
    why: "Swaps mix stock and money. If they stay in chat, the old phone disappears and the new phone is not paid for.",
    story: "A customer trades an iPhone 13 for an iPhone 15. The manager agrees the trade value. The customer pays the difference. The old phone is now shop stock. The new phone is sold on a new invoice.",
    steps: [
      "Click Swaps.",
      "Read the steps: Old phone in, Agree value, Boss approves, New phone out, Balance, Invoice.",
      "If leadership allows a practice swap, complete each step in order.",
    ],
    expect: [
      "Nothing finishes until a manager says yes.",
      "A closed swap has an invoice number.",
      "The old phone and the new phone both have a clear status.",
    ],
  }),

  ...feature({
    title: "10.16 Repairs",
    what: "Repairs is the workshop book. Take the phone in, write the fault, wait for parts if needed, repair, then give it back or put it back in the shop. Tap a stage (Take in, Find fault, Wait for parts, Repair, Give back) to cut the list. Each card shows when it was opened or finished in Lagos time.",
    why: "A phone in a drawer is not ‘in shop’ and is not ‘sold’. The workshop must have its own steps.",
    story: "A sold phone comes back with a charge fault. The engineer logs the IMEI, finds the fault, waits for a part, repairs it, and marks it delivered. The customer record stays on the job.",
    steps: [
      "Sign in as engineer (engineer@abutwins.com).",
      "Click Repairs.",
      "Open a repair or create one if you have a real test phone.",
      "Move the job from one step to the next. Do not jump past the truth.",
    ],
    expect: [
      "Each job has a repair number.",
      "The IMEI is linked.",
      "The status words match the step you picked.",
      "A sales person without repair rights cannot move the job.",
    ],
  }),

  ...feature({
    title: "10.17 Stock count",
    what: "Stock count is when you count one shop with your hands. Use it when Home IMEI vs shop count disagrees, or when a Goods from supplier bill says Still in shop but the shelf has fewer. The system compares your count with the IMEI list. If they differ, a manager must approve before numbers change.",
    why: "A missing product is not a typing job. If a unit left without an invoice, the supplier bill shows Still in shop with no sale. You count the shelf. You do not type a new shop number because it looks low. Count first. Approve second. Then the number may change.",
    story: "Iwo Road opens a Dubai carton bill. It says twenty expected, eighteen recorded, two sold on invoices, and sixteen Still in shop. The shelf has fourteen. The manager searches the two extra IMEIs. Both still say In shop with no invoice. They start Stock count for Iwo Road, enter fourteen, and send it for approval. Only after yes does the shop number change.",
    steps: [
      "If a product looks missing, open Goods from supplier first. Search the IMEI or the bill.",
      "Read Expected, Recorded, Sold on the system, Sold today, and Still in shop.",
      "Click Stock count.",
      "Start a count for Iwo Road or Challenge.",
      "Enter counted quantities from the shelf in front of you.",
      "Send for approval if there is a difference.",
    ],
    expect: [
      "The page shows expected, counted, and the difference.",
      "Stock numbers do not change until a manager approves.",
      "Who did what records the approval.",
      "A supplier bill Still in shop gap is not fixed by typing a new number on Shop stock.",
    ],
  }),

  ...feature({
    title: "10.18 Money in & out",
    what: "This page lists money that moved: collections, pay-outs, and the difference. It also shows what customers still owe and what Abu Twins still owes suppliers. From here you can open Close the day to count the till.",
    why: "Sales pages show goods. This page shows naira.",
    story: "The accountant opens Money in & out on Friday. Money in matches the transfer alerts. Money out shows supplier payments and approved expenses. The difference is the week’s movement, not a guess.",
    steps: [
      "Sign in as accountant (accountant@abutwins.com) or CEO.",
      "Click Money in & out.",
      "Read Money in, Money out, and Difference.",
      "Read the list of movements.",
    ],
    expect: [
      "A finished cash sale appears as money in.",
      "An approved expense that was paid appears as money out.",
      "Figures are in naira.",
      "A link says Close the day and export cash count.",
    ],
  }),

  ...feature({
    title: "10.19 Close the day",
    what: "Close the day is the till count. You pick the business day (Lagos time), see cash expected from cash sales that day, plus transfer, POS, and credit totals, then type the cash you counted. The system stores the difference. Sell now stays locked until every older day that had completed sales is closed. The page opens on the oldest unclosed day. Cashiers and sales people can close the day even if they cannot see the full Money in & out page.",
    why: "If staff keep selling after a day with no count, yesterday’s cash can leave and today’s invoices still look busy. A close writes a name, a time, a shop, expected cash, counted cash, and the shortfall or leftover. That is the only way the drawer is allowed to start a new day of live sales.",
    story: "Sunday at Iwo Road had eight cash sales. Nobody counted. Monday morning Sell now is locked. The cashier opens Close the day. The red list shows 6 September. Cash expected is on the card. They count the drawer, type that number, and add a short note if a note is short. They click Close this day. If another old day is still open, the page jumps there. When the list is empty, Sell now works again.",
    steps: [
      "Sign in as cashier, sales person, shop manager, accountant, CEO, or Super Admin.",
      "Click Close the day on the left, or follow the lock on Sell now, or click the Home task.",
      "Confirm the date at the top is the unclosed day, not today, if yesterday still needs a count.",
      "Read Cash expected, Transfers, POS, and Sales this day.",
      "Count the physical cash. Type that number. Add a short note for shortfall or leftover.",
      "Click Close this day.",
      "If another date is still listed, close that one too. Then open Sell now.",
    ],
    expect: [
      "Unclosed days appear as buttons. The day you are counting is marked.",
      "Cash expected is only cash sales for that business day, not every sale you ever made.",
      "You cannot close the same shop day twice.",
      "After the last unclosed day is closed, Sell now lets you complete a new live sale.",
      "Past closes show business day, shop, expected, counted, and variance. You can download CSV.",
      "Who did what records the close.",
    ],
  }),

  ...feature({
    title: "10.20 Check the books",
    what: "Check the books is the official statement of account. Pick a shop, a period (one day, last 7 days, or this month to date), and an end date in Lagos time. The system reprints money in, money out, till closes, who collected, invoices, and IMEI versus shop count. You can open any of the last 14 days from the chips, or type an older date. Compare with another day or leave it empty to use the previous period. Download a branded PDF, print to save as PDF, or download CSV. The paper has the ab mark, a statement number such as BK-IWO-20260906-20260906, and sign-off lines for prepared, records, and owner.",
    why: "Close the day counts one drawer. Reports is a meeting pack. Check the books is what the accountant and records checker sign. They must be able to open yesterday, last week, or any older day, and see how this period moved against another. The pack must look like a bank paper, not a loose screen dump. It must never change an invoice.",
    story: "Monday morning at Iwo Road. The accountant opens Check the books. Sunday is on the chip strip with eight sales and Closed. They click Sunday. The statement shows cash, transfer, POS, expenses, and the till count. They set Compare with to the Saturday before. Collected is up. They download the branded PDF for the file, and the CSV for Excel. The records checker signs the printed paper. No invoice changed.",
    steps: [
      "Sign in as accountant, records checker, CEO, or Super Admin.",
      "Click Check the books under Money, or open the banner on Who did what.",
      "Pick the shop. Leave Period on One day. Set End date to a past Lagos day, or click that day on Open a previous day.",
      "Read This period against Compared with. Leave Compare with empty for the previous day, or type another date.",
      "Try Compare with yesterday or Compare with same day last week.",
      "Read the statement: verdict, period comparison, money add-up, working paper, invoices, till closes, IMEI vs shop count, and sign-off lines.",
      "Click Download branded PDF. Open the file and confirm the ab mark, statement number, and NGN amounts (not a broken naira sign).",
      "Click Download CSV. Open it in Excel. Confirm the same shop, period, comparison, and invoices.",
      "Click Print / Save PDF if you want a paper copy. You may cancel after you see the preview.",
    ],
    expect: [
      "The header is royal blue with the ab mark, Abu Twins, Softskills Investment, the shop, and Lagos time.",
      "A statement number starts with BK- and the shop code.",
      "Open a previous day lists about two weeks, with sale count and whether the till was closed.",
      "Picked compare says Compared with (picked). Empty compare uses the previous period.",
      "Movement shows NGN and percent for collected, posted, cash, transfer, POS, expenses, and sales count.",
      "Working paper says Pass or Fail. A fail needs a person. A pass is already proved.",
      "The branded PDF writes money as NGN 0 or NGN 1,200. It must not show a colon in front of the number.",
      "The PDF and the print preview hide the left menu and the calculator.",
      "The pack does not edit any invoice. Sales, returns, and closes stay as they were.",
      "A cashier who cannot see Check the books will not find the page. That is correct if Super Admin hid it.",
    ],
  }),

  ...feature({
    title: "10.21 Expenses",
    what: "Expenses is for fuel, rent, salary, and light bill. Staff ask. A manager says yes. Then money can leave. Tap All expenses, Waiting, or Approved to cut the list. Each row shows when it was asked and, if yes, when it was approved, in Lagos time.",
    why: "If anyone can tap cash for ‘fuel’ with no yes, the till will never match.",
    story: "The Challenge manager asks for fuel money. The request waits on Needs approval. The CEO says yes. Then the pay-out is recorded.",
    steps: [
      "Click Expenses.",
      "Create a small test expense only if leadership agrees, for example a ₦1 practice line marked TEST.",
      "Open Needs approval as a manager and say yes or no.",
    ],
    expect: [
      "A new expense waits. Money does not leave until yes.",
      "A no leaves the expense rejected.",
      "A yes then allows the pay-out to show in Money in & out.",
    ],
  }),

  ...feature({
    title: "10.22 Needs approval",
    what: "This is the yes-or-no desk. Swaps, refunds, expenses, and stock counts wait here. Tap Waiting, Approved, or Rejected to cut the list. Each request shows when it was asked in Lagos time.",
    why: "One place is better than ten WhatsApp chats.",
    story: "The CEO opens Needs approval each morning. Three items wait. Two expenses are yes. One odd stock count is no until the manager recounts.",
    steps: [
      "Sign in as CEO or shop manager.",
      "Click Needs approval.",
      "Open an item. Read who asked and why.",
      "Say yes or no.",
    ],
    expect: [
      "The top of the page says how many are waiting.",
      "After yes, the original work can continue.",
      "After no, the work stops.",
      "A cashier without approve rights cannot see the yes button.",
    ],
  }),

  ...feature({
    title: "10.23 Shops",
    what: "Shops lists Iwo Road as HQ and Challenge as Open. Super Admin can open a new shop anywhere in Nigeria. Super Admin can close a shop. Closed shops stay in a Super Admin-only list so old sales are not lost.",
    why: "Abu Twins will grow. The software must not be rebuilt for each new city.",
    story: "Next year Abu Twins may open in Ilorin. Super Admin types the shop name, a short code, and the address. Staff in Ilorin then work in that shop only.",
    steps: [
      "Sign in as CEO. Click Shops.",
      "Confirm you see Iwo Road, Ibadan · HQ and Challenge, Ibadan.",
      "Confirm you do not see Lagos or Abuja as open shops.",
      "Sign in as Super Admin. Confirm a Closed list exists for old shops, and an Open a new shop form is there.",
    ],
    expect: [
      "CEO sees only the two Ibadan shops.",
      "Iwo Road has the HQ badge.",
      "Challenge has the Open badge.",
      "Only Super Admin can open or close a shop.",
    ],
  }),

  ...feature({
    title: "10.24 Staff",
    what: "Staff is the people list. Super Admin or a shop manager (if allowed) can add a person, pick their job, and pick their shop. Super Admin can lock a login.",
    why: "A person who leaves the company must not keep a key to the till.",
    story: "A new cashier starts at Challenge. Super Admin adds their work email, sets job to Cashier, sets shop to Challenge, and gives them a first password. After they sign in, Super Admin asks them to change it.",
    steps: [
      "Sign in as Super Admin.",
      "Click Staff.",
      "Read names, jobs, shops, and Active or Disabled.",
      "Do not disable the only Super Admin during a test.",
    ],
    expect: [
      "Each test person in section 12 appears.",
      "Challenge manager shows Challenge, Ibadan.",
      "Disable stops that person from signing in.",
      "Restore lets them sign in again.",
    ],
  }),

  ...feature({
    title: "10.25 Who can see what",
    what: "This page is Super Admin only. You tick the pages and the work for each job. Super Admin is not ticked here because Super Admin always has all rights.",
    why: "The CEO may want the accountant to see money but not Sell now. That should be a tick, not a phone call to Techvaults.",
    story: "The CEO asks that cashiers must not see Reports. Super Admin opens Who can see what, finds Cashier, unticks Reports, and saves. The cashier signs out and in. Reports is gone.",
    steps: [
      "Sign in as Super Admin.",
      "Click Who can see what.",
      "Open Cashier. Confirm Sell now is ticked and Goods on the way is not ticked unless you want it.",
      "Save only if you mean to change a live rule. For a first read, do not untick things at random.",
    ],
    expect: [
      "CEO who opens this address is sent away. Only Super Admin may use it.",
      "Ticks you save change that job on the next visit.",
      "Super Admin cannot remove Super Admin rights here. That is by design.",
    ],
  }),

  ...feature({
    title: "10.26 Reports",
    what: "Reports shows sales, money collected, stock value, swaps, returns, and who still owes, for every completed record you can see. On screen it is a dashboard. Print or download gives a branded management report with the ab mark, shop books, people who still owe, unpaid supplier invoices, and low stock. The pack does not change any invoice.",
    why: "Home is a snapshot. Reports is the pack you take to a meeting. It must look like a company paper, not a screen dump with buttons.",
    story: "Friday review. The CEO opens Reports, then downloads the branded PDF. Iwo Road and Challenge sit on one page. Low stock is listed. The Check the books button is not on the paper. Nobody copies numbers from a notebook.",
    steps: [
      "Sign in as CEO.",
      "Click Reports.",
      "Read sales, collected money, and stock on the screen.",
      "Click Download branded PDF. Open the file and confirm the ab mark and NGN amounts.",
      "Click Print / Save PDF. Confirm the paper has the blue header and no buttons. You may cancel after the preview.",
    ],
    expect: [
      "Numbers match the shops you are allowed to see.",
      "The printed pack has the ab mark, a report number starting with RP-, shop books, and sign-off footer.",
      "Check the books, Print, and CSV buttons do not appear on the printed paper.",
      "A cashier without Reports does not see this page.",
    ],
  }),

  ...feature({
    title: "10.27 Who did what",
    what: "This is the diary of the system. It shows who did an important action, when, and what changed, in shop words. The time uses Lagos words such as Today, 14:30. Nothing here is deleted. It also keeps line-down time, parked sales that posted, parked sales that sat too long, and parked sales that vanished from a device. Those last two are marked high risk. At the top it may show the books verdict. Click that banner to open Check the books.",
    why: "When two people disagree, the diary settles it. When cash sat on a phone with no invoice, the diary names the person and the device.",
    story: "A phone is missing. The records checker opens Who did what, finds the last shop-to-shop send, and sees who confirmed it at Challenge. The same morning an alert says a parked sale vanished. They filter high risk, open the parked sale line, and see who was signed in on that device when the queue disappeared.",
    steps: [
      "Sign in as CEO or records checker.",
      "Click Who did what.",
      "Read the books banner if it is there. Click it to open Check the books.",
      "Find a recent sale, incoming booking, or day close.",
      "If Home said a parked sale vanished, filter high risk or open the alert link.",
    ],
    expect: [
      "You see time, person, action, and what changed in everyday words.",
      "There is no delete button.",
      "A sale that posted after the line returned is marked as posted from offline.",
      "A vanished parked sale shows as a high-risk parked sale that left this device.",
      "The books banner, when present, opens Check the books.",
    ],
  }),

  ...feature({
    title: "10.28 Alerts",
    what: "Alerts are short notices: low stock, a request waiting, a parked sale sitting too long, a parked sale that vanished, or other shop warnings. Super Admin, the CEO, and the records checker get the parked-sale alerts.",
    why: "People miss a page. They should not miss a danger. A parked sale with cash in a drawer and no invoice is a danger.",
    steps: [
      "Click Alerts.",
      "Open one alert if any exist.",
    ],
    expect: [
      "The bell on the top bar may show a count.",
      "Low stock uses the number set in Settings.",
      "Parked sale sitting too long points to Sell now.",
      "Parked sale disappeared points to Who did what.",
    ],
    story: "A cashier parked a cash sale when the line dropped, then left the phone. After two hours the CEO sees Parked sale sitting too long. They walk to the till before the cash can walk.",
  }),

  ...feature({
    title: "10.29 Settings",
    what: "Settings holds the shop name, phone, address, and email that print on invoices and on Check the books. It also holds the low stock alert, default warranty days, and whether cashiers may sell below the lowest price. Only Super Admin can change these. Super Admin can also download a shop backup: a copy of shops, staff emails (not passwords), stock, IMEIs, sales, and purchases. Keep that file off this computer.",
    why: "The invoice header and the books statement should be the real Ibadan address, not a leftover Lagos line. A backup is how you keep a copy if the computer fails. It is not a way to sell, and it is not a password list.",
    story: "Techvaults set the invoice address to Iwo Road, Ibadan, Oyo State and the phone to 07062454854. If the phone number changes, Super Admin updates Settings. The next printed invoice and the next books PDF show the new number. Before a long holiday, Super Admin downloads a shop backup and keeps it off the till computer.",
    steps: [
      "Sign in as Super Admin.",
      "Click Settings.",
      "Read Shop name on invoices, Address on invoices, and Phone on invoices.",
      "Read Shop backup. Download shop backup only if leadership wants a copy kept off this computer.",
      "Do not change live details during a first test unless the CEO asks.",
    ],
    expect: [
      "CEO can read settings but cannot change them. CEO does not see Download shop backup.",
      "Printed invoices and the books statement use these values.",
      "The backup file is a shop copy. It does not show passwords.",
    ],
  }),

  ...feature({
    title: "10.30 Shop calculator",
    what: "A round button sits on every signed-in page. It opens a simple calculator. Add, subtract, multiply, and divide. It does not post money. It does not change an invoice. Close it when you are done.",
    why: "A cashier or accountant often needs to add a line by hand while they look at the till or the books. They should not leave the system for a phone calculator and lose the page.",
    story: "The cashier is on Close the day. Notes in the drawer are mixed. They tap the calculator, add the notes, type that total as counted cash, and close the day.",
    steps: [
      "Sign in as any job.",
      "Click the calculator button.",
      "Add two numbers. Confirm the total.",
      "Close the calculator. Confirm the page you were on did not change.",
    ],
    expect: [
      "The calculator is on Home, Sell now, Close the day, and Check the books.",
      "It does not appear on a printed invoice or a printed books statement.",
      "No sale, expense, or close is created when you use it.",
    ],
  }),

  ...feature({
    title: "10.31 How to use this",
    what: "How to use this is the in-system handbook. Every signed-in person can open it from Start, from the top bar, or from search. The book is built for that login only. A cashier sees Sell now and Close the day. They do not see Who can see what or Settings. Super Admin sees every page. You can look up a word on the screen. Print or Save PDF makes a branded paper with the ab mark, the job name, and a number such as HB-CASHIER-20260907. Print includes the full book even if you filtered the screen.",
    why: "Staff should not hunt a Word file when they are at the till. They need a book that matches the buttons in front of them, not a book for every job in the company.",
    story: "Blessing is on the Iwo Road till. A buyer asks for a return. She opens How to use this, types return, and reads that a walk-in needs a name first. She prints the cashier book for the drawer so the next shift can look it up without asking her.",
    steps: [
      "Sign in as cashier@abutwins.com.",
      "Click How to use this under Start, or the same words on the top bar.",
      "Confirm the header says Cashier and a HB- number.",
      "Type return in Look up a page, button, or word. Confirm Returns stays and Who can see what is not in the book.",
      "Click Print / Save PDF. Confirm the paper has the ab mark and hides the left menu.",
      "Sign out. Sign in as ceo@abutwins.com. Open How to use this. Confirm Who can see what is still missing, and Check the books is there.",
      "Sign in as admin@abutwins.com. Confirm Who can see what and Settings are in the Super Admin book.",
    ],
    expect: [
      "The cashier book has Home, Sell now, Sales, Customers, Returns, Alerts, Close the day, and Your login.",
      "The cashier book does not have Who can see what, Settings, or Goods on the way.",
      "The CEO book does not have Who can see what. The CEO can read Settings but cannot change them.",
      "Print still includes every section for that job after a lookup filter.",
      "The paper uses the shop name and address from Settings.",
    ],
  }),

  ...feature({
    title: "10.32 The till is still here",
    what: "After Sell now has been opened on a phone, that phone can keep the till if the line drops. It also keeps the last In shop IMEIs and named customers. A refresh does not wipe a parked sale. If the phone cannot rebuild Sell now, it opens The till is still here. That page lists parked sales and lets the cashier sell from the saved list. The invoice is only born when the line returns and the sale posts.",
    why: "A cashier who refreshes on a dead line used to see a dead screen. Even with the till open, a scan needed the server. That is how a buyer walks and the sale is written in a notebook.",
    story: "Blessing opens Sell now at Iwo Road. The line drops. A buyer wants the Camon 30 she already saw on the shelf. She scans that IMEI from the list on the phone, parks the cash sale, and refreshes. The till is still here shows the parked sale and the remaining In shop list. When the line returns, she sends parked work. Who did what shows it came from offline.",
    steps: [
      "Sign in as cashier@abutwins.com.",
      "Open Sell now while the line is up.",
      "Turn the line off. Scan an In shop IMEI. Finish the sale if the till is not locked.",
      "Refresh. Confirm Sell now returns, or The till is still here lists the parked sale and the shop list.",
      "Confirm a new customer form is not offered while the line is down.",
      "Turn the line on. Send parked work now.",
    ],
    expect: [
      "The parked sale is still on the device after a refresh.",
      "The last In shop IMEI can be scanned while the line is down.",
      "The till is still here shows the item count, the amount, and Sell from the list on this phone.",
      "After send, Who did what has the posted-from-offline trail.",
      "No invoice is created until the server accepts the parked sale.",
    ],
  }),

  ...feature({
    title: "10.33 Your login",
    what: "Your login is where a person changes their own password. It sits beside the job name on the top bar, with How to use this and Sign out. Super Admin can see that the password changed in Who did what. Super Admin cannot see the new password.",
    why: "Practice passwords such as admin123 must not stay on a live shop. Each person should set a password only they know.",
    story: "Blessing finishes training at Iwo Road. She opens Your login, types the practice password, then a new password twice, and saves. The next morning the old practice password does not let her in. Who did what shows that her password was changed.",
    steps: [
      "Sign in with a practice login.",
      "Click Your login on the top bar.",
      "Type the current password, a new password, and the same new password again.",
      "Click Save new password.",
      "Sign out. Sign in with the new password.",
    ],
    expect: [
      "The page title is Your login, not a computer word.",
      "After save, the old password does not work.",
      "Who did what records that the password was changed, not the password itself.",
    ],
  }),


  ...feature({
    title: "10.34 Each shop keeps its own records",
    what: "Every sale, customer, phone, supplier bill, and expense belongs to the shop that made it. A person who works at one shop sees only that shop. This is not a menu setting that can be missed. It is checked on the shop system itself, every time a record is opened.",
    why: "Three shops now share one system. A cashier at Bodija must not read what Iwo Road sold, what an Iwo Road customer owes, or which phones Iwo Road is holding. Staff move between shops, links get pasted into WhatsApp, and old links stay in browser history. The shop that owns a record is what decides who may open it, not how careful a person is with a link.",
    story: "Folake at Bodija is sent a link by mistake. It is an Iwo Road invoice. She opens it and gets nothing at all: not the customer name, not the amount, not even a message telling her the invoice exists. Aisha, her shop manager, opens the same link and also gets nothing, because she runs Bodija and not Iwo Road. Abu Twins opens it from head office and sees it in full.",
    steps: [
      "Sign in as admin@abutwins.com and open any sale under Sales. Copy the web address.",
      "Sign out. Sign in as bodija.cashier@abutwins.com.",
      "Paste that web address and press enter.",
      "Try the same with a customer page and a phone page from another shop.",
      "Sign in again as admin@abutwins.com and open the same address.",
    ],
    expect: [
      "The Bodija cashier gets nothing for another shop's sale, customer, or phone.",
      "The page does not say the record exists somewhere else. A shop cannot learn what another shop is holding by trying links.",
      "Staff only shows the people in your own shop. A Bodija manager cannot add a person to Iwo Road.",
      "Head office opens all of it.",
    ],
  }),

  ...feature({
    title: "10.35 Looking at one shop, or all three together",
    what: "Head office roles get a shop picker at the top of every screen. It offers All shops together, Iwo Road, Bodija, and Challenge. Whatever is picked changes what every screen reports: Home, Sales, Shop stock, Money in and out, Reports, Profit, and the rest.",
    why: "The CEO needs two different answers on the same day. One is how the business is doing, all three shops added together. The other is how Bodija alone is doing, so a weak shop can be seen instead of being hidden inside a healthy total. Before this, head office could only ever see the three shops mixed into one figure.",
    story: "At the Monday meeting Abu Twins opens Home on All shops together and reads the month. Then he picks Bodija. Sales, stock value, what customers still owe, and the low-stock list all change to Bodija only. He sees that Bodija is carrying stock it is not selling. He picks Iwo Road and compares. Nothing was exported and no report had to be requested.",
    steps: [
      "Sign in as ceo@abutwins.com or admin@abutwins.com.",
      "Look at the top of the screen for the shop picker beside the search box.",
      "Leave it on All shops together and note the figures on Home.",
      "Pick Bodija. Watch the same figures change to Bodija only.",
      "Open Sales, Shop stock, and Reports while still on Bodija.",
      "Pick All shops together again.",
      "Sign in as cashier@abutwins.com and look for the picker.",
    ],
    expect: [
      "The picker lists All shops together and the three Ibadan shops.",
      "Picking a shop changes every screen, not only Home.",
      "The choice stays as you move around the system, until you change it or sign out.",
      "A cashier, shop manager, goods intake, or repair engineer never sees the picker. They already only see their own shop.",
      "Picking one shop does not stop head office correcting a record at another shop. It changes what is being read, not what may be done.",
    ],
  }),

  ...feature({
    title: "10.36 Two tills cannot sell the same phone",
    what: "When a sale is completed, the system takes the phone at the same moment it writes the invoice, and only if that phone is still In shop at that shop. If two people complete a sale on the same phone at the same second, one sale is written and the other is refused with a plain message.",
    why: "One phone is one phone. Two tills at Iwo Road can have the same IMEI on screen at the same time, because both loaded their list a minute ago. Without this, both sales complete, the shop has two invoices and one phone, and the difference is only found at stock count, long after the customers have gone. The same protection covers accessories, so shop stock can never go below zero, and money owed by a customer, so two clerks collecting at once cannot wipe out each other's entry.",
    story: "A customer at Iwo Road is being served by Tunde while Blessing is finishing a different sale for the same iPhone, brought to her by a second customer. Both press Complete sale within a second of each other. Tunde's sale is written. Blessing's screen says the phone was just taken by another till, and nothing is written: no invoice, no money entry, no change to stock. She tells her customer and finds another unit.",
    steps: [
      "Open Sell now on two different computers or browsers, both signed in to the same shop.",
      "Scan the same IMEI into both carts.",
      "Complete the sale on the first one.",
      "Complete the sale on the second one.",
      "Open Sales and count the invoices for that IMEI.",
      "Open the phone under Phone IMEIs and read its diary.",
    ],
    expect: [
      "The first till gets an invoice.",
      "The second till is told the phone was just taken by another till, and is asked to refresh.",
      "There is exactly one invoice for that phone, never two.",
      "Nothing half-happened on the refused sale. No money entry, no stock change, no customer debt.",
    ],
  }),

  ...feature({
    title: "10.37 Buttons tell you they are working",
    what: "Every button that saves something says so while it is working, and refuses to be pressed again until it is done.",
    why: "Shop internet is not always fast. A cashier presses Complete sale, the screen looks unchanged for two seconds, and the natural thing is to press again. The shop system now refuses the second press, and, just as importantly, says out loud that the first one is being dealt with.",
    story: "Ngozi at Challenge completes a sale on a slow afternoon. The button changes to Working and goes grey. She waits. The invoice opens. She never wonders whether she has charged the customer twice.",
    steps: [
      "Open any screen with a save button, such as Sell now, Expenses, or Customers.",
      "Fill the form in and press the button once.",
      "Try to press it again straight away.",
      "Turn the internet off on the device and press a save button.",
    ],
    expect: [
      "The button greys out and says it is working.",
      "A second press does nothing while the first is still going.",
      "With no line, you are told the message did not reach the shop system, instead of the button spinning with no word.",
    ],
  }),

  ...feature({
    title: "10.38 Screens keep themselves current",
    what: "Screens quietly ask the shop system for the current picture every so often, so figures change on their own as the shops trade.",
    why: "A sale rung up at Bodija used to be invisible at Iwo Road until somebody opened the page again. A manager watching Home during the day was often reading a picture from an hour ago and did not know it.",
    story: "Abu Twins leaves Home open on All shops together during the afternoon. Sales are made at all three shops. The figures on his screen move up through the day without him touching anything.",
    steps: [
      "Sign in as admin@abutwins.com and leave Home open.",
      "On another device, sign in as a cashier and complete a sale.",
      "Go back to the first screen and wait without clicking.",
      "Now start typing in a form and leave it half-filled for a minute.",
      "Move to another browser tab for a while, then come back.",
    ],
    expect: [
      "The figures on Home move up on their own within about a minute.",
      "A form you are typing into is never disturbed or cleared while you are in it.",
      "A cart you are building at the till stays exactly as you left it.",
      "Nothing is fetched while the tab is in the background or while the line is down, so a phone in a pocket does not burn shop data.",
      "Coming back to the tab shows current figures straight away.",
    ],
  }),


  ...feature({
    title: "10.39 Upload stock. Supplier bill, one item, or many from Excel",
    what: "Upload stock puts what is on the shelf into the system and creates a real Goods from supplier bill. First, staff start an upload bill: shop, supplier, and paid or not paid. That bill gets a unique PO number and a running submission value from cost. Add one item to the shelf then books each IMEI, serial, or piece count under that same PO until the bill is closed. The Abu Twins opening stock Excel still loads a full shop at once: pick shop, supplier, and payment status, then upload PHONES, ACCESSORIES, SCREEN, and LAPTOPS. Unpaid bills show on Finance as still owed. Older four-step sheet uploads sit under Advanced.",
    why: "Accountants and auditors need to know who supplied the stock, what it cost, whether it was paid, and which PO to open. Loading phones without that trail leaves money and goods unlinked. One session bill keeps a carton together. Excel still saves the big opening count.",
    story: "Challenge receives part of a Dubai carton. The uploader starts an upload bill for that supplier, marks it not paid yet, and scans three iPhone 17 Pro Max units under the same PO. Finance shows the submission value as still owed. That evening, Bodija uploads its full opening stock Excel with the same supplier marked paid. A new PO appears on Goods from supplier as Loaded on Upload stock. Sell now works on real shelf units the next morning.",
    steps: [
      "Sign in as uploader@abutwins.com or Super Admin.",
      "Open Upload stock from the left menu, under Stock.",
      "Start an upload bill: pick the shop, the supplier, and whether it is paid.",
      "Add each unit: pick or add the item name, scan or type the IMEI, serial, or piece count, then save. Confirm the fields clear and the bill value grows.",
      "Close the bill when that carton is finished, or leave it open to add more.",
      "For a full shop load, scroll to Abu Twins opening stock Excel, pick shop, supplier, and paid or not paid, then upload the file.",
      "Open Goods from supplier and Finance. Confirm the PO, submission value, and owed amount.",
    ],
    expect: [
      "An open upload bill shows the PO number, supplier, submission value, and paid or not paid.",
      "A phone with an IMEI books In shop, links to the PO, and raises the shelf count by one.",
      "A cord with no number raises the piece count and the bill value by cost times quantity.",
      "Unpaid upload bills appear under Still owed to suppliers.",
      "Goods from supplier labels upload bills as Loaded on Upload stock.",
      "A good opening stock file creates its own PO and books stock for that shop.",
      "A file with a bad line loads nothing and names the tab and line to fix.",
    ],
  }),

  ...feature({
    title: "10.40 Stock uploader. A job that only loads data",
    what: "A job whose whole purpose is putting stock and item names into the system. It sees Upload stock, the item list, Goods from supplier (to open the PO it created), the phone list, and shop stock. It cannot sell, cannot open money pages to post payments, cannot approve anything, and cannot add staff.",
    why: "Loading the shops is powerful work and it is usually done by whoever is helping to set the system up, sometimes from outside the shop. That person needs no ability to sell or to move cash. Giving them one narrow job means the door they hold opens one room.",
    story: "Techvaults is helping Abu Twins load the three shops. They are given the Stock uploader login. They start upload bills, load Excel files, and open each PO to check the submission value. At no point can they open Money in and out to pay a supplier, ring up a sale, or see what a customer owes.",
    steps: [
      "Sign in as uploader@abutwins.com.",
      "Look at the left menu and note how short it is.",
      "Type /finance at the end of the web address and press enter.",
      "Try /pos, /sales, and /staff the same way.",
      "Open Goods from supplier and find a bill marked Loaded on Upload stock.",
      "Sign in as manager@abutwins.com and try to open Upload stock.",
      "Sign in as admin@abutwins.com and open Who did what.",
    ],
    expect: [
      "The uploader is sent back to Home from any page outside its job.",
      "A shop manager cannot open Upload stock at all.",
      "Super Admin can still do everything, including uploading.",
      "The CEO can see every figure in the business but does not load data. That is the uploader's job.",
      "Every refused attempt is written into Who did what as a high-risk line, with the job that tried it.",
    ],
  }),

  ...feature({
    title: "10.41 Receipts. What the customer goes home with",
    what: "Every finished sale can be handed over three ways. Printed from the sale, saved as a file to send to the customer, or printed for a whole stretch of days at once from Sales.",
    why: "A customer who has spent several hundred thousand naira on a phone wants something in their hand. A customer who comes back in six months with a warranty question needs the shop to find that sale. And accounts want the day's receipts together, not one at a time.",
    story: "Blessing finishes a sale at Iwo Road. The receipt opens and starts printing on its own while the customer is still at the counter. Later the customer asks for a copy on WhatsApp, so Blessing opens the sale and saves the receipt as a file to send. At the end of the month, accounts opens Sales, picks the first and last day, and downloads every receipt for that stretch in one file.",
    steps: [
      "Sign in as cashier@abutwins.com and complete a sale at Sell now.",
      "Watch what happens as soon as the sale is saved.",
      "On the same sale, press Download receipt.",
      "Open Sales, find Print a stretch of receipts, pick a first and last day, and download.",
      "Open a sale from a week ago and check it does not print by itself.",
    ],
    expect: [
      "Finishing a sale opens the receipt and the print box appears on its own.",
      "Download receipt saves a file named after the invoice number.",
      "The receipt shows the shop, the IMEI of each phone, the warranty, what was paid, and anything still owing.",
      "A stretch of days downloads as one file with one receipt to a page.",
      "Opening an old sale later shows the receipt but does not print by itself.",
      "None of this changes the sale. A receipt only reprints what the sale already says.",
    ],
  }),

  h1("11. One full day in Ibadan"),
  body("This story ties the pages together. Read it aloud in a training room."),
  h3("Morning at Iwo Road"),
  body("Goods intake signs in. A carton is still on the road. They open Goods on the way and paste IMEIs. They also book 20 charger cords with no number. Shop stock now shows Coming. Cashiers cannot sell those phones."),
  h3("Midday"),
  body("The carton arrives. Goods intake clicks They have arrived — add to shop. Super Admin shows the list to the Iwo Road manager so the floor team can see what just landed."),
  h3("Afternoon"),
  body("A buyer takes a Camon 30. The sales person uses Sell now, types the IMEI, and collects a transfer. The invoice prints with the blue header. The buyer leaves with a paper."),
  h3("Late afternoon"),
  body("Iwo Road sends one spare phone to Challenge. Challenge confirms the IMEI. Both shop stocks update."),
  h3("Evening"),
  body("The cashier opens Close the day. They count the cash against cash sales for this Lagos business day. They type the counted number. If it is short, they write why. After the close, Sell now can open tomorrow without a lock from today."),
  body("The accountant checks Money in & out, then opens Check the books for this Lagos day. They compare it with yesterday, download the branded PDF for the file, and leave the CSV for Excel. The CEO opens Home. IMEI vs shop count should say Match. Reports is for the meeting. Who did what shows every step, including the close. Nobody edited an old invoice."),

  h1("12. Practice logins for testing"),
  noteBox("These logins are for testing only", [
    "Techvaults put these people in the system so Abu Twins can try every job. They are not your final staff list.",
    "Change every password after you finish testing. Super Admin can lock or remove any practice login.",
    "Do not use these passwords for real daily work. Do not send this page to the public.",
    "When you are ready to go live, Super Admin should add real staff emails and disable the practice ones you do not need.",
  ]),
  para("", { after: 160 }),
  para("Website for the test: https://inventory-sys-production.up.railway.app", { bold: true }),
  body("There are twenty practice logins: five at head office and five in each of the three shops. That is every job, in every shop, so any workflow in this book can be tried by the person who would really do it."),
  h3("Head office (sees all three shops)"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Super Admin", "TechVaults Admin", "admin@abutwins.com", "admin123"],
      ["CEO", "Abu Twins", "ceo@abutwins.com", "ceo123"],
      ["Records checker", "Amaka Okonkwo", "auditor@abutwins.com", "auditor123"],
      ["Accountant", "Chinedu Bassey", "accountant@abutwins.com", "accountant123"],
      ["Stock uploader", "Data Uploader", "uploader@abutwins.com", "uploader123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
  para("", { after: 200 }),
  h3("Iwo Road, Ibadan (head office shop)"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Shop manager", "Halima Yusuf", "manager@abutwins.com", "manager123"],
      ["Goods intake", "Ibrahim Lawal", "vault@abutwins.com", "vault123"],
      ["Cashier", "Blessing Adeyemi", "cashier@abutwins.com", "cashier123"],
      ["Sales person", "Tunde Adebayo", "sales@abutwins.com", "sales123"],
      ["Repair engineer", "Kelechi Nwosu", "engineer@abutwins.com", "engineer123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
  para("", { after: 200 }),
  h3("Bodija, Ibadan"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Shop manager", "Aisha Bello", "bodija.manager@abutwins.com", "manager123"],
      ["Goods intake", "Emeka Obi", "bodija.vault@abutwins.com", "vault123"],
      ["Cashier", "Folake Adisa", "bodija.cashier@abutwins.com", "cashier123"],
      ["Sales person", "Sadiq Abubakar", "bodija.sales@abutwins.com", "sales123"],
      ["Repair engineer", "Chidera Okafor", "bodija.engineer@abutwins.com", "engineer123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
  para("", { after: 200 }),
  h3("Challenge, Ibadan"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Shop manager", "Fatima Sule", "challenge.manager@abutwins.com", "manager123"],
      ["Goods intake", "Segun Oyelaran", "challenge.vault@abutwins.com", "vault123"],
      ["Cashier", "Ngozi Eze", "challenge.cashier@abutwins.com", "cashier123"],
      ["Sales person", "Musa Danjuma", "challenge.sales@abutwins.com", "sales123"],
      ["Repair engineer", "Yemi Ogunleye", "challenge.engineer@abutwins.com", "engineer123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
  para("", { after: 200 }),
  noteBox("The one test that proves your records are safe", [
    "Sign in as bodija.cashier@abutwins.com. Copy the web address of an Iwo Road invoice from another browser tab and paste it in.",
    "You should get nothing. A Bodija cashier cannot read an Iwo Road sale, an Iwo Road customer, or an Iwo Road phone, even with the exact link in their hand.",
    "Then sign in as admin@abutwins.com and open the same link. It opens. Head office sees everything. A shop sees only itself.",
  ]),
  para("", { after: 200 }),
  h3("Who should try which test"),
  table(
    ["If you want to try…", "Sign in as"],
    [
      ["Everything, including show/hide coming goods and Who can see what", "admin@abutwins.com"],
      ["Seeing all shops and reports, without changing access ticks", "ceo@abutwins.com"],
      ["Booking goods before they arrive", "vault@abutwins.com"],
      ["Selling, printing an invoice, and closing the day", "cashier@abutwins.com or sales@abutwins.com"],
      ["Running Challenge shop", "challenge.manager@abutwins.com"],
      ["Running Bodija shop", "bodija.manager@abutwins.com"],
      ["Proving one shop cannot read another shop records", "bodija.cashier@abutwins.com, then admin@abutwins.com"],
      ["Looking at one shop, then all three together", "admin@abutwins.com or ceo@abutwins.com"],
      ["Loading the shops from an Excel sheet", "uploader@abutwins.com"],
      ["Checking that the uploader cannot sell or see money", "uploader@abutwins.com, then try /pos and /finance"],
      ["Repair steps", "engineer@abutwins.com"],
      ["Money pages and Check the books", "accountant@abutwins.com"],
      ["Checking the diary and signing the books", "auditor@abutwins.com"],
      ["The handbook for one job only", "Any practice login, then How to use this"],
    ],
    [5200, 4160]
  ),

  h1("13. Full test plan"),
  body("Use this table in a training session. Tick the last column on paper if you like. Expected results are in section 10."),
  table(
    ["#", "Test", "Sign in as", "Pass when"],
    [
      ["1", "Sign in and see Techvaults at the bottom of login", "Any practice login", "You enter. The login footer shows Techvaults Limited."],
      ["2", "Wrong password is refused", "Any email + bad password", "The red message appears. You stay on Sign in."],
      ["3", "CEO cannot open Who can see what", "ceo@abutwins.com", "That page is missing or sends you away."],
      ["4", "Shops show only Ibadan", "ceo@abutwins.com", "Iwo Road HQ and Challenge. No open Lagos or Abuja."],
      ["5", "Book a phone IMEI as Coming", "vault@abutwins.com", "A Coming list is created. Sell now cannot find that IMEI."],
      ["6", "Book charger cords with no number", "vault@abutwins.com", "Coming rises by the piece count. No IMEI is asked."],
      ["7", "Super Admin shows a hidden list", "admin@abutwins.com", "Badge changes from Hidden to Shown to staff."],
      ["8", "Mark goods arrived", "vault@abutwins.com", "Coming drops. In shop rises. IMEI becomes In shop."],
      ["9", "Unclosed day locks Sell now", "cashier@abutwins.com after a day with sales and no close", "Complete sale is blocked. A note names the unclosed date."],
      ["10", "Close that day, then sell", "cashier@abutwins.com", "Close the day opens the oldest unclosed date. After close, Complete sale works."],
      ["11", "Sell an In shop phone", "cashier@abutwins.com", "Invoice is created. Phone becomes Sold."],
      ["12", "Scan or type IMEI", "cashier@abutwins.com", "USB scan plus Enter, or camera, adds the In shop phone."],
      ["13", "Print invoice", "cashier@abutwins.com", "Blue header, Iwo Road address, IMEI column, totals."],
      ["14", "Invoice cannot be edited", "Any seller", "No way to change items or prices."],
      ["15", "Parked sale when the line drops", "cashier@abutwins.com with line down", "Sale stays on the device. Banner says send it when the line returns. Who did what gets the trail."],
      ["16", "Home IMEI vs shop count", "ceo@abutwins.com", "The table is always there. Match or a gap is shown for each phone and laptop."],
      ["17", "Shop to shop CSV Iwo Road to Challenge", "Both shop managers", "CSV of In shop IMEIs uploads. Challenge must confirm. Then stock moves. This is not Goods from supplier."],
      ["18", "Return needs a named buyer", "cashier@abutwins.com", "Walk-in is blocked until a name is attached."],
      ["19", "Expense waits for yes", "manager@abutwins.com then CEO", "Money does not leave before approval."],
      ["20", "Who did what keeps the story", "auditor@abutwins.com", "The sale, close, or parked trail appears with a name and time."],
      ["21", "Cashier does not see Super Admin pages", "cashier@abutwins.com", "No Settings change, no Who can see what, no undo money. Close the day is allowed."],
      ["22", "Open a previous day's books", "accountant@abutwins.com", "A past-day chip or date opens that day's statement with a BK- number."],
      ["23", "Compare two periods", "accountant@abutwins.com", "This period and Compared show different dates. Movement is in naira and percent."],
      ["24", "Download books PDF and CSV", "auditor@abutwins.com", "PDF has the ab mark, NGN amounts, and sign-off lines. CSV opens in Excel with the same sections."],
      ["25", "Shop calculator does not post money", "cashier@abutwins.com", "You can add numbers. No invoice or close is created."],
      ["26", "Reports print looks like a company paper", "ceo@abutwins.com", "PDF has the ab mark, RP- number, shop books, and no buttons."],
      ["27", "How to use this matches the job", "cashier then CEO then Super Admin", "Each book names that job. Cashier has no Who can see what. Super Admin has it. Print shows the ab mark and an HB- number."],
      ["28", "Refresh while the line is down", "cashier@abutwins.com after opening Sell now", "Parked sales stay. Sell now returns or The till is still here lists them. No invoice until send."],
      ["29", "Scan from the list on this phone", "cashier@abutwins.com after opening Sell now", "While the line is down, an In shop IMEI from the last list adds to the cart. A new customer cannot be saved."],
      ["30", "Book expected supplier goods with origin", "vault@abutwins.com or manager", "The bill shows the supplier, country or city, expected quantity, recorded IMEIs, sold on the system, sold today, and still in shop. Sell now cannot sell those IMEIs until arrival."],
      ["31", "Neighbor shop fill keeps profit", "cashier@abutwins.com", "Named customer, neighbor cost, sell price. Invoice is created. Neighbor is paid their cost. Profit equals the difference."],
      ["32", "Profit page matches real figures", "ceo@abutwins.com", "Shop sales profit plus neighbor fill profit minus expenses. Neighbor fill invoices are not counted twice."],
      ["33", "Trace a missing unit on a supplier bill", "manager or CEO", "Search the IMEI. The bill opens. Never scanned versus the bill, Sold on the system, and Still in shop are visible. If the shelf is short of Still in shop, Stock count is the next step."],
      ["34", "Stock count after a supplier bill gap", "manager then CEO or auditor", "Shelf count is entered. Difference waits for approval. Shop stock does not change until yes. Who did what keeps the names."],
      ["35", "Who did what speaks shop words", "auditor@abutwins.com", "A row shows supplier bill or parked sale, not a computer file. Tap shows what changed in everyday words."],
      ["36", "Update many selling prices at once", "manager@abutwins.com or Super Admin", "Tick mixed phones and accessories. Type each new selling price. One save updates all. Sell now shows the new figures. A cashier cannot use the ticks."],
      ["37", "Upload an item list without adding stock", "manager@abutwins.com or Super Admin", "Sample file uploads. New names appear. Units stay at zero until Goods on the way and arrival."],
      ["38", "Change own password on Your login", "cashier@abutwins.com", "New password works. Old practice password does not. Who did what shows the password was changed, not the secret."],
      ["39", "Load opening stock from the Abu Twins Excel", "uploader@abutwins.com or Super Admin", "Pick shop, supplier, and paid or not paid. Upload the PHONES / ACCESSORIES / SCREEN / LAPTOPS file. A PO appears. Phones show In shop. Piece counts appear on Shop stock. A bad line loads nothing."],
      ["40", "Add one item to the shelf by hand", "uploader@abutwins.com or Super Admin", "Start an upload bill with supplier and not paid. Scan or type one IMEI. Form clears. Bill value grows. Finance shows still owed."],
      ["41", "Trace an upload bill as accountant", "accountant@abutwins.com or auditor", "Open Goods from supplier. Find Loaded on Upload stock. Confirm PO, submission value, and owed. Pay supplier settles the unpaid bill."],
    ],
    [600, 2800, 2600, 3360]
  ),

  h1("14. Rules that keep the records safe"),
  bullet("A sale is a finished paper. You do not edit it. You add a payment, a return, or a swap as a new step."),
  bullet("Coming is not In shop. Do not promise a Coming phone as if it is on the shelf."),
  bullet("Goods from supplier, Shop to shop, and Neighbor shop fill are three different jobs. Do not mix them."),
  bullet("The supplier bill is the first count if a product is missing. Expected minus recorded is never scanned. Still in shop versus the shelf may mean a sale without an invoice. Count stock. Do not type a new number by hand."),
  bullet("Shop to shop leaves this shop from a CSV list. Every IMEI on that list must already be In shop at the sending shop."),
  bullet("The same IMEI cannot live two lives. The system will stop a copy."),
  bullet("A shop only sees its own records. A person at Bodija cannot open an Iwo Road sale, customer, or phone, even if they are handed the exact link. Only head office sees across the three shops."),
  bullet("Two tills cannot sell the same phone. Whichever completes first gets the invoice. The other is refused and nothing half-happens: no invoice, no money entry, no stock change."),
  bullet("Shop stock can never fall below zero, and two clerks collecting from the same customer at the same moment cannot wipe out each other's entry."),
  bullet("Pressing a save button twice does not do the work twice. The button refuses the second press while the first is still going."),
  bullet("A shop manager can only add staff to their own shop."),
  bullet("A walk-in sale needs a name before a return."),
  bullet("Staff cannot sell below the lowest price unless Super Admin turns that on."),
  bullet("Many selling prices can change in one save. Tick the items, type each new figure, and update. That is not a carton sale. You still sell by the unit. The mix can be any brand or accessory."),
  bullet("If a past business day had sales and is not closed, nobody starts a new live sale. Super Admin is locked too. Already parked sales may still post."),
  bullet("A parked sale that sits more than two hours, or vanishes from a device, alerts Super Admin, the CEO, and the records checker."),
  bullet("A refresh on a dead line must not wipe a parked sale. The invoice is still only born on the server."),
  bullet("If it is not on the system, it did not happen. Money and phones leave a name, a time, and a shop record."),
  bullet("Home IMEI vs shop count is the truth you act on. If they do not match, count stock. Do not type a new number by hand."),
  bullet("Only Super Admin can reverse a money collection."),
  bullet("Only Super Admin can tick Who can see what."),
  bullet("The item list is loaded centrally. Only Super Admin and the Stock uploader may add items or change prices. Shop managers no longer do."),
  bullet("A sheet is checked from top to bottom before anything is saved. One bad line means nothing is loaded, and the lines to fix are named."),
  bullet("Load the item list before anything else. Nothing can be counted or booked in until the system knows what the item is."),
  bullet("Sending the same sheet twice is safe. A phone or customer already on the system is left exactly as it is."),
  bullet("A receipt only reprints what the sale already says. Printing one never changes a sale."),
  bullet("If your job may not open a page, you are sent back to Home and the attempt is written into Who did what."),
  bullet("Check the books does not change any invoice. It reprints the add-up so the accountant and records checker can sign."),
  bullet("Who did what is never wiped."),
  bullet("Practice logins must be changed or removed before real daily use."),
  bullet("Every button and label uses the full word. Do not cut a term short with three dots."),

  h1("15. How Techvaults will help you"),
  body("Techvaults Limited built this software for Abu Twins Softskills Investment. We are the provider. Our website is techvaults.com."),
  body("When you need a new shop, a new job, or a change to a rule, start with Super Admin inside the system. If the system itself is wrong, write to Techvaults with:"),
  bullet("The page you were on."),
  bullet("The email you used (not the password)."),
  bullet("What you clicked."),
  bullet("What you expected."),
  bullet("What you saw instead."),
  body("Do not send passwords. Super Admin can reset a staff login."),
  h3("What this system will not do for you"),
  bullet("It will not count a phone that nobody typed."),
  bullet("It will not invent a buyer name."),
  bullet("It will not let a Coming phone be sold."),
  bullet("It will not let staff secretly change an old invoice."),
  bullet("It will not let a new live sale go through while an older day with sales is still open."),
  bullet("It will not stay silent if a parked sale is wiped off a device."),
  bullet("It will not change an old invoice when you check the books."),
  body("That is the point. The shop stays honest."),

  h1("16. What changed, release by release"),
  body("Each line is one release, oldest first. This is here for the record. Nothing in it is needed to use the system day to day."),
  body("Version 1.1 added three locks that stop quiet loss. Sell now stays shut until yesterday's till is counted. A sale parked on a device while the line is down is watched, and an alert is sent if it sits too long or vanishes. Home always shows shop count against the IMEI list, including when they match."),
  body("Version 1.2 gives accounts a bank-style statement. Check the books opens any previous Lagos day, compares it with another day or week, and prints a branded PDF or CSV with the company mark. The pack does not change any invoice. It only adds the books again so a person can sign them."),
  body("Version 1.3 makes Reports print like a management paper. The meeting pack has the ab mark, shop books, and NGN amounts. Buttons stay on the screen, not on the paper."),
  body("Version 1.4 stops cut-off words. A button that is working says the full action, such as Preparing the PDF, not three dots after a half word."),
  body("Version 1.5 puts a handbook on the system. How to use this is on every login. It only covers the pages and work that job can use. Print it. Keep it at the till. A cashier does not see Super Admin pages in that book."),
  body("Version 1.6 keeps the till alive when the line drops. After Sell now has been opened on that phone, a refresh still comes back. Parked sales sit in a stronger store on the device. The invoice is still only born on the server."),
  body("Version 1.7 keeps the last In shop IMEIs and named customers on that phone. After Sell now has been opened while the line is up, a cashier can still scan when the line drops. A new buyer name cannot be added offline. The invoice is still only born on the server."),
  body("Version 1.8 makes How to use this, Account, and Sign out the same size as the job name on the top bar. Save, print, search, and other action buttons use the same strong type and a clearer edge, so they do not fade into the page."),
  body("Version 1.9 splits three kinds of goods movement that used to look the same. Goods from supplier is expected cartons from named suppliers in other countries and cities, including send-back when a unit fails. Shop to shop is Iwo Road and Challenge only. Neighbor shop fill is when you collect one unit from the dealer next door for a named customer, sell it here, return that dealer their money, and keep the profit. Profit shows sell minus cost, neighbor fill profit, and expenses."),
  body("Version 1.10 changes Shop to shop from ticking phones on the screen to a CSV list. Staff download a sample or the In shop IMEIs, keep the lines that are leaving, add accessory item codes and quantities, and upload the file. The other Abu Twins shop still confirms what arrived."),
  body("Version 1.11 makes Goods from supplier the carton trail for missing products. Each bill shows how many the supplier sent, how many were scanned, how many already have an invoice (including sold today before close), and how many the system still says are In shop. Search by IMEI opens that bill. If the shelf is short of Still in shop, count stock. Do not type a new number by hand."),
  body("Version 1.12 writes that next step into Stock count. If a supplier bill says Still in shop but the shelf is short, you count with your hands. A manager must approve before numbers change. Do not type a new shop number because it looks low."),
  body("Version 1.13 keeps computer notes off the shop screens. Who did what, Alerts, Needs approval, and the phone diary speak shop words. A tap shows what changed in plain language, not a computer file. Sign in still works the same way."),
  body("Version 1.14 lets staff change many selling prices in one save. Tick any mix of phones and accessories, type each new selling price, and click Update selected prices. This is not selling by carton. Sales stay by the unit. It is not limited to one brand. This Word book now names every left-menu page, plus Your login, the shop calculator, the till when the line is down, Excel upload of the item list, warranty days, and a Super Admin shop backup."),
  body("Version 1.15 opens Bodija and keeps each shop's records apart. There are now three shops: Iwo Road, Bodija, and Challenge, each with its own manager, goods intake, cashier, sales person, and repair engineer. A person who works in one shop now sees only that shop's stock, sales, customers, and money, even if they are handed a link to another shop's invoice. Head office gets a shop picker at the top of the screen and can look at the three shops together or one shop on its own. Two tills can no longer sell the same phone. Every button now says when it is working, so a slow line no longer makes staff press twice. Screens keep themselves current, so a sale rung up at another till shows without opening the page again."),
  body("Version 1.16 lets the shops be loaded from an Excel or CSV sheet. Upload stock takes the item list, the shelf counts, every phone by IMEI, and customers, in that order, and the later steps stay shut until the item list is in. A sheet is checked from top to bottom before anything is saved, so one bad line loads nothing and names what to fix. A new job, Stock uploader, does only that work: it cannot sell, see money, or approve. Adding items and changing prices moved to that job and Super Admin, so three shops cannot invent three names for one phone. Every sale can now be saved as a receipt file, printed for a stretch of days at once, or printed the moment the sale is finished. Screens are now checked on the server before they are drawn, and a refused visit is written into Who did what."),
  body("Version 1.17 follows the opening stock Excel Abu Twins already uses. One file per shop, with PHONES, ACCESSORIES, SCREEN, and LAPTOPS. Staff pick the shop, upload that file, and the system adds the item names, books phones and laptops In shop, and sets piece counts. The older four-step sheets stay for later top-ups. The shop does not have to learn a new spreadsheet shape just to go live."),
  body("Version 1.18 adds Add one item to the shelf on Upload stock. Staff pick the shop, pick or add the item name, and scan or type each IMEI, serial, or piece count without opening a spreadsheet. The form clears after each save so the next unit is quick. The opening stock Excel stays for full shop loads. Older step-by-step sheet uploads move under Advanced so the page reads clearly for everyday work."),
  body("Version 1.19 ties every Upload stock load to a real Goods from supplier bill. Staff start a session with the supplier and paid or not paid, or pick those on the Excel upload. Each load gets a unique PO number and a submission value from cost. Unpaid bills feed Finance still owed. Phone IMEIs link back to the PO. The stock uploader can open Goods from supplier to read the bill, but still cannot post cash payments."),
  body("Version 1.20 makes long lists easier to cut. Sales, Goods from supplier, Expenses, Shop to shop, Needs approval, Returns, Swaps, Repairs, Goods on the way, and Phone IMEIs have tap chips or stages with counts. Each list shows When in Lagos time, in plain words like Today, 14:30."),

  h1("17. Short close"),
  body("You now have one system for two Ibadan shops, ready for more shops in Nigeria. Goods can be booked before they arrive. Shelf stock and coming stock stay apart. Every sale prints an invoice. Each job sees only what Super Admin allows."),
  body("Close the day before the next live sale. Check the books for that day and for any day you need to defend. Watch parked work. Believe Home when it says the IMEI list and the shop count match, and act when they do not."),
  body("Try the tests in section 13. Change the practice passwords. Then put real staff on the system."),
  para("Prepared by the Product Team", { bold: true, after: 40 }),
  para("Techvaults Limited", { after: 40 }),
  para("techvaults.com", { after: 40 }),
  para("For the Chief Executive Officer, Abu Twins Softskills Investment", { italics: true, after: 200 }),
]

const doc = new Document({
  creator: "Techvaults Limited",
  title: "Abu Twins Shop System: User Guide and Test Plan",
  description: "Plain-language guide for Abu Twins staff. Prepared by Techvaults Limited.",
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
      properties: {
        page: PAGE,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } },
              spacing: { after: 120 },
              children: [
                run("Techvaults Limited", { bold: true, size: 16, color: RED }),
                run("   ·   Abu Twins Shop System   ·   User guide", { size: 16, color: BLACK }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 8, color: BLACK, space: 8 } },
              spacing: { before: 80 },
              children: [
                run("Confidential  ·  For Abu Twins internal use  ·  Built by Techvaults Limited  ·  techvaults.com  ·  Page ", { size: 16, color: BLACK }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: BLACK }),
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
const out = new URL("./Abu-Twins-Shop-System-User-Guide.docx", import.meta.url)
writeFileSync(out, buffer)
console.log(`Wrote ${out.pathname}`)
