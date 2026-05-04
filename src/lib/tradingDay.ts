/**
 * 台股交易日：先排除週末，再排除靜態國定／休市日集合。
 * 可視需要擴充 TW_STOCK_NO_TRADE（或改接 API）。
 */
export const TW_STOCK_NO_TRADE = new Set<string>([
  // 2025 常見休市（例示，請依證交所日曆補齊）
  '2025-01-01',
  '2025-01-30',
  '2025-01-31',
  '2025-02-28',
  '2025-04-03',
  '2025-04-04',
  '2025-05-30',
  '2025-05-31',
  '2025-09-08',
  '2025-10-10',
  '2025-10-24',
  '2025-12-25',
  // 2026（例示）
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-27',
  '2026-02-28',
  '2026-04-03',
  '2026-04-04',
  '2026-04-05',
  '2026-05-01',
  '2026-06-19',
  '2026-06-20',
  '2026-09-15',
  '2026-10-09',
  '2026-10-10',
  '2026-10-24',
  '2026-10-25',
  '2026-12-25',
])

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 0 || w === 6
}

export function isNonTradingDay(isoDate: string): boolean {
  const d = parseLocalDate(isoDate)
  if (isWeekend(d)) return true
  return TW_STOCK_NO_TRADE.has(isoDate)
}

/** 取得 isoDate 的上一個交易日（字串 YYYY-MM-DD） */
export function previousTradingDay(isoDate: string): string {
  let d = parseLocalDate(isoDate)
  do {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
  } while (isNonTradingDay(formatLocalDate(d)))
  return formatLocalDate(d)
}

/** 若 isoDate 本身非交易日，往前推到最近交易日 */
export function normalizeToTradingDay(isoDate: string): string {
  let d = parseLocalDate(isoDate)
  let s = formatLocalDate(d)
  while (isNonTradingDay(s)) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
    s = formatLocalDate(d)
  }
  return s
}
