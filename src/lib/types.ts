/** 單一成分股列（與 DB 對齊） */
export type HoldingRow = {
  trade_date: string
  etf_code: string
  stock_code: string
  stock_name: string | null
  market_value_twd: number | null
  shares: number | null
  weight_pct: number | null
}

export type EtfDelta = {
  etfCode: string
  /** 當日新納入（前一日無持股紀錄） */
  added: { stock_code: string; stock_name: string | null }[]
  /** 前一日有、當日完全剔除 */
  removed: { stock_code: string; stock_name: string | null }[]
  /** 兩日皆在成分中（介面不顯示市值，僅列示） */
  stillHeld: { stock_code: string; stock_name: string | null }[]
}

export type CrossEtfRank = {
  stock_code: string
  stock_name: string | null
  etfCount: number
}
