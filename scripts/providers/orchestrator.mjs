import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchMoneydjPortfolio } from './moneydj.mjs'
import { formatOfficialSourceDisplay } from './portfolio-result.mjs'
import { fetchPortfolioFromCsvUrl } from './official/csv-url.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadOfficialConfig() {
  const p = join(__dirname, '..', 'config', 'etf-official-sources.json')
  if (!existsSync(p)) return {}
  const raw = readFileSync(p, 'utf8')
  return JSON.parse(raw)
}

function envCsvUrlOverride(etfCode) {
  const k = `OFFICIAL_CSV_${etfCode}`
  const v = process.env[k]
  return v && v.trim() ? v.trim() : null
}

function envTradeDateOverride(etfCode) {
  const k = `OFFICIAL_TRADE_DATE_${etfCode}`
  const v = process.env[k]
  if (!v || !v.trim()) return null
  const s = v.trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? s : null
}

/**
 * Official-first；失敗或未設定官方來源時 fallback MoneyDJ。
 * @param {string} etfCode
 * @returns {Promise<import('./portfolio-result.mjs').PortfolioFetchResult>}
 */
export async function fetchPortfolioOfficialFirst(etfCode) {
  const officialFirst = process.env.INGEST_OFFICIAL_FIRST !== '0'
  const officialOnly = process.env.INGEST_OFFICIAL_ONLY === '1'

  if (!officialFirst) {
    const m = await fetchMoneydjPortfolio(etfCode)
    return {
      etf_code: m.etf_code,
      trade_date: m.trade_date,
      rows: m.rows,
      source_display: m.source_url,
      source_kind: 'moneydj',
      used_fallback: false,
    }
  }

  const cfgMap = loadOfficialConfig()
  const cfg = cfgMap[etfCode] ?? {}
  const issuer = cfg.issuer ?? '未知'
  const driver = cfg.driver ?? 'none'
  const csvUrl = envCsvUrlOverride(etfCode) ?? cfg.csvUrl ?? null

  let triedOfficial = false

  if (officialFirst && driver === 'csv_url' && csvUrl) {
    triedOfficial = true
    try {
      const { trade_date: tdCsv, rows } = await fetchPortfolioFromCsvUrl(csvUrl)
      let trade_date = tdCsv ?? envTradeDateOverride(etfCode)
      if (!trade_date) {
        throw new Error(
          '官方 CSV 無法解析資料日期（可加「資料日期」欄或設環境變數 OFFICIAL_TRADE_DATE_' +
            etfCode +
            '=YYYY-MM-DD）',
        )
      }
      if (rows.length === 0) throw new Error('官方 CSV 無有效持股列')

      return {
        etf_code: etfCode,
        trade_date,
        rows,
        source_display: formatOfficialSourceDisplay(issuer, etfCode, trade_date, csvUrl),
        source_kind: 'official_web',
        used_fallback: false,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (officialOnly) {
        throw new Error(`INGEST_OFFICIAL_ONLY=1 且官方失敗：${msg}`)
      }
      console.warn(`  [官方] ${etfCode} 失敗，改 MoneyDJ：${msg}`)
    }
  } else if (officialOnly && officialFirst) {
    if (driver !== 'csv_url' || !csvUrl) {
      throw new Error(
        `INGEST_OFFICIAL_ONLY=1 但 ${etfCode} 未設定有效官方 driver/csvUrl`,
      )
    }
  }

  const m = await fetchMoneydjPortfolio(etfCode)
  const used_fallback = triedOfficial
  return {
    etf_code: m.etf_code,
    trade_date: m.trade_date,
    rows: m.rows,
    source_display: m.source_url,
    source_kind: 'moneydj',
    used_fallback,
  }
}
