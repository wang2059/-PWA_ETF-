/**
 * 自公開 CSV URL 解析持股（UTF-8）。欄位名稱容錯：code/stock_code、name、weight、shares 等。
 */
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1)
  return s
}

function parseNumberLoose(s) {
  if (s == null || s === '') return null
  const t = String(s).replace(/,/g, '').replace(/%/g, '').trim()
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** @returns {{ headers: string[], rows: string[][] }} */
function parseCsv(text) {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const splitLine = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        q = !q
        continue
      }
      if (!q && c === ',') {
        out.push(cur.trim())
        cur = ''
        continue
      }
      cur += c
    }
    out.push(cur.trim())
    return out
  }

  const headers = splitLine(lines[0]).map((h) => h.replace(/^\ufeff/, '').trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    rows.push(splitLine(lines[i]))
  }
  return { headers, rows }
}

function normHeader(h) {
  return h
    .replace(/\s/g, '')
    .replace(/[(（].*[)）]/g, '')
    .toLowerCase()
}

function pickColumnIndices(headers) {
  const idx = {}
  const nh = headers.map(normHeader)
  for (let i = 0; i < nh.length; i++) {
    const h = nh[i]
    if (/^(代號|股票代號|證券代號|code|stockcode)$/.test(h)) idx.code = i
    else if (/^(名稱|股票名稱|股票簡稱|name|stockname)$/.test(h)) idx.name = i
    else if (/^(持股張數|張數|股數|張|shares|quantity)$/.test(h)) idx.shares = i
    else if (/^(比重|權重|占比|比例|weight|weights)$/.test(h)) idx.weight = i
    else if (/^(資料日期|日期|截止日|基準日|date)$/.test(h)) idx.date = i
  }
  return idx
}

export async function fetchPortfolioFromCsvUrl(csvUrl) {
  const res = await fetch(csvUrl, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/csv,text/plain,*/*',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`)

  const text = await res.text()
  const { headers, rows: bodyRows } = parseCsv(text)
  if (headers.length === 0) throw new Error('CSV 無表頭')

  const col = pickColumnIndices(headers)
  if (col.code === undefined) {
    throw new Error('CSV 找不到股票代號欄（需含：代號/code 等）')
  }

  let trade_date = null
  const rows = []
  for (const cells of bodyRows) {
    if (col.date !== undefined && cells[col.date]) {
      const ds = String(cells[col.date]).trim()
      const m = ds.match(/(\d{4})[-/](\d{2})[-/](\d{2})/)
      if (m) trade_date = trade_date ?? `${m[1]}-${m[2]}-${m[3]}`
    }

    const codeRaw = cells[col.code]?.trim()
    if (!codeRaw) continue
    const stock_code = codeRaw.replace(/\D/g, '').slice(0, 6)
    if (!stock_code || stock_code.length < 4) continue

    const stock_name =
      col.name !== undefined ? (cells[col.name]?.trim() || null) : null
    const weight_pct =
      col.weight !== undefined ? parseNumberLoose(cells[col.weight]) : null
    const shares = col.shares !== undefined ? parseNumberLoose(cells[col.shares]) : null

    rows.push({
      stock_code,
      stock_name,
      weight_pct,
      shares,
    })
  }

  return { trade_date, rows }
}
