/**
 * ingest 完成後之資料健康檢查（僅 log；INGEST_HEALTH_STRICT=1 時拋錯供 process.exit(1)）
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} etfCodes 本次有嘗試 ingest 的代碼清單
 * @returns {Promise<{ warnings: string[]; errors: string[]; maxTradeDate: string | null }>}
 */
export async function runIngestHealthChecks(supabase, etfCodes) {
  const warnings = []
  const errors = []

  const { data: maxRow, error: maxErr } = await supabase
    .from('holdings_snapshot')
    .select('trade_date')
    .order('trade_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxErr) {
    errors.push(`無法讀取 max trade_date：${maxErr.message}`)
    return { warnings, errors, maxTradeDate: null }
  }

  const maxTradeDate = maxRow?.trade_date ?? null
  if (!maxTradeDate) {
    warnings.push('資料庫目前沒有任何 holdings_snapshot 列')
    return { warnings, errors, maxTradeDate: null }
  }

  for (const etf of etfCodes) {
    const { data: rows, error: qErr } = await supabase
      .from('holdings_snapshot')
      .select('weight_pct, stock_code')
      .eq('etf_code', etf)
      .eq('trade_date', maxTradeDate)

    if (qErr) {
      warnings.push(`${etf}：讀取列失敗 — ${qErr.message}`)
      continue
    }

    const list = rows ?? []
    if (list.length === 0) {
      warnings.push(`${etf}：在 ${maxTradeDate} 無列（可能當日未寫入）`)
      continue
    }

    if (list.length < 3) {
      warnings.push(
        `${etf}：在 ${maxTradeDate} 僅 ${list.length} 列，可能缺漏或僅部分成分`,
      )
    }

    let sumW = 0
    let nW = 0
    for (const r of list) {
      const w = r.weight_pct
      if (w != null && Number.isFinite(Number(w))) {
        sumW += Number(w)
        nW++
      }
    }
    if (nW >= 5 && (sumW < 85 || sumW > 115)) {
      warnings.push(
        `${etf}：權重合計約 ${sumW.toFixed(1)}%（${nW} 檔有權重），異常偏高／偏低`,
      )
    }
  }

  if (warnings.length > 0) {
    console.warn('\n[健康檢查] 警告：')
    for (const w of warnings) console.warn(`  - ${w}`)
  }

  const strict = process.env.INGEST_HEALTH_STRICT === '1'
  if (strict && warnings.some((w) => w.includes('無列'))) {
    errors.push('嚴格模式：存在 ETF 於最新日無資料')
  }

  return { warnings, errors, maxTradeDate }
}
