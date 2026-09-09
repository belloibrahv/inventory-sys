// Excel pack Abu Twins fills so Techvaults can load current shelf stock.
// Run: node docs/generate-stock-template.mjs
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import XLSX from "xlsx"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "Abu-Twins-Current-Stock-Template.xlsx")

function sheet(rows, widths, extra = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = widths.map((wch) => ({ wch }))
  if (!extra.plain) {
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" }
    const lastCol = String.fromCharCode(64 + (rows[0]?.length || 1))
    if (rows.length > 1) ws["!autofilter"] = { ref: `A1:${lastCol}${rows.length}` }
  }
  return ws
}

const readMe = [
  ["Abu Twins Softskills. Current stock for the shop system"],
  ["Prepared by Techvaults Limited  ·  techvaults.com  ·  9 September 2026"],
  [""],
  ["What this file is"],
  ["Fill this workbook with what is on the shelf tonight at Iwo Road, Bodija, and Challenge. Send the filled file back, or load it yourself on the Upload stock screen. Either way staff can then sell and you can test the real workflows."],
  [""],
  ["How to fill it"],
  ["1. Keep the SAMPLE rows as a picture of the shape. Copy the layout. Then delete every SAMPLE row before you send the file, or mark your own rows as REAL in row_type."],
  ["2. Use the exact shop names: Iwo Road, Ibadan    Bodija, Ibadan    Challenge, Ibadan. The short codes IWO, BOD, and CHL also work."],
  ["3. Count with your hands tonight. Do not guess. Home will show a gap if IMEI count and shelf count disagree."],
  ["4. Never invent an IMEI, a serial, a buyer name, or a piece count."],
  ["5. Item codes on Phones in shop, Pieces in shop, and Coming goods must match Items."],
  ["6. The tabs load in this order: Items first, then Pieces in shop, then Phones in shop, then Customers. Nothing can be counted or booked in until Items is loaded."],
  ["7. Do not rename the column headings. They are what the shop system reads."],
  [""],
  ["Tabs you must fill for tomorrow"],
  ["Items", "The list of things you sell. One row per model, not per box. This does not put stock on the shelf."],
  ["Phones in shop", "One row for every phone, tablet, or serial item sitting in a shop tonight. IMEI 1 must be the number on the box, at least 14 digits."],
  ["Pieces in shop", "Cords, chargers, and other goods with no unique number. One row per item per shop, with the piece count."],
  ["Customers", "Named buyers, so old debts, warranties, and returns can be attached to the right person. Optional for a first sale."],
  ["Staff", "People who will sign in. Job and shop decide what they see."],
  [""],
  ["Tabs that help, but do not block a first live sale"],
  ["Suppliers", "Who you buy from."],
  ["Coming goods", "Cartons still on the road. Do not mix these with Phones in shop."],
  ["Allowed words", "The only values we can read for shop, tracking, condition, and job."],
  [""],
  ["Tracking"],
  ["IMEI", "Phones. Every unit needs IMEI 1."],
  ["SERIAL", "Buds, some tablets. Every unit needs a serial."],
  ["NONE", "Cords and chargers. Count pieces. No IMEI."],
  [""],
  ["What not to send"],
  ["Do not type a new IMEI because the box is missing. Leave that unit off the list until you find the number."],
  ["Do not send old paper invoices to be rewritten as history. Tomorrow starts from what is on the shelf now."],
  ["Do not invent a buyer so a credit sale can be tested. Use a real named customer later, or a walk-in with no name."],
  [""],
  ["When you are done"],
  ["Save this Excel. Either send it back to Techvaults, or sign in as the Stock uploader and load it yourself on Upload stock, working down the four steps in order."],
  ["The shop system checks a whole tab before it saves any of it. If one line is wrong, nothing is loaded and you are told exactly which lines to fix. Sending the same tab twice is safe."],
]

const items = [
  ["row_type", "item_code", "name", "brand", "category", "tracking", "condition", "color", "storage", "ram", "cost", "minimum_price", "selling_price", "warranty_days", "description"],
  ["SAMPLE", "IP15P-256-BLK", "iPhone 15 Pro 256GB", "Apple", "Phones", "IMEI", "Brand new", "Black", "256GB", "", "1450000", "1580000", "1680000", "365", "Phone. Each unit needs IMEI 1 on Phones in shop."],
  ["SAMPLE", "S24-256-GRY", "Galaxy S24 256GB", "Samsung", "Phones", "IMEI", "Brand new", "Grey", "256GB", "8GB", "780000", "860000", "920000", "365", "Phone. Each unit needs IMEI 1 on Phones in shop."],
  ["SAMPLE", "CAMON30-256", "Camon 30 256GB", "Tecno", "Phones", "IMEI", "UK used", "Black", "256GB", "8GB", "210000", "235000", "255000", "180", "Phone. Each unit needs IMEI 1 on Phones in shop."],
  ["SAMPLE", "BUDS3-WHT", "Galaxy Buds3", "Samsung", "Accessories", "SERIAL", "Brand new", "White", "", "", "45000", "52000", "62000", "180", "Accessory with a serial. Put each unit on Phones in shop with the serial."],
  ["SAMPLE", "CORD-TYPEC", "Type-C charger cord", "Generic", "Accessories", "NONE", "Brand new", "Black", "", "", "1500", "2000", "2500", "90", "No unique number. Put the piece count on Pieces in shop."],
  ["REAL", "", "", "", "", "", "", "", "", "", "", "", "", "", "Replace this row. Keep item_code unique. tracking must be IMEI, SERIAL, or NONE."],
]

const phones = [
  ["row_type", "shop", "item_code", "name", "imei1", "imei2", "serial", "condition", "grade", "battery_percent", "supplier", "notes"],
  ["SAMPLE", "Iwo Road, Ibadan", "IP15P-256-BLK", "iPhone 15 Pro 256GB", "990000011111111", "", "", "Brand new", "A", "100", "SAMPLE China carton", "Delete this sample. One physical phone, one row."],
  ["SAMPLE", "Iwo Road, Ibadan", "CAMON30-256", "Camon 30 256GB", "990000022222222", "", "", "UK used", "B", "87", "", "Delete this sample."],
  ["SAMPLE", "Bodija, Ibadan", "S24-256-GRY", "Galaxy S24 256GB", "990000033333333", "", "", "Brand new", "A", "100", "", "This phone sits at Bodija, not Iwo Road."],
  ["SAMPLE", "Challenge, Ibadan", "S24-256-GRY", "Galaxy S24 256GB", "990000044444444", "", "", "Brand new", "A", "100", "", "Same model, third shop. One row per physical phone."],
  ["SAMPLE", "Iwo Road, Ibadan", "BUDS3-WHT", "Galaxy Buds3", "", "", "SN-SAMPLE-BUDS-001", "Brand new", "A", "", "", "Serial item. Put the serial here. IMEI 1 can stay empty."],
  ["REAL", "", "", "", "", "", "", "", "", "", "", "Replace this row. One row per phone or serial item on the shelf. Shop must be Iwo Road, Ibadan, Bodija, Ibadan, or Challenge, Ibadan."],
]

const pieces = [
  ["row_type", "shop", "item_code", "name", "quantity", "notes"],
  ["SAMPLE", "Iwo Road, Ibadan", "CORD-TYPEC", "Type-C charger cord", "20", "Delete this sample. Count the drawer tonight."],
  ["SAMPLE", "Bodija, Ibadan", "CORD-TYPEC", "Type-C charger cord", "8", "Same item, different shop, different count."],
  ["SAMPLE", "Challenge, Ibadan", "CORD-TYPEC", "Type-C charger cord", "12", "Count each shop separately."],
  ["REAL", "", "", "", "", "Replace this row. One row per no-number item per shop. tracking on Items must be NONE."],
]

const staff = [
  ["row_type", "full_name", "work_email", "job", "shop", "notes"],
  ["SAMPLE", "SAMPLE Cashier Iwo Road", "cashier.iwo@example.com", "Cashier", "Iwo Road, Ibadan", "Delete this sample. Shop is required for cashier, sales, manager, and goods intake."],
  ["SAMPLE", "SAMPLE Manager Bodija", "manager.bodija@example.com", "Shop manager", "Bodija, Ibadan", "Delete this sample."],
  ["SAMPLE", "SAMPLE Manager Challenge", "manager.challenge@example.com", "Shop manager", "Challenge, Ibadan", "Delete this sample."],
  ["SAMPLE", "SAMPLE Stock uploader", "uploader@example.com", "Stock uploader", "", "Loads this workbook into the system. Leave shop empty. This job cannot sell or see money."],
  ["SAMPLE", "SAMPLE Accountant", "accounts@example.com", "Accountant", "", "Leave shop empty if this person sees every shop."],
  ["REAL", "", "", "", "", "Use a work email they will actually sign in with. Allowed jobs are on Allowed words."],
]

const customers = [
  ["row_type", "name", "phone", "shop", "email", "address", "credit_limit", "notes"],
  ["SAMPLE", "SAMPLE Chidi Okeke", "08031234567", "Iwo Road, Ibadan", "", "Bodija, Ibadan", "250000", "Delete this sample. Phone number must be unique across the business."],
  ["SAMPLE", "SAMPLE Emeka Wholesale", "08039876543", "Bodija, Ibadan", "emeka@example.com", "", "1500000", "A trade buyer. credit_limit is how much they may owe at once."],
  ["REAL", "", "", "", "", "", "", "Only named buyers you actually know. Leave credit_limit empty or 0 for a customer who always pays in full."],
]

const suppliers = [
  ["row_type", "name", "phone", "contact_person", "email", "city", "country", "notes"],
  ["SAMPLE", "SAMPLE China carton house", "08000000000", "", "", "Shenzhen", "China", "Delete this sample. Optional for tomorrow."],
  ["REAL", "", "", "", "", "", "", "Add the suppliers you buy from. Phone is useful."],
]

const coming = [
  ["row_type", "shop", "item_code", "tracking", "quantity", "imei1", "serial", "supplier", "origin_city", "origin_country", "notes"],
  ["SAMPLE", "Iwo Road, Ibadan", "IP15P-256-BLK", "IMEI", "", "990000044444444", "", "SAMPLE China carton house", "Shenzhen", "China", "On the road. Not on the shelf. Delete this sample."],
  ["SAMPLE", "Iwo Road, Ibadan", "CORD-TYPEC", "NONE", "50", "", "", "SAMPLE China carton house", "Lagos", "Nigeria", "Fifty cords still coming. Not in Pieces in shop."],
  ["REAL", "", "", "", "", "", "", "", "", "", "Replace this row. Only goods that have not arrived. Phones already in the drawer go on Phones in shop instead."],
]

const words = [
  ["What to type", "Allowed value", "Where it is used"],
  ["Shop", "Iwo Road, Ibadan", "Phones in shop, Pieces in shop, Customers, Staff, Coming goods"],
  ["Shop", "Bodija, Ibadan", "Phones in shop, Pieces in shop, Customers, Staff, Coming goods"],
  ["Shop", "Challenge, Ibadan", "Phones in shop, Pieces in shop, Customers, Staff, Coming goods"],
  ["Shop code", "IWO, BOD, CHL", "Short codes. The shop system reads these too."],
  ["Tracking", "IMEI", "Items, Coming goods. Phones."],
  ["Tracking", "SERIAL", "Items, Coming goods. Buds or tablets with a serial."],
  ["Tracking", "NONE", "Items, Coming goods. Cords and chargers. Use Pieces in shop."],
  ["Condition", "Brand new", "Items, Phones in shop"],
  ["Condition", "Open box", "Items, Phones in shop"],
  ["Condition", "UK used", "Items, Phones in shop"],
  ["Condition", "Refurbished", "Items, Phones in shop"],
  ["Condition", "Swap", "Items, Phones in shop"],
  ["Condition", "Faulty", "Items, Phones in shop"],
  ["Condition", "Repair", "Items, Phones in shop"],
  ["Grade", "A", "Phones in shop. Like new. Optional."],
  ["Grade", "B", "Phones in shop. Light marks. Optional."],
  ["Grade", "C", "Phones in shop. Visible wear. Optional."],
  ["Grade", "D", "Phones in shop. Heavy wear or crack. Optional."],
  ["Job", "Super Admin", "Staff"],
  ["Job", "CEO", "Staff"],
  ["Job", "Records checker", "Staff"],
  ["Job", "Accountant", "Staff"],
  ["Job", "Shop manager", "Staff"],
  ["Job", "Goods intake", "Staff"],
  ["Job", "Stock uploader", "Staff. Loads this workbook. Cannot sell, see money, or approve."],
  ["Job", "Cashier", "Staff"],
  ["Job", "Sales person", "Staff"],
  ["Job", "Repair engineer", "Staff"],
  ["row_type", "SAMPLE", "Every data tab. Delete these rows, or leave them. The shop system never loads a row marked SAMPLE."],
  ["row_type", "REAL", "Every data tab. Your live rows."],
]

const wb = XLSX.utils.book_new()
wb.Props = {
  Title: "Abu Twins current stock template",
  Author: "Techvaults Limited",
  Company: "Techvaults Limited",
  Subject: "Shelf stock, item list, and staff for the Abu Twins shop system",
}

XLSX.utils.book_append_sheet(wb, sheet(readMe, [28, 88], { plain: true }), "Read me first")
XLSX.utils.book_append_sheet(wb, sheet(items, [12, 16, 28, 14, 14, 12, 14, 12, 12, 10, 12, 14, 14, 14, 48]), "Items")
XLSX.utils.book_append_sheet(wb, sheet(pieces, [12, 22, 16, 24, 18, 48]), "Pieces in shop")
XLSX.utils.book_append_sheet(wb, sheet(phones, [12, 22, 16, 24, 18, 16, 20, 14, 8, 16, 22, 48]), "Phones in shop")
XLSX.utils.book_append_sheet(wb, sheet(customers, [12, 26, 16, 20, 26, 24, 14, 56]), "Customers")
XLSX.utils.book_append_sheet(wb, sheet(staff, [12, 28, 32, 18, 22, 56]), "Staff")
XLSX.utils.book_append_sheet(wb, sheet(suppliers, [12, 28, 16, 20, 28, 16, 14, 40]), "Suppliers")
XLSX.utils.book_append_sheet(wb, sheet(coming, [12, 22, 16, 12, 12, 18, 18, 28, 16, 14, 48]), "Coming goods")
XLSX.utils.book_append_sheet(wb, sheet(words, [16, 24, 56]), "Allowed words")

writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
console.log(`Wrote ${out}`)
