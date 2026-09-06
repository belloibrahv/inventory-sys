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
      ["Date", "7 September 2026"],
      ["Version", "1.2"],
      ["Status", "Updated: bank books, branded PDF and CSV, day compare"],
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
  body("Version 1.1 added three locks that stop quiet loss. Sell now stays shut until yesterday's till is counted. A sale parked on a device while the line is down is watched, and an alert is sent if it sits too long or vanishes. Home always shows shop count against the IMEI list, including when they match."),
  body("Version 1.2 gives accounts a bank-style statement. Check the books opens any previous Lagos day, compares it with another day or week, and prints a branded PDF or CSV with the company mark. The pack does not change any invoice. It only adds the books again so a person can sign them."),
  body("Today Abu Twins has two shops: Iwo Road, Ibadan (head office) and Challenge, Ibadan. The system can add more shops in Nigeria later. Super Admin opens a new shop when you are ready."),
  body("Please treat the login list at the end as practice only. Those names and passwords are for testing. You can lock them or remove them when live work starts."),
  body("If a page is missing on the live website, ask Techvaults. We will put the newest version up for you."),
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
  bullet("Use section 10 when you sit at a computer and click each page. Start with Home, Sell now, Close the day, and Check the books."),
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
      ["Move goods between shops", "Send to another shop. The other shop must confirm arrival."],
      ["Handle returns and swaps", "The old invoice stays. A new record is made."],
      ["Watch money", "Money in & out, Close the day, expenses, and reports show real figures."],
      ["Check a past day's books", "Check the books reprints money, phones, and the trail for any Lagos day. You can compare two periods."],
      ["Print official books", "Download a branded PDF or CSV, or print the statement. It does not change any invoice."],
      ["Control who sees what", "Super Admin ticks pages for each job."],
      ["See who changed a record", "Who did what keeps a list that is not deleted."],
    ],
    [3600, 5760]
  ),
  para("", { after: 200 }),
  body("The system does not guess. If a phone is still Coming, a cashier cannot sell it. If a walk-in sale has no customer name, a return cannot start until you add the buyer."),

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
      ["Line down", "This device has no internet. Sell now can still park a sale if the till is not locked."],
      ["Goods intake", "The person who books and receives goods."],
      ["Super Admin", "The person who can see and do everything, and can undo a true mistake."],
      ["Needs approval", "A request waiting for a yes or a no from a manager."],
      ["Walk-in", "A buyer with no name on the sale yet."],
      ["Lowest price", "The floor. Staff cannot sell below it unless Super Admin allows it."],
    ],
    [2800, 6560]
  ),

  h1("6. Shops today"),
  body("Abu Twins currently works in Ibadan only. The system is ready for more cities later."),
  table(
    ["Shop", "Code", "What it is"],
    [
      ["Iwo Road, Ibadan", "IWO", "Head office. Main stock and most staff sit here."],
      ["Challenge, Ibadan", "CHL", "Second shop. Has its own shop manager."],
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
      ["Shop manager", "Iwo Road or Challenge manager", "Run one shop. Sell, receive, transfer, approve shop work."],
      ["Goods intake", "The person who books incoming goods", "Book goods before they arrive. Receive phones. Send goods to a shop."],
      ["Cashier", "Front desk money person", "Sell now. Close the day. Collect money. Record a return."],
      ["Sales person", "Floor seller", "Sell now. Close the day. See customers and items."],
      ["Repair engineer", "Workshop", "Take phones for repair. Move a repair from step to step."],
    ],
    [2200, 3000, 4160]
  ),
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
      ["Start", "Home", "Today’s numbers, IMEI versus shop count, and work that must be done now."],
      ["Stock", "Phones & items, Phone IMEIs, Shop stock, Goods on the way", "What you sell, each phone number, what is here, what is still coming."],
      ["Sell & buy", "Sales, Sell now, Close the day, Goods from supplier, Customers, Suppliers", "Sell, count the till, print invoices, buy from a supplier, keep people lists."],
      ["Daily work", "Send to another shop, Returns, Swaps, Repairs, Stock count", "Move goods, take phones back, trade, fix, count shelves."],
      ["Money", "Money in & out, Check the books, Expenses, Needs approval", "Cash movement, official books, bills, and yes-or-no requests."],
      ["Shop & people", "Shops, Staff, Who can see what, Reports, Who did what, Alerts, Settings", "People, shops, reports, and rules."],
    ],
    [1800, 3600, 3960]
  ),
  para("", { after: 160 }),
  body("At the top there is a search box: Find IMEI, invoice, or customer. Type a phone number, an invoice number, or a buyer name. The system jumps you to that record."),
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
    what: "This is the list of things Abu Twins sells: phones, tablets, buds, charger cords, and more. Each item has a name, an item code, a cost, a lowest price, a selling price, and a tracking type.",
    why: "If staff invent names at the till, reports become junk. One list keeps names and prices the same in every shop.",
    story: "Goods intake adds Type-C charger cord. They pick No number (cords, chargers). Later a cashier can sell five cords without typing a phone number. The same day they add iPhone 15 Pro and pick Phone — IMEI, because every iPhone must keep its unique number.",
    steps: [
      "Sign in as Super Admin or shop manager.",
      "Click Phones & items.",
      "Read the list. Each line shows IMEI, serial, or no number under the name.",
      "On the right, add a test item only if Super Admin agrees you may create practice items. Pick the tracking type that matches the item.",
      "Set cost, lowest price, and selling price. Save.",
    ],
    expect: [
      "Phones show · IMEI. Buds or tablets can show · serial. Cords show · no number.",
      "The new item appears in the list.",
      "A person without Add items and change prices cannot use the add form. They only see the list.",
    ],
  }),

  ...feature({
    title: "10.3 Phone IMEIs",
    what: "This page is the life of each unique phone or serial item. You can search the number. You can see if it is Coming, In shop, Sold, Returned, or in repair. You can also receive a phone that is already in your hands.",
    why: "The unique number is how you prove a phone is yours, sold, or missing. Without it, two black iPhones look the same.",
    story: "A customer comes back with a Camon 30. The cashier types the IMEI in the top search. The record opens. It shows the invoice, the buyer, and the warranty days left. Nobody has to hunt a notebook.",
    steps: [
      "Click Phone IMEIs.",
      "Type an IMEI in the search box, or leave it empty and click Search.",
      "Open one number.",
      "Look at the status word: Coming, In shop, Sold, and so on.",
    ],
    expect: [
      "Coming phones are listed but are not for sale on Sell now.",
      "In shop phones can be sold.",
      "A sold phone shows the invoice number.",
      "The same IMEI cannot be received twice. The system says it is already on the system.",
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
    what: "This is the booking page for goods that have not reached Ibadan yet. Super Admin and Goods intake can upload phones (IMEIs), serial items, or a piece count for cords and chargers. A USB scanner works like a keyboard. The list stays Coming until someone says they have arrived. Super Admin can keep a list Hidden, or show it to staff who have this page.",
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
    what: "Sell now is the till. You scan or search a phone number or an item name, put it in the cart, pick the buyer, pick cash, transfer, POS, or credit, collect money, and finish. The system then makes an invoice. A USB scanner works like a keyboard: scan, then Enter. A phone camera can read the barcode if the browser allows it. If yesterday had sales and nobody closed that day, Complete sale stays locked for everyone, including Super Admin, until the till is counted. If the line drops and the till is not locked, the sale stays on this device as a parked sale and posts when the line returns.",
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
    ],
    expect: [
      "If an older day with sales is open, Complete sale is blocked. Parking a new live sale is also blocked.",
      "Coming phones do not appear in the search.",
      "A phone already in the cart cannot be added twice.",
      "If you type a price below the lowest price, the sale is blocked unless Super Admin has allowed that override.",
      "When the sale succeeds you are taken to the invoice page.",
      "Shop stock In shop goes down by one for that phone.",
      "A parked sale shows a banner on every signed-in page until it is sent. After two hours Super Admin, CEO, and the records checker get an alert. If someone wipes it off the device, Who did what records a vanished parked sale.",
    ],
  }),

  ...feature({
    title: "10.7 Sales and the printed invoice",
    what: "Sales is the list of every invoice. Open one invoice to collect remaining money, attach a buyer name, or print. The invoice itself cannot be edited. Items, IMEIs, and prices stay as they were on the day of the sale.",
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
      "Supplier is optional when you only book goods on the way.",
    ],
  }),

  ...feature({
    title: "10.10 Goods from supplier",
    what: "This page is for goods you have ordered from a supplier and will receive into a shop. You order, wait, check the carton, type IMEIs, then the goods sit in the shop. This is different from Goods on the way. Goods on the way is the early booking before the carton is in your hands. Goods from supplier is the buy record with money and supplier invoice.",
    why: "Buying and paying a supplier must leave a money trail. Booking a carton that is still travelling must not pretend the phones are already yours to sell.",
    story: "Accounts wants to know what we still owe a supplier. They open the purchase. They see the invoice total and what has been paid. They do not change old lines. They post a payment.",
    steps: [
      "Click Goods from supplier.",
      "Read a purchase if one exists.",
      "Follow the steps on the page: Order, On the way, Check goods, Enter IMEIs, In shop.",
    ],
    expect: [
      "A purchase has its own number.",
      "Received quantity and money owed are visible.",
      "IMEIs entered here become In shop after the receive steps, not Coming.",
    ],
  }),

  ...feature({
    title: "10.11 Send to another shop",
    what: "Use this when Iwo Road sends phones to Challenge, or the other way. You pick the IMEIs. They leave this shop. The other shop must paste the numbers that actually arrived.",
    why: "A rider can lose a phone. If the other shop does not confirm, the system still knows the phones are on the way, not sold, and not on the old shelf.",
    story: "Iwo Road sends two iPhones to Challenge. Challenge opens the transfer, pastes the two IMEIs, and confirms. Those phones now show Challenge as the shop. Iwo Road no longer has them In shop.",
    steps: [
      "Sign in as a shop manager.",
      "Click Send to another shop.",
      "Create a transfer from Iwo Road to Challenge with one In shop IMEI (use a test unit leadership accepts).",
      "Sign in as the Challenge manager (challenge.manager@abutwins.com).",
      "Open the same transfer and confirm arrival.",
    ],
    expect: [
      "Status moves from on the way to received.",
      "The phone’s shop becomes Challenge.",
      "Iwo Road In shop drops. Challenge In shop rises.",
      "The other shop must confirm. Sending alone is not enough.",
    ],
  }),

  ...feature({
    title: "10.12 Returns",
    what: "A return starts from a sold IMEI. You say why it came back. A manager approves. Then you refund, give credit, send to repair, or replace. The old invoice is not rewritten.",
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
      "The IMEI status can become Returned or move to repair.",
      "A refund is a new money record, not an erase.",
    ],
  }),

  ...feature({
    title: "10.13 Swaps",
    what: "A swap is when a customer brings an old phone and takes another. You agree a trade value. A manager approves. You give the new phone, collect or pay the difference, and print an invoice.",
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
    title: "10.14 Repairs",
    what: "Repairs is the workshop book. Take the phone in, write the fault, wait for parts if needed, repair, then give it back or put it back in the shop.",
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
    title: "10.15 Stock count",
    what: "Stock count is when you count one shop with your hands. The system compares your count with the IMEI list. If they differ, a manager must approve before numbers change.",
    why: "People should not type a new stock number because ‘it looks low’. Count first. Approve second. Then the number may change.",
    story: "Iwo Road counts iPhone 14. The shelf has 3. The system expected 4. The count shows a difference. The manager checks the missing IMEI, then approves. Only then does the number change.",
    steps: [
      "Click Stock count.",
      "Start a count for Iwo Road or Challenge.",
      "Enter counted quantities.",
      "Send for approval if there is a difference.",
    ],
    expect: [
      "The page shows expected, counted, and the difference.",
      "Stock numbers do not change until a manager approves.",
      "Who did what records the approval.",
    ],
  }),

  ...feature({
    title: "10.16 Money in & out",
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
    title: "10.17 Close the day",
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
    title: "10.18 Check the books",
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
      "Click Download branded PDF. Open the file and confirm the ab mark and statement number.",
      "Click Download CSV. Open it in Excel. Confirm the same shop, period, comparison, and invoices.",
      "Click Print / Save PDF if you want a paper copy. You may cancel after you see the preview.",
    ],
    expect: [
      "The header is royal blue with the ab mark, Abu Twins, Softskills Investment, the shop, and Lagos time.",
      "A statement number starts with BK- and the shop code.",
      "Open a previous day lists about two weeks, with sale count and whether the till was closed.",
      "Picked compare says Compared with (picked). Empty compare uses the previous period.",
      "Movement shows naira and percent for collected, posted, cash, transfer, POS, expenses, and sales count.",
      "Working paper says Pass or Fail. A fail needs a person. A pass is already proved.",
      "The PDF and the print preview hide the left menu and the calculator.",
      "The pack does not edit any invoice. Sales, returns, and closes stay as they were.",
      "A cashier who cannot see Check the books will not find the page. That is correct if Super Admin hid it.",
    ],
  }),

  ...feature({
    title: "10.19 Expenses",
    what: "Expenses is for fuel, rent, salary, and light bill. Staff ask. A manager says yes. Then money can leave.",
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
    title: "10.20 Needs approval",
    what: "This is the yes-or-no desk. Swaps, refunds, expenses, and stock counts wait here.",
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
    title: "10.21 Shops",
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
    title: "10.22 Staff",
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
    title: "10.23 Who can see what",
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
    title: "10.24 Reports",
    what: "Reports shows today’s real numbers: sales, money collected, stock value, swaps, returns, and who still owes. You can print the report or export sales as a file.",
    why: "Home is a snapshot. Reports is the pack you take to a meeting.",
    story: "Friday review. The CEO prints Reports. Iwo Road and Challenge are compared. Low stock items are listed. Nobody copies numbers from a notebook.",
    steps: [
      "Sign in as CEO.",
      "Click Reports.",
      "Read sales, collected money, and stock.",
      "Click Print report. Cancel if you do not need paper.",
    ],
    expect: [
      "Numbers match the shops you are allowed to see.",
      "A cashier without Reports does not see this page.",
    ],
  }),

  ...feature({
    title: "10.25 Who did what",
    what: "This is the diary of the system. It shows who did an important action, when, in which shop, and what changed. Nothing here is deleted. It also keeps line-down time, parked sales that posted, parked sales that sat too long, and parked sales that vanished from a device. Those last two are marked high risk. At the top it may show the books verdict. Click that banner to open Check the books.",
    why: "When two people disagree, the diary settles it. When cash sat on a phone with no invoice, the diary names the person and the device.",
    story: "A phone is missing. The records checker opens Who did what, finds the last transfer, and sees who confirmed it at Challenge. The same morning an alert says a parked sale vanished. They filter high risk, open the parked sale line, and see who was signed in on that device when the queue disappeared.",
    steps: [
      "Sign in as CEO or records checker.",
      "Click Who did what.",
      "Read the books banner if it is there. Click it to open Check the books.",
      "Find a recent sale, incoming booking, or day close.",
      "If Home said a parked sale vanished, filter high risk or open the alert link.",
    ],
    expect: [
      "You see time, person, action, and what changed.",
      "There is no delete button.",
      "A sale that posted after the line returned is marked as posted from offline.",
      "A vanished parked sale shows as a delete of ParkedSale with high risk.",
      "The books banner, when present, opens Check the books.",
    ],
  }),

  ...feature({
    title: "10.26 Alerts",
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
    title: "10.27 Settings",
    what: "Settings holds the shop name, phone, address, and email that print on invoices and on Check the books. It also holds the low stock alert and whether cashiers may sell below the lowest price. Only Super Admin can change these.",
    why: "The invoice header and the books statement should be the real Ibadan address, not a leftover Lagos line.",
    story: "Techvaults set the invoice address to Iwo Road, Ibadan, Oyo State and the phone to 07062454854. If the phone number changes, Super Admin updates Settings. The next printed invoice and the next books PDF show the new number.",
    steps: [
      "Sign in as Super Admin.",
      "Click Settings.",
      "Read Shop name on invoices, Address on invoices, and Phone on invoices.",
      "Do not change live details during a first test unless the CEO asks.",
    ],
    expect: [
      "CEO can read settings but cannot change them.",
      "Printed invoices and the books statement use these values.",
    ],
  }),

  ...feature({
    title: "10.28 Shop calculator",
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
  h3("Iwo Road, Ibadan (head office)"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Super Admin", "TechVaults Admin", "admin@abutwins.com", "admin123"],
      ["CEO", "Abu Twins", "ceo@abutwins.com", "ceo123"],
      ["Records checker", "Amaka Okonkwo", "auditor@abutwins.com", "auditor123"],
      ["Accountant", "Chinedu Bassey", "accountant@abutwins.com", "accountant123"],
      ["Shop manager", "Halima Yusuf", "manager@abutwins.com", "manager123"],
      ["Goods intake", "Ibrahim Lawal", "vault@abutwins.com", "vault123"],
      ["Cashier", "Blessing Adeyemi", "cashier@abutwins.com", "cashier123"],
      ["Sales person", "Tunde Adebayo", "sales@abutwins.com", "sales123"],
      ["Repair engineer", "Kelechi Nwosu", "engineer@abutwins.com", "engineer123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
  para("", { after: 200 }),
  h3("Challenge, Ibadan"),
  table(
    ["Job", "Name on the system", "Email", "Practice password"],
    [
      ["Shop manager", "Fatima Sule", "challenge.manager@abutwins.com", "manager123"],
    ],
    [2000, 2400, 3000, 1960]
  ),
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
      ["Repair steps", "engineer@abutwins.com"],
      ["Money pages and Check the books", "accountant@abutwins.com"],
      ["Checking the diary and signing the books", "auditor@abutwins.com"],
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
      ["17", "Transfer Iwo Road to Challenge", "Both shop managers", "Challenge must confirm. Then stock moves."],
      ["18", "Return needs a named buyer", "cashier@abutwins.com", "Walk-in is blocked until a name is attached."],
      ["19", "Expense waits for yes", "manager@abutwins.com then CEO", "Money does not leave before approval."],
      ["20", "Who did what keeps the story", "auditor@abutwins.com", "The sale, close, or parked trail appears with a name and time."],
      ["21", "Cashier does not see Super Admin pages", "cashier@abutwins.com", "No Settings change, no Who can see what, no undo money. Close the day is allowed."],
      ["22", "Open a previous day's books", "accountant@abutwins.com", "A past-day chip or date opens that day's statement with a BK- number."],
      ["23", "Compare two periods", "accountant@abutwins.com", "This period and Compared show different dates. Movement is in naira and percent."],
      ["24", "Download books PDF and CSV", "auditor@abutwins.com", "PDF has the ab mark and sign-off lines. CSV opens in Excel with the same sections."],
      ["25", "Shop calculator does not post money", "cashier@abutwins.com", "You can add numbers. No invoice or close is created."],
    ],
    [600, 2800, 2600, 3360]
  ),

  h1("14. Rules that keep the records safe"),
  bullet("A sale is a finished paper. You do not edit it. You add a payment, a return, or a swap as a new step."),
  bullet("Coming is not In shop. Do not promise a Coming phone as if it is on the shelf."),
  bullet("The same IMEI cannot live two lives. The system will stop a copy."),
  bullet("A walk-in sale needs a name before a return."),
  bullet("Staff cannot sell below the lowest price unless Super Admin turns that on."),
  bullet("If a past business day had sales and is not closed, nobody starts a new live sale. Super Admin is locked too. Already parked sales may still post."),
  bullet("A parked sale that sits more than two hours, or vanishes from a device, alerts Super Admin, the CEO, and the records checker."),
  bullet("If it is not on the system, it did not happen. Money and phones leave a name, a time, and a shop record."),
  bullet("Home IMEI vs shop count is the truth you act on. If they do not match, count stock. Do not type a new number by hand."),
  bullet("Only Super Admin can reverse a money collection."),
  bullet("Only Super Admin can tick Who can see what."),
  bullet("Check the books does not change any invoice. It reprints the add-up so the accountant and records checker can sign."),
  bullet("Who did what is never wiped."),
  bullet("Practice logins must be changed or removed before real daily use."),

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

  h1("16. Short close"),
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
