import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { buildMockSnapshots } from './data/mockSnapshots'
import { ETF_ALLOWLIST, ETF_CODES, etfFundName, etfLabel } from './lib/etfAllowlist'
import {
  aggregateNewAndRemoved,
  etfCodesByStockForAdded,
  etfCodesByStockForRemoved,
} from './lib/aggregate'
import { computeAllEtfDeltas } from './lib/delta'
import { isAfterTaipeiIngestTime, isEveningIngestPollWindow } from './lib/taipeiTime'
import { normalizeToTradingDay, previousTradingDay } from './lib/tradingDay'
import type { EtfDelta, HoldingRow } from './lib/types'
import {
  fetchMaxTradeDate,
  fetchSnapshotsForDates,
  groupByEtfAndDate,
} from './services/holdingsRepository'
import { getBrowserSupabase, useMockData } from './services/supabase'
import { intensity, paletteBuy, paletteSell } from './lib/rankCardStyle'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 初次進入預設報表日：上一個交易日（相對行事曆今日先正規化成交易日再往前提一日），以免「當日」快照尚未齊全時誤判大量剔除 */
function defaultPickedReportDate(): string {
  const todayOrPriorTrading = normalizeToTradingDay(todayISO())
  return previousTradingDay(todayOrPriorTrading)
}

function formatWeightPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${v.toFixed(2)}%`
}

function toLots(shares: number | null | undefined): number | null {
  if (shares === null || shares === undefined || Number.isNaN(shares)) return null
  return shares / 1000
}

function formatLotsDelta(deltaLots: number | null): string | null {
  if (deltaLots === null || Number.isNaN(deltaLots) || deltaLots === 0) return null
  const sign = deltaLots > 0 ? '+' : ''
  // 台股通常為整張，若有零股則保留兩位
  const abs = Math.abs(deltaLots)
  const s = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2)
  return `Δ ${sign}${deltaLots < 0 ? '-' : ''}${s}張`
}

const SPOTLIGHT_KEY = 'etf_spotlight_seen_v1'

function readSpotlightSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SPOTLIGHT_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function markSpotlightSeen(tradeDate: string) {
  try {
    const s = readSpotlightSeen()
    s.add(tradeDate)
    localStorage.setItem(SPOTLIGHT_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

export default function App() {
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const mock = useMockData()

  /** 使用者在日曆選的日期（可為休市日）；預設為上一個交易日以利資料齊備後再比對 */
  const [pickedDate, setPickedDate] = useState(() => defaultPickedReportDate())
  /** 實際用來載入快照的「當日」＝最近一個交易日（≤ 選定日） */
  const effectiveCurrDate = useMemo(
    () => normalizeToTradingDay(pickedDate),
    [pickedDate],
  )
  const prevDate = useMemo(
    () => previousTradingDay(effectiveCurrDate),
    [effectiveCurrDate],
  )

  const isNonTradingPick = pickedDate !== effectiveCurrDate

  const [rows, setRows] = useState<HoldingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEtf, setSelectedEtf] = useState<string>(ETF_CODES[0] ?? '00980A')
  const [stockQuery, setStockQuery] = useState('')
  const [pickedStockCode, setPickedStockCode] = useState<string | null>(null)

  // 防止非同步競態：只允許最新一次載入更新畫面
  const loadSeqRef = useRef(0)
  const activeLoadRef = useRef(0)

  const loadSnapshots = useCallback(async (): Promise<void> => {
    const seq = (loadSeqRef.current += 1)
    activeLoadRef.current = seq

    setLoading(true)
    setError(null)
    try {
      const data =
        mock || !supabase
          ? buildMockSnapshots(prevDate, effectiveCurrDate)
          : await fetchSnapshotsForDates(supabase, [prevDate, effectiveCurrDate])

      if (activeLoadRef.current !== seq) return
      setRows(data)
    } catch (e) {
      if (activeLoadRef.current !== seq) return
      setError(e instanceof Error ? e.message : '載入失敗')
      setRows([])
    } finally {
      if (activeLoadRef.current !== seq) return
      setLoading(false)
    }
  }, [mock, supabase, prevDate, effectiveCurrDate])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  const reloadRef = useRef(loadSnapshots)
  reloadRef.current = loadSnapshots

  const byEtf = useMemo(
    () => groupByEtfAndDate(rows, prevDate, effectiveCurrDate),
    [rows, prevDate, effectiveCurrDate],
  )

  const currRows = useMemo(
    () => rows.filter((r) => r.trade_date === effectiveCurrDate),
    [rows, effectiveCurrDate],
  )
  const prevRows = useMemo(() => rows.filter((r) => r.trade_date === prevDate), [rows, prevDate])

  const prevByEtfStock = useMemo(() => {
    const m = new Map<string, Map<string, HoldingRow>>()
    for (const r of prevRows) {
      let sub = m.get(r.etf_code)
      if (!sub) {
        sub = new Map()
        m.set(r.etf_code, sub)
      }
      sub.set(r.stock_code, r)
    }
    return m
  }, [prevRows])

  const stockMatches = useMemo(() => {
    const q = stockQuery.trim()
    if (q.length === 0) return []
    const qUpper = q.toUpperCase()
    const out = new Map<string, { stock_code: string; stock_name: string }>()
    for (const r of currRows) {
      const codeHit = r.stock_code.includes(qUpper)
      const name = r.stock_name ?? ''
      const nameHit = name.includes(q) || name.includes(qUpper)
      if (!codeHit && !nameHit) continue
      if (!out.has(r.stock_code)) {
        out.set(r.stock_code, {
          stock_code: r.stock_code,
          stock_name: r.stock_name ?? '—',
        })
      }
      if (out.size >= 20) break
    }
    return [...out.values()].sort((a, b) => a.stock_code.localeCompare(b.stock_code))
  }, [currRows, stockQuery])

  useEffect(() => {
    const q = stockQuery.trim()
    if (q.length === 0) {
      setPickedStockCode(null)
      return
    }
    const qUpper = q.toUpperCase()
    const exact = stockMatches.find((m) => m.stock_code === qUpper)
    if (exact) {
      setPickedStockCode(exact.stock_code)
      return
    }
    if (stockMatches.length === 1) {
      setPickedStockCode(stockMatches[0]!.stock_code)
    }
  }, [stockMatches, stockQuery])

  const pickedStockInfo = useMemo(() => {
    if (!pickedStockCode) return null
    const hit = currRows.find((r) => r.stock_code === pickedStockCode)
    return hit
      ? { stock_code: pickedStockCode, stock_name: hit.stock_name ?? '—' }
      : { stock_code: pickedStockCode, stock_name: '—' }
  }, [currRows, pickedStockCode])

  const pickedStockHoldings = useMemo(() => {
    if (!pickedStockCode) return []
    const out: {
      etf_code: string
      etf_name: string
      weight_pct: number | null
      deltaLots: number | null
    }[] = []
    for (const r of currRows) {
      if (r.stock_code !== pickedStockCode) continue
      const prow = prevByEtfStock.get(r.etf_code)?.get(r.stock_code)
      const currLots = toLots(r.shares)
      const prevLots = prow ? toLots(prow.shares) : 0
      const deltaLots =
        currLots === null ? null : currLots - (prevLots === null ? 0 : prevLots)
      out.push({
        etf_code: r.etf_code,
        etf_name: etfFundName(r.etf_code),
        weight_pct: r.weight_pct,
        deltaLots,
      })
    }
    out.sort((a, b) => (b.weight_pct ?? -1) - (a.weight_pct ?? -1))
    return out
  }, [currRows, pickedStockCode, prevByEtfStock])

  const anyCurrRows = useMemo(
    () => rows.some((r) => r.trade_date === effectiveCurrDate),
    [rows, effectiveCurrDate],
  )

  /** 當日快照缺失：上一日有資料、但當日（effectiveCurrDate）完全沒有任何列 */
  const missingCurrEtfs = useMemo(() => {
    // 若整體「當日」完全沒有任何列（代表資料庫尚未更新/讀取不到當日），不要把各 ETF 誤判為「缺快照」
    if (!anyCurrRows) return []
    const out: string[] = []
    for (const [code, g] of byEtf) {
      if (g.prev.length > 0 && g.curr.length === 0) out.push(code)
    }
    out.sort()
    return out
  }, [anyCurrRows, byEtf])
  const missingCurrSet = useMemo(() => new Set(missingCurrEtfs), [missingCurrEtfs])

  const deltas = useMemo(() => computeAllEtfDeltas(byEtf), [byEtf])

  /** 排行用：排除「當日快照缺失」ETF，避免誤判大量「完全剔除」 */
  const deltasForRank = useMemo(() => {
    if (missingCurrEtfs.length === 0) return deltas
    const m = new Map<string, EtfDelta>()
    for (const [code, d] of deltas) {
      if (!missingCurrSet.has(code)) m.set(code, d)
    }
    return m
  }, [deltas, missingCurrEtfs.length, missingCurrSet])

  const { topNew, topRemoved } = useMemo(
    () => aggregateNewAndRemoved(deltasForRank),
    [deltasForRank],
  )
  const buyEtfsByStock = useMemo(() => etfCodesByStockForAdded(deltasForRank), [deltasForRank])
  const sellEtfsByStock = useMemo(() => etfCodesByStockForRemoved(deltasForRank), [deltasForRank])

  const missingPrev = useMemo(() => {
    let anyPrev = false
    for (const r of rows) {
      if (r.trade_date === prevDate) {
        anyPrev = true
        break
      }
    }
    return rows.length > 0 && !anyPrev
  }, [rows, prevDate])

  const [rankModal, setRankModal] = useState<{
    variant: 'buy' | 'sell'
    stock_code: string
    stock_name: string | null
    etfCodes: string[]
  } | null>(null)

  const [maxTradeDate, setMaxTradeDate] = useState<string | null>(null)
  /** 本地「已按知道了」後強制重算 spotlight */
  const [spotlightTick, setSpotlightTick] = useState(0)

  const userTouchedDateRef = useRef(false)

  const lastSeenMaxTradeDateRef = useRef<string | null>(null)
  useEffect(() => {
    lastSeenMaxTradeDateRef.current = maxTradeDate
  }, [maxTradeDate])

  /** 台灣時間約 20:00 ingest 後：輪詢資料庫最新 trade_date，若有推進則自動重新載入（等同按「重新載入」） */
  useEffect(() => {
    if (mock || !supabase) return undefined

    let cancelled = false

    async function maybeRefreshAfterIngest() {
      if (cancelled || !isEveningIngestPollWindow()) return
      try {
        const d = await fetchMaxTradeDate(supabase)
        if (cancelled || !d) return
        const prevMax = lastSeenMaxTradeDateRef.current
        lastSeenMaxTradeDateRef.current = d
        setMaxTradeDate(d)
        // 若資料庫出現更新日（trade_date 推進），自動切到最新日期並重新載入
        // 但若使用者已手動選過日期，則不強制改掉他選的日期，只做背景重載。
        if (prevMax === null || d > prevMax) {
          if (!userTouchedDateRef.current && d !== pickedDate) {
            // 只切日期，讓主載入 effect 依新日期抓資料，避免先用舊日期 reload 造成畫面短暫跳動
            setPickedDate(d)
            return
          }
          // 若不切日期（使用者已選日期或已在最新），才做背景重抓
          await reloadRef.current()
        }
      } catch {
        /* 略過輪詢錯誤 */
      }
    }

    const id = setInterval(() => void maybeRefreshAfterIngest(), 60_000)
    void maybeRefreshAfterIngest()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void maybeRefreshAfterIngest()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mock, supabase])

  useEffect(() => {
    if (mock || !supabase) {
      queueMicrotask(() => setMaxTradeDate(null))
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchMaxTradeDate(supabase)
        if (!cancelled) setMaxTradeDate(d)
        // 台灣 20:00 之後：若 DB 已有更新日且使用者尚未手動選日期，直接切到最新
        if (!cancelled && d && isAfterTaipeiIngestTime() && !userTouchedDateRef.current) {
          if (d !== pickedDate) setPickedDate(d)
        }
      } catch {
        if (!cancelled) setMaxTradeDate(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mock, supabase, pickedDate])

  const spotlight = useMemo(() => {
    if (mock || loading || missingPrev || topNew.length === 0) return null
    if (maxTradeDate && effectiveCurrDate !== maxTradeDate) return null
    if (!maxTradeDate) return null
    if (readSpotlightSeen().has(effectiveCurrDate)) return null
    const top = topNew[0]
    return {
      stock_code: top.stock_code,
      stock_name: top.stock_name,
      etfCount: top.etfCount,
      tradeDate: effectiveCurrDate,
    }
  }, [
    spotlightTick,
    mock,
    loading,
    missingPrev,
    topNew,
    maxTradeDate,
    effectiveCurrDate,
  ])

  const openRankModal = useCallback(
    (variant: 'buy' | 'sell', stock_code: string, stock_name: string | null) => {
      const etfCodes =
        variant === 'buy'
          ? (buyEtfsByStock.get(stock_code) ?? [])
          : (sellEtfsByStock.get(stock_code) ?? [])
      setRankModal({ variant, stock_code, stock_name, etfCodes })
    },
    [buyEtfsByStock, sellEtfsByStock],
  )

  const detail: EtfDelta | undefined = deltas.get(selectedEtf)
  const selectedMissingCurr = anyCurrRows && missingCurrSet.has(selectedEtf)
  const selectedGroup = byEtf.get(selectedEtf)

  const detailDecks = useMemo(() => {
    const prev = selectedGroup?.prev ?? []
    const curr = selectedGroup?.curr ?? []

    const pm = new Map(prev.map((r) => [r.stock_code, r] as const))
    const cm = new Map(curr.map((r) => [r.stock_code, r] as const))

    const added: DetailRow[] = []
    const removed: DetailRow[] = []
    const stillHeld: DetailRow[] = []

    for (const [code, crow] of cm) {
      const prow = pm.get(code)
      const currLots = toLots(crow.shares)
      const prevLots = prow ? toLots(prow.shares) : 0
      const deltaLots =
        currLots === null ? null : currLots - (prevLots === null ? 0 : prevLots)

      if (!prow) {
        added.push({
          stock_code: code,
          stock_name: crow.stock_name ?? '—',
          weight_pct: crow.weight_pct,
          deltaLots,
        })
      } else {
        stillHeld.push({
          stock_code: code,
          stock_name: crow.stock_name ?? prow.stock_name ?? '—',
          weight_pct: crow.weight_pct,
          deltaLots,
        })
      }
    }

    for (const [code, prow] of pm) {
      if (cm.has(code)) continue
      const prevLots = toLots(prow.shares)
      const deltaLots = prevLots === null ? null : 0 - prevLots
      removed.push({
        stock_code: code,
        stock_name: prow.stock_name ?? '—',
        weight_pct: null, // 當日不存在，權重以當日為準 → 顯示 —
        deltaLots,
      })
    }

    const byWeightDesc = (a: DetailRow, b: DetailRow) =>
      (b.weight_pct ?? -1) - (a.weight_pct ?? -1)

    added.sort(byWeightDesc)
    stillHeld.sort(byWeightDesc)
    // removed 無當日權重，用前日權重排序比較直覺（可之後再調）
    removed.sort((a, b) => (pm.get(b.stock_code)?.weight_pct ?? -1) - (pm.get(a.stock_code)?.weight_pct ?? -1))

    return { added, removed, stillHeld }
  }, [selectedGroup])

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <h1 className="title">台灣主動式 ETF 持股變動</h1>
          <p className="subtitle">
            比對 <strong>{prevDate}</strong> → <strong>{effectiveCurrDate}</strong>
            （上一交易日 → 資料基準日）
          </p>
        </div>
        <div className="toolbar">
          <label className="field">
            <span>報表日期</span>
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => {
                userTouchedDateRef.current = true
                setPickedDate(e.target.value)
              }}
            />
          </label>
          <button type="button" className="btn" onClick={() => void loadSnapshots()} disabled={loading}>
            重新載入
          </button>
        </div>
        {maxTradeDate && effectiveCurrDate !== maxTradeDate && (
          <div className="banner info">
            資料庫已有較新資料日 <strong>{maxTradeDate}</strong>。
            <button
              type="button"
              className="btn"
              onClick={() => {
                userTouchedDateRef.current = true
                setPickedDate(maxTradeDate)
              }}
              disabled={loading}
              style={{ marginLeft: 10 }}
            >
              切換到最新
            </button>
          </div>
        )}
        {isNonTradingPick && (
          <div className="banner info">
            您選擇的日期（<strong>{pickedDate}</strong>）為休市日；下列為
            <strong>最近交易日 {effectiveCurrDate}</strong>
            與其前一交易日（<strong>{prevDate}</strong>）持股之差異分析。
          </div>
        )}
        {!loading && rows.length > 0 && !anyCurrRows && (
          <div className="banner warn">
            目前讀取不到 <strong>{effectiveCurrDate}</strong> 的任何快照列（資料庫尚未更新或權限/快取造成延遲）。因此不顯示「當日缺漏 ETF」判定，請稍後再按一次「重新載入」或點「切換到最新」。
          </div>
        )}
        {missingCurrEtfs.length > 0 && (
          <div className="banner warn">
            下列 ETF 在 <strong>{effectiveCurrDate}</strong> 缺少快照（可能來源尚未更新），已自動排除於「完全剔除」排行：
            <strong style={{ marginLeft: 6 }}>{missingCurrEtfs.join('、')}</strong>
          </div>
        )}
        <p className="meta">
          {mock ? (
            <>目前為 <strong>示範資料</strong>。設定 <code>VITE_SUPABASE_URL</code> 可改連雲端。</>
          ) : (
            <>資料來源：Supabase <code>holdings_snapshot</code></>
          )}
        </p>
      </header>

        {error && <div className="banner error">{error}</div>}
      {missingPrev && (
        <div className="banner warn">
          資料庫中找不到上一交易日 <strong>{prevDate}</strong> 的快照，無法計算「新增／剔除／差分」。請先完成擷取或改用示範模式。
        </div>
      )}
      {selectedMissingCurr && (
        <div className="banner warn">
          <strong>{selectedEtf}</strong> 在 <strong>{effectiveCurrDate}</strong> 沒有任何快照列；下方「剔除」多半是資料缺漏造成的誤判（已排除於跨 ETF 的「完全剔除」排行）。
        </div>
      )}

      {spotlight && (
        <div className="banner spotlight" role="status">
          <div className="spotlight-inner">
            <span className="spotlight-badge">更新</span>
            <span className="spotlight-text">
              跨 12 檔 · 新納入檔數最多：
              <strong>
                {spotlight.stock_code} {spotlight.stock_name ?? ''}
              </strong>
              （{spotlight.etfCount} 檔基金）
            </span>
            <button
              type="button"
              className="btn btn-spotlight"
              onClick={() =>
                openRankModal('buy', spotlight.stock_code, spotlight.stock_name)
              }
            >
              查看 ETF
            </button>
            <button
              type="button"
              className="btn btn-spotlight-secondary"
              onClick={() => {
                markSpotlightSeen(spotlight.tradeDate)
                setSpotlightTick((n) => n + 1)
              }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      <section className="section leaderboard">
        <h2 className="section-title">跨 12 檔基金 · 當日熱度（依檔數）</h2>
        <div className="leader-grid">
          <div className="panel panel--deck">
            <h3 className="panel-title">
              最多檔基金「新納入」的個股
              <span className="panel-legend panel-legend--buy">
                紅色越深 · 越多檔基金加碼／新買 · 點字卡查看 ETF
              </span>
            </h3>
            <RankCardDeck
              variant="buy"
              rows={topNew.slice(0, 20)}
              emptyHint="無新納入資料"
              onOpenStock={(code, name) => openRankModal('buy', code, name)}
            />
          </div>
          <div className="panel panel--deck">
            <h3 className="panel-title">
              最多檔基金「完全剔除」的個股
              <span className="panel-legend panel-legend--sell">
                綠色越深 · 越多檔基金賣出／剔除 · 點字卡查看 ETF
              </span>
            </h3>
            <RankCardDeck
              variant="sell"
              rows={topRemoved.slice(0, 20)}
              emptyHint="無剔除資料"
              onOpenStock={(code, name) => openRankModal('sell', code, name)}
            />
          </div>
        </div>
      </section>

      <section className="section detail">
        <div className="detail-head">
          <h2 className="section-title">單檔 ETF 明細</h2>
          <div className="detail-controls">
            <label className="field inline">
              <span>個股搜尋</span>
              <input
                type="text"
                value={stockQuery}
                placeholder="輸入代碼或名稱（例：2330 / 台積）"
                onChange={(e) => setStockQuery(e.target.value)}
              />
            </label>
            <label className="field inline">
              <span>選擇 ETF</span>
              <select value={selectedEtf} onChange={(e) => setSelectedEtf(e.target.value)}>
                {ETF_ALLOWLIST.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.code} {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="muted">載入中…</p>
        ) : detail ? (
          <div className="detail-grid">
            <div className="panel panel--deck">
              <h3 className="panel-title">
                新增持股
                <span className="panel-legend panel-legend--buy">加碼／新買</span>
              </h3>
              <DetailStockDeck
                variant="buy"
                rows={detailDecks.added}
                emptyHint="無新增"
              />
            </div>
            <div className="panel panel--deck">
              <h3 className="panel-title">
                完全剔除（不再持有）
                <span className="panel-legend panel-legend--sell">賣超／出清</span>
              </h3>
              <DetailStockDeck
                variant="sell"
                rows={detailDecks.removed}
                emptyHint="無剔除"
              />
            </div>
            <div className="panel wide panel--deck">
              <h3 className="panel-title">持續持有（兩日皆在成分中）</h3>
              <DetailStockDeck
                variant="neutral"
                rows={detailDecks.stillHeld}
                emptyHint="無資料"
              />
            </div>
          </div>
        ) : (
          <p className="muted">無明細</p>
        )}

        <div className="stock-search">
          {stockQuery.trim().length > 0 && stockMatches.length > 1 && (
            <div className="stock-search__matches">
              <span className="muted">符合：</span>
              {stockMatches.slice(0, 10).map((m) => (
                <button
                  key={m.stock_code}
                  type="button"
                  className={`chip ${pickedStockCode === m.stock_code ? 'chip--active' : ''}`}
                  onClick={() => setPickedStockCode(m.stock_code)}
                >
                  <span className="mono">{m.stock_code}</span> {m.stock_name}
                </button>
              ))}
            </div>
          )}

          {pickedStockInfo && (
            <div className="panel stock-panel">
              <h3 className="panel-title">
                個股持有一覽：<span className="mono">{pickedStockInfo.stock_code}</span>{' '}
                {pickedStockInfo.stock_name}
              </h3>
              {pickedStockHoldings.length === 0 ? (
                <p className="muted">當日（{effectiveCurrDate}）沒有任何 ETF 持有此股</p>
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>ETF</th>
                        <th>基金</th>
                        <th className="num">權重（當日）</th>
                        <th className="num">Δ張（當日-前日）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickedStockHoldings.map((r) => (
                        <tr key={r.etf_code}>
                          <td className="mono">{r.etf_code}</td>
                          <td>{r.etf_name}</td>
                          <td className="num">{formatWeightPct(r.weight_pct)}</td>
                          <td className="num">{formatLotsDelta(r.deltaLots) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        <span>{etfLabel(selectedEtf)}</span>
        <span> · </span>
        <span>僅供研究整理，非投資建議</span>
      </footer>

      {rankModal && (
        <StockEtfModal
          variant={rankModal.variant}
          stockCode={rankModal.stock_code}
          stockName={rankModal.stock_name}
          etfCodes={rankModal.etfCodes}
          prevDate={prevDate}
          effectiveCurrDate={effectiveCurrDate}
          onClose={() => setRankModal(null)}
        />
      )}
    </div>
  )
}

function RankCardDeck({
  variant,
  rows,
  emptyHint,
  onOpenStock,
}: {
  variant: 'buy' | 'sell'
  rows: { stock_code: string; stock_name: string | null; etfCount: number }[]
  emptyHint: string
  onOpenStock: (stock_code: string, stock_name: string | null) => void
}) {
  if (rows.length === 0) {
    return <p className="muted">{emptyHint}</p>
  }

  const maxCount = rows[0]?.etfCount ?? 1

  return (
    <ul className={`rank-card-deck rank-card-deck--${variant}`}>
      {rows.map((r, i) => {
        const t = intensity(r.etfCount, maxCount)
        const pal = variant === 'buy' ? paletteBuy(t) : paletteSell(t)
        const labelHint =
          variant === 'buy'
            ? `查看哪些 ETF 新納入 ${r.stock_code}`
            : `查看哪些 ETF 剔除 ${r.stock_code}`
        return (
          <li key={r.stock_code}>
            <button
              type="button"
              className={`rank-card--btn rank-card--${variant}`}
              style={{
                background: pal.background,
                borderColor: pal.border,
                color: pal.codeColor,
              }}
              aria-label={labelHint}
              onClick={() => onOpenStock(r.stock_code, r.stock_name)}
            >
              <span className="rank-card__bar" style={{ background: pal.accentBar }} aria-hidden />
              <span className="rank-card__idx" style={{ color: pal.rankColor }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="rank-card__body">
                <span className="rank-card__code" style={{ color: pal.codeColor }}>
                  {r.stock_code}
                </span>
                <span className="rank-card__name" style={{ color: pal.nameColor }}>
                  {r.stock_name ?? '—'}
                </span>
              </div>
              <span
                className="rank-card__badge"
                style={{ background: pal.badgeBg, color: pal.badgeColor }}
              >
                {r.etfCount} 檔
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function StockEtfModal({
  variant,
  stockCode,
  stockName,
  etfCodes,
  prevDate,
  effectiveCurrDate,
  onClose,
}: {
  variant: 'buy' | 'sell'
  stockCode: string
  stockName: string | null
  etfCodes: string[]
  prevDate: string
  effectiveCurrDate: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const titleTag = variant === 'buy' ? '新納入／加碼' : '完全剔除／賣出'
  const caption =
    variant === 'buy' ? (
      <>
        比對 <strong>{prevDate}</strong> → <strong>{effectiveCurrDate}</strong>
        ，下列 ETF 在當日持股中「新納入」該股。
      </>
    ) : (
      <>
        比對 <strong>{prevDate}</strong> → <strong>{effectiveCurrDate}</strong>
        ，下列 ETF 在當日持股中已不再持有該股。
      </>
    )

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal modal--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-etf-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id="stock-etf-modal-title" className="modal__title">
            <span className="modal__title-line">
              <span className="modal__stock mono">{stockCode}</span>
              <span className="modal__name">{stockName ?? '—'}</span>
            </span>
            <span className="modal__tag">{titleTag}的 ETF</span>
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>
        <p className="modal__caption">{caption}</p>
        {etfCodes.length === 0 ? (
          <p className="modal__empty muted">無對應 ETF 資料</p>
        ) : (
          <ol className="modal__etf-list">
            {etfCodes.map((code) => (
              <li key={code} className="modal__etf-item">
                <span className="modal__etf-code mono">{code}</span>
                <span className="modal__etf-name">{etfFundName(code)}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

type DetailRow = {
  stock_code: string
  stock_name: string
  /** 當日（資料基準日）權重，百分比 */
  weight_pct: number | null
  /** 與前一日相較的張數變化（1 張 = 1000 股）；無資料則為 null */
  deltaLots: number | null
}

function DetailStockDeck({
  variant,
  rows,
  emptyHint,
}: {
  variant: 'buy' | 'sell' | 'neutral'
  rows: DetailRow[]
  emptyHint: string
}) {
  if (rows.length === 0) {
    return <p className="muted">{emptyHint}</p>
  }

  const n = rows.length

  return (
    <ul className={`detail-card-deck detail-card-deck--${variant}`}>
      {rows.map((r, i) => {
        let pal
        if (variant === 'buy') {
          const t = n <= 1 ? 0.35 : 0.12 + (1 - i / (n - 1)) * 0.38
          pal = paletteBuy(t)
        } else if (variant === 'sell') {
          const t = n <= 1 ? 0.35 : 0.12 + (1 - i / (n - 1)) * 0.38
          pal = paletteSell(t)
        } else {
          pal = null
        }

        if (!pal) {
          return (
            <li key={`${r.stock_code}-${i}`} className="detail-card detail-card--neutral">
              <span className="detail-card__bar detail-card__bar--neutral" aria-hidden />
              <div className="detail-card__body">
                <span className="detail-card__code">{r.stock_code}</span>
                <span className="detail-card__name">{r.stock_name}</span>
              </div>
              <div className="detail-card__meta">
                <span className="detail-card__weight">{formatWeightPct(r.weight_pct)}</span>
                {formatLotsDelta(r.deltaLots) && (
                  <span className="detail-card__delta">{formatLotsDelta(r.deltaLots)}</span>
                )}
              </div>
            </li>
          )
        }

        return (
          <li
            key={`${r.stock_code}-${i}`}
            className="detail-card"
            style={{
              background: pal.background,
              borderColor: pal.border,
            }}
          >
            <span className="detail-card__bar" style={{ background: pal.accentBar }} aria-hidden />
            <div className="detail-card__body">
              <span className="detail-card__code" style={{ color: pal.codeColor }}>
                {r.stock_code}
              </span>
              <span className="detail-card__name" style={{ color: pal.nameColor }}>
                {r.stock_name}
              </span>
            </div>
            <div className="detail-card__meta">
              <span className="detail-card__weight" style={{ color: pal.codeColor }}>
                {formatWeightPct(r.weight_pct)}
              </span>
              {formatLotsDelta(r.deltaLots) && (
                <span className="detail-card__delta" style={{ color: pal.nameColor }}>
                  {formatLotsDelta(r.deltaLots)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
