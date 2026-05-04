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

/** 資料庫目前最新的 trade_date（供「新資料」橫幅判斷） */
export async function fetchMaxTradeDate(
  client: SupabaseClient | null,
): Promise<string | null> {
  if (!client) return null

  const { data, error } = await client
    .from('holdings_snapshot')
    .select('trade_date')
    .order('trade_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  const row = data as { trade_date?: string } | null
  return row?.trade_date ?? null
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
