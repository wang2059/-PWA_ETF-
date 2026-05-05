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

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)
      try {
        let data: HoldingRow[]
        if (mock || !supabase) {
          data = buildMockSnapshots(prevDate, effectiveCurrDate)
        } else {
          data = await fetchSnapshotsForDates(supabase, [prevDate, effectiveCurrDate])
        }
        if (!cancelled) setRows(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '載入失敗')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [mock, supabase, prevDate, effectiveCurrDate])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      if (mock || !supabase) {
        setRows(buildMockSnapshots(prevDate, effectiveCurrDate))
      } else {
        const data = await fetchSnapshotsForDates(supabase, [prevDate, effectiveCurrDate])
        setRows(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const byEtf = useMemo(
    () => groupByEtfAndDate(rows, prevDate, effectiveCurrDate),
    [rows, prevDate, effectiveCurrDate],
  )

  /** 當日快照缺失：上一日有資料、但當日（effectiveCurrDate）完全沒有任何列 */
  const missingCurrEtfs = useMemo(() => {
    const out: string[] = []
    for (const [code, g] of byEtf) {
      if (g.prev.length > 0 && g.curr.length === 0) out.push(code)
    }
    out.sort()
    return out
  }, [byEtf])
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

  const reloadRef = useRef(reload)
  reloadRef.current = reload

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
            setPickedDate(d)
          }
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
  const selectedMissingCurr = missingCurrSet.has(selectedEtf)

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
          <button type="button" className="btn" onClick={() => void reload()} disabled={loading}>
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
                rows={detail.added.map((r) => ({
                  stock_code: r.stock_code,
                  stock_name: r.stock_name ?? '—',
                }))}
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
                rows={detail.removed.map((r) => ({
                  stock_code: r.stock_code,
                  stock_name: r.stock_name ?? '—',
                }))}
                emptyHint="無剔除"
              />
            </div>
            <div className="panel wide panel--deck">
              <h3 className="panel-title">持續持有（兩日皆在成分中）</h3>
              <DetailStockDeck
                variant="neutral"
                rows={detail.stillHeld.map((r) => ({
                  stock_code: r.stock_code,
                  stock_name: r.stock_name ?? '—',
                }))}
                emptyHint="無資料"
              />
            </div>
          </div>
        ) : (
          <p className="muted">無明細</p>
        )}
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

function DetailStockDeck({
  variant,
  rows,
  emptyHint,
}: {
  variant: 'buy' | 'sell' | 'neutral'
  rows: { stock_code: string; stock_name: string }[]
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
          </li>
        )
      })}
    </ul>
  )
}
