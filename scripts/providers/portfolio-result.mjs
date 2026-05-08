/**
 * 持股擷取統一輸出（Official / MoneyDJ 共用）
 *
 * @typedef {Object} HoldingRowParsed
 * @property {string} stock_code
 * @property {string|null} stock_name
 * @property {number|null} weight_pct
 * @property {number|null} shares
 */

/**
 * @typedef {Object} PortfolioFetchResult
 * @property {string} etf_code
 * @property {string|null} trade_date
 * @property {HoldingRowParsed[]} rows
 * @property {string} source_display 寫入 DB holdings_snapshot.source
 * @property {'official_web'|'moneydj'} source_kind
 * @property {boolean} [used_fallback] 是否曾嘗試官方後改用 MoneyDJ
 */

export function formatOfficialSourceDisplay(issuer, etfCode, tradeDate, detailUrl) {
  const base = `official:${issuer}:${etfCode}:${tradeDate}`
  return detailUrl ? `${base}|${detailUrl}` : base
}
