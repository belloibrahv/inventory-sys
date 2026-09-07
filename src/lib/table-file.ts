export function keyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

export function cell(row: Record<string, string>, ...names: string[]) {
  const wanted = new Set(names.map(keyName))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(keyName(key)) && value.trim()) return value.trim()
  }
  return ""
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cellValue = ""
  let quoted = false
  const input = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cellValue += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cellValue += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === "," || char === "\t") {
      row.push(cellValue)
      cellValue = ""
      continue
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1
      row.push(cellValue)
      if (row.some((item) => item.trim())) rows.push(row)
      row = []
      cellValue = ""
      continue
    }
    cellValue += char
  }
  row.push(cellValue)
  if (row.some((item) => item.trim())) rows.push(row)
  return rows
}

function rowsFromSheet(text: string) {
  const table = parseCsv(text)
  if (table.length < 2) return []
  const headers = table[0].map((item) => item.trim())
  return table.slice(1).map((line) => {
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = line[index] ?? ""
    })
    return row
  })
}

export async function readTableFile(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx")
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return []
    return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "" }).map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key), String(value ?? "").trim()]))
    )
  }
  return rowsFromSheet(await file.text())
}
