import type { UserRole } from "@prisma/client"
import { navGroups } from "@/components/layout/nav"
import { ROLE_LABELS } from "@/lib/roles"

export type ManualSection = {
  id: string
  href?: string
  title: string
  group: string
  what: string
  doThis: string[]
  watch: string[]
  cannot: string[]
  lookup: string[]
}

export type RoleManual = {
  role: UserRole
  roleLabel: string
  job: string
  shops: string
  pages: string[]
  actions: string[]
  sections: ManualSection[]
}

const ROLE_JOB: Record<UserRole, { job: string; shops: string }> = {
  SUPER_ADMIN: {
    job: "You can open every page. You can undo a true money mistake. Only you can tick Who can see what, change Settings, and open or close a shop.",
    shops: "You see every shop.",
  },
  CEO: {
    job: "You watch both Ibadan shops: sales, stock, money, and the trail. You cannot change Who can see what, Settings, or sell below the lowest price.",
    shops: "You see every shop.",
  },
  AUDITOR: {
    job: "You check records, sign the books, and say yes or no to some requests. You do not sell.",
    shops: "You see every shop.",
  },
  ACCOUNTANT: {
    job: "You watch money, invoices, expenses, and the books. You can collect and record pay-outs. You do not run the till all day.",
    shops: "You see every shop.",
  },
  BRANCH_MANAGER: {
    job: "You run one shop: sell, receive, transfer, approve shop work, and add staff for that shop.",
    shops: "You see your shop only, unless Super Admin later ticks See every shop.",
  },
  VAULT_MANAGER: {
    job: "You book goods before they arrive, receive phones, and send stock to a shop. You do not take till money.",
    shops: "You work in the shop Super Admin set on your login.",
  },
  CASHIER: {
    job: "You sell, collect money, close the day, and record a return. You do not book incoming goods or change prices.",
    shops: "You work in the shop Super Admin set on your login.",
  },
  SALES_EXECUTIVE: {
    job: "You sell and close the day. You can see customers and items. You do not record returns unless Super Admin ticks that later.",
    shops: "You work in the shop Super Admin set on your login.",
  },
  ENGINEER: {
    job: "You take phones for repair and move a repair from step to step. You can record a return that needs workshop work.",
    shops: "You work in the shop Super Admin set on your login.",
  },
}

const PAGES: Array<
  Omit<ManualSection, "group"> & { href: string; needAction?: string }
> = [
  {
    id: "home",
    href: "/dashboard",
    title: "Home",
    what: "The first picture of the day. Sales, expenses, money collected, work that still needs a person, and IMEI versus shop count. The count table stays on the page even when every row says Match.",
    doThis: [
      "Read Do these next at the top. Click a card to jump to that work.",
      "If a day is not closed, open it and count the till before anyone sells.",
      "Read IMEI vs shop count. Match means the unique list and the shelf number agree. A gap means count stock. Do not type a new number by hand.",
      "A parked sale sitting too long goes to Sell now. A vanished parked sale goes to Who did what.",
    ],
    watch: [
      "Unclosed days lock Sell now for everyone, including Super Admin.",
      "A gap on IMEI vs shop count is unproven stock until someone counts.",
    ],
    cannot: ["Home does not change an invoice or a stock number."],
    lookup: ["home", "do these next", "imei check", "match", "gap"],
  },
  {
    id: "products",
    href: "/products",
    title: "Phones & items",
    needAction: "action.catalog",
    what: "The list of things Abu Twins sells. Each line has a name, item code, cost, lowest price, selling price, and tracking: IMEI, serial, or no number.",
    doThis: [
      "Search by item code or model.",
      "If you can add items, set cost, lowest price, and selling price. Pick the tracking that matches the thing: phones use IMEI, some accessories use serial, cords use no number.",
      "You can upload many items from Excel or CSV if that button is on your page. That adds names, not shelf stock.",
      "To change many selling prices at once, tick any mix of phones and accessories, type each new selling price, then click Update selected prices.",
      "Warranty days for one item can be changed on the same page.",
    ],
    watch: [
      "One list keeps names and prices the same in every shop.",
      "A person without Add items and change prices can read the list but cannot add or reprice.",
      "This is not a carton sale. You still sell by the unit. Bulk here means many prices in one save.",
    ],
    cannot: ["This page does not sell a phone. Use Sell now."],
    lookup: ["product", "price", "sku", "item code", "upload", "bulk", "update selected prices"],
  },
  {
    id: "imei",
    href: "/imei",
    title: "Phone IMEIs",
    needAction: "action.intake",
    what: "The life of each unique phone or serial item. Search the number. See Coming, In shop, Sold, Returned, or in repair.",
    doThis: [
      "Type an IMEI or serial in the search, or leave it empty and search.",
      "Open a number to see the shop, the invoice, the buyer, and the warranty days left.",
      "If you can receive goods, you can add a phone that is already in your hands.",
    ],
    watch: [
      "Coming phones are not for sale on Sell now.",
      "The same IMEI cannot live two lives. The system stops a copy.",
    ],
    cannot: ["You cannot sell from this page. You cannot invent an IMEI that is not on a box."],
    lookup: ["imei", "serial", "coming", "in shop", "sold"],
  },
  {
    id: "inventory",
    href: "/inventory",
    title: "Shop stock",
    what: "The shelf view. In shop is what you may sell. Coming is booked and not here yet. For phones you also see how many IMEIs sit in that shop.",
    doThis: [
      "Find the item and the shop.",
      "Read In shop and Coming as two different numbers.",
      "If IMEIs in shop and In shop do not match, go to stock count or Home. Do not type a new shelf number by hand.",
    ],
    watch: ["Coming does not add to In shop until someone confirms arrival."],
    cannot: ["This page does not move a phone to another Abu Twins shop. Use Shop to shop."],
    lookup: ["stock", "shelf", "in shop", "coming", "quantity"],
  },
  {
    id: "incoming",
    href: "/incoming",
    title: "Goods on the way",
    needAction: "action.incoming",
    what: "Book a supplier carton before it reaches Ibadan. Phones go in as IMEIs. Cords go in as a piece count. The list stays Coming until someone says they have arrived. This is not Shop to shop.",
    doThis: [
      "Pick the shop the carton is going to.",
      "Add phone lines with one IMEI per line, at least 14 digits. Add no-number items with a piece count.",
      "Save. Shop stock Coming goes up. Sell now still cannot find those IMEIs.",
      "When the rider arrives, mark They have arrived. In shop goes up. Then cashiers can sell.",
      "Super Admin can show a hidden list to staff who have this page.",
    ],
    watch: [
      "If you mix Coming with In shop, cashiers will sell phones that are still on the road.",
      "The same IMEI cannot be booked twice.",
    ],
    cannot: ["A cashier who cannot book goods will not see the add form."],
    lookup: ["incoming", "coming", "book", "arrived", "carton"],
  },
  {
    id: "sales",
    href: "/sales",
    title: "Sales",
    needAction: "action.sell",
    what: "Every invoice. Open one to collect remaining money, attach a buyer name, or print. The invoice itself cannot be edited.",
    doThis: [
      "Open an invoice. Read the note that this sale cannot be changed.",
      "Print the invoice. The paper has the blue header and the ab mark.",
      "If money is still due and a buyer is attached, collect the rest. That adds a payment line. Old lines stay.",
      "If the sale was a walk-in, attach a real name before anyone starts a return.",
    ],
    watch: ["If staff can change yesterday's sale, the day's cash never matches."],
    cannot: ["You cannot change items, IMEIs, or prices on an old invoice."],
    lookup: ["invoice", "print", "collect", "walk-in"],
  },
  {
    id: "pos",
    href: "/pos",
    title: "Sell now",
    needAction: "action.sell",
    what: "The till. Scan or type an In shop IMEI or an accessory name, pick the buyer, take cash, transfer, POS, or credit, and finish. The system makes an invoice.",
    doThis: [
      "If you see Count the till, close that day first. Complete sale stays locked until you do, even for Super Admin.",
      "Confirm you are in the shop you are standing in.",
      "Scan the IMEI and press Enter, or use the camera if the browser allows it. Coming phones will not appear.",
      "Pick a named customer, or add one. Walk-in must pay in full.",
      "Set the amount and the method. Complete sale.",
      "If the line drops and the till is not locked, finish anyway. The sale stays on this device as a parked sale and posts when the line returns.",
    ],
    watch: [
      "A parked sale shows a banner on every signed-in page until it is sent.",
      "After two hours Super Admin, the CEO, and the records checker get an alert.",
      "If someone wipes a parked sale off the device, Who did what records it as vanished.",
      "You cannot sell below the lowest price unless Super Admin has allowed that.",
    ],
    cannot: ["You cannot sell a Coming phone. You cannot force a live sale while an older day with sales is still open."],
    lookup: ["sell", "till", "pos", "scan", "parked", "offline", "complete sale"],
  },
  {
    id: "close",
    href: "/finance/close",
    title: "Close the day",
    what: "The till count. You pick the Lagos business day, see cash expected from cash sales, type the cash you counted, and save the difference.",
    doThis: [
      "Open Close the day from the left, from the lock on Sell now, or from Home.",
      "Confirm the date is the unclosed day, not today, if yesterday still needs a count.",
      "Count the physical cash. Type that number. Add a short note for shortfall or leftover.",
      "Close this day. If another old day is still listed, close that one too.",
    ],
    watch: [
      "Cash expected is only cash sales for that business day.",
      "You cannot close the same shop day twice.",
      "Cashiers and sales people can close even if they cannot see the full Money in & out page.",
    ],
    cannot: ["Closing the day does not change any invoice."],
    lookup: ["close", "till", "count", "variance", "expected cash"],
  },
  {
    id: "purchases",
    href: "/purchases",
    title: "Goods from supplier",
    needAction: "action.intake",
    what: "Expected cartons from named suppliers in other countries and cities. This bill is the trail for missing products. You can see how many the supplier sent, how many were scanned, how many were sold on invoices (including today before close), and how many the system still says are In shop.",
    doThis: [
      "Pick the supplier, the shop that will receive, the item, how many, the cost, and the country or city the goods are coming from.",
      "Save. Open the bill. Book IMEIs as Coming if the carton is still on the road.",
      "When the boxes are on the counter, confirm they are in this shop. Then cashiers can sell.",
      "Search by IMEI, bill number, supplier, or product to open that carton trail.",
      "Before Close the day, read Sold today against Still in shop. If the shelf is short of Still in shop, count stock.",
      "Pay the supplier as a separate money step.",
      "If a unit does not work, send those IMEIs back to the supplier from this page or from Returns.",
    ],
    watch: [
      "This is not Iwo Road sending a phone to Challenge. That is Shop to shop.",
      "This is not buying one unit from the shop next door for a customer. That is Neighbor shop fill.",
      "Never scanned versus the bill means those units were never given a number on this system.",
      "If Still in shop is higher than the shelf, a unit may have been sold without an invoice. Do not type a new shop number by hand.",
    ],
    cannot: ["This page does not invent a supplier. Add the supplier first. Neighbor shops are a different list kind."],
    lookup: ["purchase", "supplier bill", "expected", "china", "dubai", "send back", "missing", "sold today"],
  },
  {
    id: "customers",
    href: "/customers",
    title: "Customers",
    what: "Named buyers. A sale can be a walk-in, but a return cannot start until a real name is on the invoice.",
    doThis: [
      "Add a person with a full name and a phone.",
      "Open a customer to see what they still owe and their invoices.",
      "If you can collect, post a payment on that person.",
    ],
    watch: ["Do not invent dummy buyers for live cash. If it is not a real person, do not put them on the system."],
    cannot: ["A walk-in with no name cannot start a return."],
    lookup: ["customer", "buyer", "owing", "credit"],
  },
  {
    id: "suppliers",
    href: "/suppliers",
    title: "Suppliers",
    what: "People and firms Abu Twins buys cartons from. Keep the country and city so expected goods have an origin. Neighboring dealers you fill from can be marked Neighboring shop.",
    doThis: [
      "Add a supplier with a name, a phone, and where they ship from.",
      "Open one to see unpaid bills.",
    ],
    watch: ["One supplier list keeps pay-outs honest. Do not mix carton suppliers with a one-unit neighbor fill unless you mark them as a neighboring shop."],
    cannot: ["This page does not receive a carton. Use Goods on the way or Goods from supplier."],
    lookup: ["supplier", "creditor", "country", "dubai", "china"],
  },
  {
    id: "transfers",
    href: "/transfers",
    title: "Shop to shop",
    needAction: "action.transfer",
    what: "Move phones and accessories that already belong to Abu Twins from one of our shops to another, such as Iwo Road to Challenge. You upload a CSV of IMEIs and accessory lines. The receiving shop must confirm arrival.",
    doThis: [
      "Pick the Abu Twins shop you are sending from and the Abu Twins shop that will receive.",
      "Download the sample file, or download the In shop IMEIs at the sending shop.",
      "Keep the phone lines you are sending. Add accessory lines with item code and quantity. Save as CSV.",
      "Upload the file and send. The phones are on the way between our shops, not sold, and not on the old shelf.",
      "At the other shop, confirm the IMEIs that arrived. Both shop stocks then update.",
    ],
    watch: [
      "If the other shop does not confirm, the system still knows the phones are on the road.",
      "This is not goods from a supplier. This is not a neighboring dealer fill.",
      "Every IMEI on the list must already be In shop at the sending shop.",
    ],
    cannot: ["You cannot treat a shop-to-shop send as a sale or as a supplier carton."],
    lookup: ["transfer", "shop to shop", "csv", "challenge", "iwo road", "imei"],
  },
  {
    id: "neighbor",
    href: "/neighbor-fills",
    title: "Neighbor shop fill",
    needAction: "action.neighbor",
    what: "A named customer wants a unit we do not have. Staff collect it from a neighboring dealer, sell it here, return that dealer their money, and keep the profit. The unit does not sit on our shelf as In shop stock.",
    doThis: [
      "Pick our shop, the named customer, the item, and the neighboring shop.",
      "Type what we will return to the neighbor and what the customer will pay. The difference is our profit.",
      "If the item has an IMEI, type the number from that neighboring shop.",
      "Save, then sell to this customer. Return the neighbor their cost when you send the money.",
    ],
    watch: [
      "Do not invent a buyer. Add the customer first.",
      "This is not Shop to shop. Challenge is our shop. A neighbor is someone next door.",
    ],
    cannot: ["You cannot turn a neighbor fill into Iwo Road shelf stock and then pretend it arrived from a supplier."],
    lookup: ["neighbor", "next door", "fill", "profit"],
  },
  {
    id: "returns",
    href: "/returns",
    title: "Returns",
    needAction: "action.return",
    what: "A buyer brings a phone back. The original invoice stays. A new return record is made. After yes you can refund, credit, repair, replace, or send the unit back to the supplier.",
    doThis: [
      "Find the sale. The buyer must have a name.",
      "Enter the IMEI and the reason.",
      "If a manager must say yes, wait on Needs approval.",
      "Pick the outcome. Send back to the supplier if the unit must leave this shop and go to the house that supplied it.",
    ],
    watch: ["A walk-in sale is blocked until you attach a name."],
    cannot: ["You cannot rub out the old invoice."],
    lookup: ["return", "refund", "faulty"],
  },
  {
    id: "swaps",
    href: "/swaps",
    title: "Swaps",
    needAction: "action.swap",
    what: "A customer brings an old phone and takes another. You agree a trade value. A manager approves. You collect or pay the difference and print an invoice.",
    doThis: [
      "Enter the old IMEI and pick the new phone that is In shop.",
      "Type the trade-in value.",
      "Wait for yes if your job cannot approve.",
      "Finish and print.",
    ],
    watch: ["The old invoice for a past sale, if any, is not edited."],
    cannot: ["A swap without approval stays waiting."],
    lookup: ["swap", "trade-in", "trade"],
  },
  {
    id: "repairs",
    href: "/repairs",
    title: "Repairs",
    needAction: "action.repair",
    what: "Workshop work. Take a phone in, write the issue, move it from step to step, and set a cost when you know it.",
    doThis: [
      "Enter the IMEI and the issue.",
      "Move the repair to the next step as work happens.",
      "Add diagnosis and cost when you have them.",
    ],
    watch: ["A phone in repair is not In shop for sale."],
    cannot: ["This page does not complete a till sale."],
    lookup: ["repair", "workshop", "diagnosis"],
  },
  {
    id: "recon",
    href: "/reconciliation",
    title: "Stock count",
    needAction: "action.recon",
    what: "Count what is physically here and compare it with the system. Use this when Home IMEI vs shop count disagrees, or when a supplier bill says Still in shop but the shelf has fewer. A manager must say yes before stock numbers change.",
    doThis: [
      "If a product looks missing, open Goods from supplier and search the IMEI or the bill first.",
      "Count the boxes and IMEIs in front of you.",
      "Enter what you counted.",
      "Wait for approval. Stock does not move until yes.",
    ],
    watch: [
      "If IMEI vs shop count disagrees, this is the honest fix. Do not type a new number on Shop stock.",
      "A supplier bill Still in shop gap may mean a sale without an invoice. Count. Do not guess.",
    ],
    cannot: ["A no leaves the count rejected. Numbers stay as they were."],
    lookup: ["count", "recon", "mismatch", "missing"],
  },
  {
    id: "finance",
    href: "/finance",
    title: "Money in & out",
    needAction: "action.finance",
    what: "Money that moved: collections, pay-outs, and the difference. It also shows what customers still owe and what Abu Twins still owes suppliers.",
    doThis: [
      "Read Money in, Money out, and Difference.",
      "Open Close the day from here if the till still needs a count.",
      "If you can record finance, post a supplier payment or an approved expense pay-out.",
    ],
    watch: ["Figures are in naira. They come from real invoices and approvals."],
    cannot: ["This page does not invent cash."],
    lookup: ["finance", "money in", "money out", "cash"],
  },
  {
    id: "profits",
    href: "/profits",
    title: "Profit",
    what: "Sell price minus cost on completed shop sales, plus profit kept on neighbor fills, minus approved expenses. Neighbor fill sales are not counted twice.",
    doThis: [
      "Read shop sales profit, neighbor fill profit, expenses, and net.",
      "Open By shop if you can see more than one shop.",
    ],
    watch: ["Figures come from real invoices, neighbor fills, and approved expenses. The pack does not invent profit."],
    cannot: ["This page does not change an invoice or a fill."],
    lookup: ["profit", "margin", "net", "neighbor profit"],
  },
  {
    id: "books",
    href: "/audit/books",
    title: "Check the books",
    what: "The official statement of account for a shop and a Lagos period. Open a past day, compare it with another period, then print or download. The pack does not change any invoice.",
    doThis: [
      "Pick the shop, the period, and the end date.",
      "Click a previous day on the chip strip, or type an older date.",
      "Leave Compare with empty to use the previous period, or pick another date.",
      "Read the verdict, the comparison, the money add-up, and the working paper.",
      "Download the branded PDF or the CSV, or print to save as PDF.",
    ],
    watch: [
      "PDF money is written as NGN so the naira sign does not break.",
      "A fail on the working paper needs a person. A pass is already proved.",
    ],
    cannot: ["This pack does not edit an invoice, a close, or a stock number."],
    lookup: ["books", "statement", "compare", "pdf", "csv", "accountant"],
  },
  {
    id: "expenses",
    href: "/expenses",
    title: "Expenses",
    needAction: "action.finance",
    what: "Fuel, rent, salary, light bill. Staff ask. A manager says yes. Then money can leave.",
    doThis: [
      "Create the expense with an amount and a description.",
      "Wait on Needs approval.",
      "After yes, the pay-out can show in Money in & out.",
    ],
    watch: ["Money does not leave until yes."],
    cannot: ["A no leaves the expense rejected."],
    lookup: ["expense", "fuel", "bill"],
  },
  {
    id: "approvals",
    href: "/approvals",
    title: "Needs approval",
    needAction: "action.approve",
    what: "The yes-or-no desk. Swaps, refunds, expenses, and stock counts wait here.",
    doThis: [
      "Open an item. Read who asked and why.",
      "Say yes or no.",
    ],
    watch: ["After yes, the original work can continue. After no, it stops."],
    cannot: ["A person without approve rights cannot see the yes button."],
    lookup: ["approve", "yes", "no", "waiting"],
  },
  {
    id: "branches",
    href: "/branches",
    title: "Shops",
    needAction: "action.settings",
    what: "Iwo Road is head office. Challenge is the second shop. Super Admin can open a new shop or close one. Closed shops stay in a Super Admin-only list so old sales are not lost.",
    doThis: [
      "Confirm you see Iwo Road, Ibadan and Challenge, Ibadan.",
      "If you are Super Admin, you can open a new shop with a name, a short code, and an address.",
    ],
    watch: ["Old Lagos or Abuja names do not appear when you sell or book new goods."],
    cannot: ["Only Super Admin can open or close a shop."],
    lookup: ["shop", "branch", "iwo", "challenge"],
  },
  {
    id: "staff",
    href: "/staff",
    title: "Staff",
    needAction: "action.staff",
    what: "The people list. Add a person, pick their job, pick their shop, and give a first password. Super Admin can lock a login.",
    doThis: [
      "Add name, work email, job, and shop.",
      "Give a temporary password. They should change it after they sign in.",
      "Disable a person who leaves. Restore if they return.",
    ],
    watch: ["A person who leaves must not keep a key to the till."],
    cannot: ["Do not disable the only Super Admin during a test."],
    lookup: ["staff", "user", "password", "disable"],
  },
  {
    id: "access",
    href: "/staff/access",
    title: "Who can see what",
    what: "Super Admin only. Tick the pages and the work for each job. Super Admin is not ticked here because Super Admin always has all rights.",
    doThis: [
      "Open a job, such as Cashier.",
      "Tick or untick a page. Save only if you mean to change a live rule.",
    ],
    watch: ["A CEO who opens this address is sent away."],
    cannot: ["You cannot remove Super Admin rights here. That is by design."],
    lookup: ["access", "permission", "tick", "role"],
  },
  {
    id: "reports",
    href: "/reports",
    title: "Reports",
    what: "Sales, money collected, stock, swaps, returns, and who still owes, for every completed record you can see. On screen it is a dashboard. Print or download is a branded management paper.",
    doThis: [
      "Read the cards and the shop books.",
      "Download the branded PDF or print to save as PDF.",
      "Export sales as CSV if you need Excel.",
    ],
    watch: ["Buttons stay on the screen, not on the printed paper."],
    cannot: ["Reports does not change an invoice."],
    lookup: ["report", "pdf", "meeting"],
  },
  {
    id: "audit",
    href: "/audit",
    title: "Who did what",
    what: "The diary. Who did an important action, when, and what changed, in shop words. Nothing here is deleted. Parked sales that sat or vanished are marked high risk.",
    doThis: [
      "Search a name, IMEI, or invoice.",
      "Filter by action, risk, or failed sign-in.",
      "Open the books banner if it is there.",
      "Download the diary as a file if you need a copy.",
    ],
    watch: ["There is no delete button. A vanished parked sale is a high-risk row."],
    cannot: ["You cannot edit a past action."],
    lookup: ["audit", "trail", "who", "high risk", "login"],
  },
  {
    id: "alerts",
    href: "/notifications",
    title: "Alerts",
    what: "Short notices: low stock, a request waiting, a parked sale sitting too long, or a parked sale that vanished.",
    doThis: [
      "Open the bell or this page.",
      "A parked sale sitting too long points to Sell now.",
      "A parked sale that vanished points to Who did what.",
    ],
    watch: ["Super Admin, the CEO, and the records checker get the parked-sale alerts."],
    cannot: ["An alert does not post money by itself."],
    lookup: ["alert", "bell", "low stock", "parked"],
  },
  {
    id: "settings",
    href: "/settings",
    title: "Settings",
    needAction: "action.settings",
    what: "Shop name, phone, address, and email that print on invoices, books, reports, and this manual. Also the low stock alert, default warranty days, and whether cashiers may sell below the lowest price. Super Admin can download a shop backup.",
    doThis: [
      "Read the invoice header values.",
      "Change them only if Super Admin and the CEO agree.",
      "Super Admin may download a shop backup and keep that file off this computer.",
    ],
    watch: ["The next printed invoice and the next books PDF use these values. A backup does not include passwords."],
    cannot: ["CEO can read settings but cannot change them. CEO cannot download the shop backup."],
    lookup: ["settings", "address", "phone", "lowest price", "backup"],
  },
  {
    id: "account",
    href: "/account",
    title: "Your login",
    what: "Your name, job, and password. Every signed-in person can open this.",
    doThis: [
      "Change your password after a first login or when Super Admin asks.",
      "Sign out when you leave the till.",
    ],
    watch: ["Do not share your password in a group chat."],
    cannot: ["This page does not change another person's job. That is Staff."],
    lookup: ["password", "account", "sign out", "login"],
  },
]

function groupFor(href: string) {
  for (const group of navGroups) {
    if (group.items.some((item) => item.href === href)) return group.label
  }
  if (href === "/account") return "Every job"
  if (href === "/help") return "Every job"
  return "Shop"
}

function alwaysSections(keys: Set<string>): ManualSection[] {
  const extras: ManualSection[] = [
    {
      id: "search",
      title: "Find IMEI, invoice, supplier bill, or customer",
      group: "On every screen",
      what: "The search box on the top bar, or the search window from the keyboard. Type a phone number, an invoice number, a supplier bill, or a buyer name. An IMEI can also open the supplier carton that unit came from.",
      doThis: [
        "On a computer, click the search box or hold Control and K (Command and K on a Mac).",
        "On a phone, tap the search icon.",
        "Type the number or name and open the match.",
      ],
      watch: ["You only jump to records your job may open."],
      cannot: ["Search does not invent a buyer or an IMEI."],
      lookup: ["search", "find", "lookup", "control k"],
    },
    {
      id: "calculator",
      title: "Shop calculator",
      group: "On every screen",
      what: "A button on every signed-in page. Add, subtract, multiply, and divide. It does not post money and does not change an invoice.",
      doThis: [
        "Tap the calculator.",
        "Add the notes in the drawer or a line you want to check by hand.",
        "Close it. The page you were on does not change.",
      ],
      watch: ["It does not appear on a printed invoice or a printed books statement."],
      cannot: ["The calculator cannot complete a sale or a close."],
      lookup: ["calculator", "add", "math"],
    },
    {
      id: "menu",
      title: "The left menu",
      group: "On every screen",
      what: "The dark bar is your map. You only see pages your job may open. On a computer you can hide it if you need more room. That choice stays on this device. On a phone the menu is a drawer.",
      doThis: [
        "Use the menu button at the top to show or hide the bar.",
        "If a page is missing, Super Admin has not given that page to your job.",
      ],
      watch: ["A missing page is not a broken computer."],
      cannot: ["Hiding the menu does not hide your rights. It only gives you room."],
      lookup: ["menu", "sidebar", "left"],
    },
  ]

  if (keys.has("action.sell") && keys.has("view.pos")) {
    extras.push({
      id: "offline",
      title: "When the line drops",
      group: "On every screen",
      what: "If Sell now has been opened on this device while the line was up, this phone keeps the In shop IMEIs and named customers. You can still scan and finish a sale. It stays as a parked sale. Refresh is safe. When the line returns, it posts, or you tap Send parked work now.",
      doThis: [
        "Open Sell now while the line is up at least once, so this phone can keep the shop list.",
        "If the line drops, scan an IMEI from that saved list. Finish the sale. You should see that it is saved on this device.",
        "Use a customer already on this phone, or a walk-in who pays in full. Do not invent a new buyer while the line is down.",
        "If a refresh lands on The till is still here, the last shop list is there. Sell from it, or send parked work when the line returns.",
        "When the yellow banner says the line is back, send parked work.",
      ],
      watch: [
        "The list is the last In shop picture. Coming phones are not on it.",
        "A parked IMEI leaves the list on this phone so you cannot sell it twice before the line returns.",
        "A parked sale that sits more than two hours alerts Super Admin, the CEO, and the records checker.",
      ],
      cannot: [
        "You cannot park a new live sale while an older day with sales is still open.",
        "You cannot add a new customer name while the line is down.",
      ],
      lookup: ["offline", "line down", "parked", "banner", "refresh", "till is still here", "scan", "imei"],
    })
  }

  extras.push({
    id: "rules",
    title: "Rules that keep the shop honest",
    group: "Remember",
    what: "Money and phones must leave a name, a time, and a shop record. If it is not on the system, it did not happen.",
    doThis: [
      "A sale is a finished paper. You add a payment, a return, or a swap as a new step.",
      "Coming is not In shop. Do not promise a Coming phone as if it is on the shelf.",
      "A walk-in sale needs a name before a return.",
      "If a past business day had sales and is not closed, nobody starts a new live sale.",
    ],
    watch: ["Who did what is never wiped. Check the books does not change any invoice."],
    cannot: ["The system will not invent a buyer name or let staff secretly change an old invoice."],
    lookup: ["rules", "honest", "coming", "invoice"],
  })

  return extras
}

function canUsePage(href: string, allowedHrefs: string[]) {
  if (href === "/account" || href === "/help") return true
  return allowedHrefs.includes(href)
}

export function buildRoleManual(role: UserRole, keys: Set<string>, allowedHrefs: string[]): RoleManual {
  const brief = ROLE_JOB[role]
  const sections: ManualSection[] = [
    {
      id: "this-book",
      title: "How to use this book",
      group: "On every screen",
      what: "This page is the handbook for your job only. It lists the pages you can open and the work you can do. A cashier and a CEO see different books.",
      doThis: [
        "Type a word in Look up a page, button, or word. Matching sections stay on the screen.",
        "Use Print / Save PDF. The paper has the company mark, your job name, and a reference such as HB-CASHIER-20260907.",
        "Print includes the full book for this job even if you filtered the screen.",
      ],
      watch: ["If a page is not in this book, your job cannot open it. Ask Super Admin if you need that page."],
      cannot: ["This book does not give you extra rights. It only explains what you already have."],
      lookup: ["help", "manual", "print", "handbook", "how to", "lookup"],
    },
  ]

  for (const page of PAGES) {
    if (!canUsePage(page.href, allowedHrefs)) continue
    const canAct = !page.needAction || role === "SUPER_ADMIN" || keys.has(page.needAction)
    sections.push({
      id: page.id,
      href: page.href,
      title: page.title,
      group: groupFor(page.href),
      what: page.what,
      doThis: canAct
        ? page.doThis
        : [
            "You can open this page and read it.",
            "You cannot post or change records here. Super Admin has not given that work to your job.",
          ],
      watch: page.watch,
      cannot: canAct
        ? page.cannot
        : [...page.cannot, "If you need to post here, ask Super Admin to tick the right work for your job."],
      lookup: page.lookup,
    })
  }

  sections.push(...alwaysSections(keys))

  const pages = sections.filter((row) => row.href).map((row) => row.title)
  const actions = [
    keys.has("action.sell") ? "Sell and collect money" : "",
    keys.has("action.catalog") ? "Add items and change prices" : "",
    keys.has("action.intake") ? "Receive phones and supplier goods" : "",
    keys.has("action.incoming") ? "Book goods before they arrive" : "",
    keys.has("action.transfer") ? "Send and receive goods between shops" : "",
    keys.has("action.return") ? "Record returns" : "",
    keys.has("action.swap") ? "Record swaps" : "",
    keys.has("action.repair") ? "Handle repairs" : "",
    keys.has("action.recon") ? "Count stock" : "",
    keys.has("action.approve") ? "Approve or reject requests" : "",
    keys.has("action.finance") ? "Record expenses and pay suppliers" : "",
    keys.has("action.staff") ? "Add staff" : "",
    keys.has("action.settings") ? "Change shop settings" : "",
    keys.has("action.all_branches") ? "See every shop" : "",
    keys.has("action.override_floor") ? "Sell below the lowest allowed price" : "",
    role === "SUPER_ADMIN" ? "Undo a true money mistake" : "",
  ].filter(Boolean)

  return {
    role,
    roleLabel: ROLE_LABELS[role],
    job: brief.job,
    shops: brief.shops,
    pages,
    actions,
    sections,
  }
}

export function manualHaystack(section: ManualSection) {
  return [section.title, section.group, section.what, ...section.doThis, ...section.watch, ...section.cannot, ...section.lookup]
    .join(" ")
    .toLowerCase()
}
