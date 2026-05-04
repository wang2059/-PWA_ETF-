import type { SupabaseClient } from '@supabase/supabase-js'
import { ETF_CODES } from '../lib/etfAllowlist'
import type { HoldingRow } from '../lib/types'

export async function fetchSnapshotsForDates(
  client: SupabaseClient | null,
  dates: string[],
): Promise<HoldingRow[]> {
  if (!client || dates.length === 0) return []

  const { data, error } = await client
    .from('holdings_snapshot')
    .select(
      'trade_date, etf_code, stock_code, stock_name, market_value_twd, shares, weight_pct',
    )
    .in('trade_date', dates)
    .in('etf_code', [...ETF_CODES])

  if (error) throw error
  return (data ?? []) as HoldingRow[]
}

export function groupByEtfAndDate(
  rows: HoldingRow[],
  prevDate: string,
  currDate: string,
): Map<string, { prev: HoldingRow[]; curr: HoldingRow[] }> {
  const map = new Map<string, { prev: HoldingRow[]; curr: HoldingRow[] }>()
  for (const code of ETF_CODES) {
    map.set(code, { prev: [], curr: [] })
  }
  for (const r of rows) {
    const g = map.get(r.etf_code)
    if (!g) continue
    if (r.trade_date === prevDate) g.prev.push(r)
    if (r.trade_date === currDate) g.curr.push(r)
  }
  return map
}
