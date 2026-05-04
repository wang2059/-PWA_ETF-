import type { HoldingRow } from '../lib/types'

/** 本地示範資料：兩個交易日，部分 ETF 有持股重疊，方便驗證差分與排行 */
export function buildMockSnapshots(prevDate: string, currDate: string): HoldingRow[] {
  const prev00980: HoldingRow[] = [
    mk(prevDate, '00980A', '2330', '台積電', 50000, null, 12),
    mk(prevDate, '00980A', '2317', '鴻海', 12000, null, 5),
    mk(prevDate, '00980A', '2454', '聯發科', 8000, null, 4),
  ]
  const curr00980: HoldingRow[] = [
    mk(currDate, '00980A', '2330', '台積電', 52000, null, 13),
    mk(currDate, '00980A', '2317', '鴻海', 11000, null, 5),
    mk(currDate, '00980A', '3008', '大立光', 6000, null, 3),
  ]

  const prev00981: HoldingRow[] = [
    mk(prevDate, '00981A', '2330', '台積電', 40000, null, 10),
    mk(prevDate, '00981A', '2882', '國泰金', 9000, null, 3),
  ]
  const curr00981: HoldingRow[] = [
    mk(currDate, '00981A', '2330', '台積電', 41000, null, 11),
    mk(currDate, '00981A', '3008', '大立光', 3000, null, 2),
  ]

  return [...prev00980, ...curr00980, ...prev00981, ...curr00981]
}

function mk(
  trade_date: string,
  etf_code: string,
  stock_code: string,
  stock_name: string,
  market_value_twd: number | null,
  shares: number | null,
  weight_pct: number | null,
): HoldingRow {
  return {
    trade_date,
    etf_code,
    stock_code,
    stock_name,
    market_value_twd,
    shares,
    weight_pct,
  }
}
