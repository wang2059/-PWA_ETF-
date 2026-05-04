#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 載入專案根目錄 `.env.ingest`（若存在），無需依賴 dotenv */
function loadEnvIngest() {
  const p = resolve(process.cwd(), '.env.ingest')
  if (!existsSync(p)) return
  const raw = readFileSync(p, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq === -1) continue
    const k = s.slice(0, eq).trim()
    let v = s.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnvIngest()

/**
 * 持股擷取 → Supabase holdings_snapshot
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 此腳本在 Node 環境執行（本機排程 / CI），**不會**打包進 PWA。      │
 * │ PWA 僅透過 anon key **讀取**資料；寫入請用 service_role。        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 使用：專案根目錄建立 `.env.ingest`（見 .env.ingest.example）
 *   npm run ingest
 *   npm run ingest:dry
 *   node scripts/run-ingest.mjs --etf=00980A
 */

import { createClient } from '@supabase/supabase-js'
import { ETF_CODES } from './etf-codes.mjs'
import { fetchMoneydjPortfolio } from './providers/moneydj.mjs'

const dryRun = process.argv.includes('--dry-run')
const etfArg = process.argv.find((a) => a.startsWith('--etf='))
const codes = etfArg ? [etfArg.slice(6).trim().toUpperCase()] : ETF_CODES

const delayMs = Number(process.env.INGEST_DELAY_MS || 900)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!dryRun && (!url || !key)) {
    console.error(
      '請設定 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（見 .env.ingest.example），或使用 --dry-run',
    )
    process.exit(1)
  }

  const supabase =
    url && key && !dryRun
      ? createClient(url, key, { auth: { persistSession: false } })
      : null

  console.log(
    dryRun ? '[dry-run] 不寫入資料庫' : `[寫入] ${url}`,
    `｜ETF 數：${codes.length}｜請求間隔 ${delayMs}ms`,
  )

  let ok = 0
  let fail = 0

  for (let i = 0; i < codes.length; i++) {
    const etf = codes[i]
    try {
      const data = await fetchMoneydjPortfolio(etf)
      const { trade_date, rows, source_url } = data

      console.log(
        `[${i + 1}/${codes.length}] ${etf} 資料日 ${trade_date ?? '?'}｜${rows.length} 檔成分`,
      )

      if (!trade_date) {
        console.warn(`  跳過：無法解析資料日期 (${etf})`)
        fail++
        continue
      }

      if (rows.length === 0) {
        console.warn(`  跳過：無持股列 (${etf})`)
        fail++
        continue
      }

      if (dryRun || !supabase) {
        ok++
        continue
      }

      const { error: delErr } = await supabase
        .from('holdings_snapshot')
        .delete()
        .eq('trade_date', trade_date)
        .eq('etf_code', etf)

      if (delErr) throw delErr

      const payload = rows.map((r) => ({
        trade_date,
        etf_code: etf,
        stock_code: r.stock_code,
        stock_name: r.stock_name,
        market_value_twd: null,
        shares: r.shares,
        weight_pct: r.weight_pct,
        source: source_url,
      }))

      const chunk = 300
      for (let j = 0; j < payload.length; j += chunk) {
        const part = payload.slice(j, j + chunk)
        const { error: insErr } = await supabase.from('holdings_snapshot').insert(part)
        if (insErr) throw insErr
      }

      console.log(`  已寫入 ${payload.length} 列`)
      ok++
    } catch (e) {
      console.error(`  錯誤 ${etf}:`, e instanceof Error ? e.message : e)
      fail++
    }

    if (i < codes.length - 1) await sleep(delayMs)
  }

  console.log(`完成：成功 ${ok}，失敗 ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
