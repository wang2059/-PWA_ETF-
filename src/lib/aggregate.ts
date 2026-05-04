import type { CrossEtfRank, EtfDelta } from './types'

/** 跨 ETF：統計「當日被多少檔基金新納入／完全剔除」 */
export function aggregateNewAndRemoved(
  deltas: Map<string, EtfDelta>,
): { topNew: CrossEtfRank[]; topRemoved: CrossEtfRank[] } {
  const newCount = new Map<string, { count: number; name: string | null }>()
  const removedCount = new Map<string, { count: number; name: string | null }>()

  for (const d of deltas.values()) {
    for (const a of d.added) {
      const cur = newCount.get(a.stock_code) ?? { count: 0, name: a.stock_name }
      cur.count += 1
      cur.name = cur.name ?? a.stock_name
      newCount.set(a.stock_code, cur)
    }
    for (const r of d.removed) {
      const cur = removedCount.get(r.stock_code) ?? { count: 0, name: r.stock_name }
      cur.count += 1
      cur.name = cur.name ?? r.stock_name
      removedCount.set(r.stock_code, cur)
    }
  }

  const toRank = (m: Map<string, { count: number; name: string | null }>): CrossEtfRank[] =>
    [...m.entries()]
      .map(([stock_code, v]) => ({
        stock_code,
        stock_name: v.name,
        etfCount: v.count,
      }))
      .sort((a, b) => b.etfCount - a.etfCount)

  return {
    topNew: toRank(newCount),
    topRemoved: toRank(removedCount),
  }
}

/** 個股代號 → 將該股列為「新增持股」的 ETF 代碼列表（可排序） */
export function etfCodesByStockForAdded(deltas: Map<string, EtfDelta>): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [etfCode, d] of deltas) {
    for (const a of d.added) {
      const arr = m.get(a.stock_code) ?? []
      arr.push(etfCode)
      m.set(a.stock_code, arr)
    }
  }
  for (const [k, arr] of m) {
    arr.sort()
    m.set(k, arr)
  }
  return m
}

/** 個股代號 → 將該股「完全剔除」的 ETF 代碼列表 */
export function etfCodesByStockForRemoved(deltas: Map<string, EtfDelta>): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [etfCode, d] of deltas) {
    for (const r of d.removed) {
      const arr = m.get(r.stock_code) ?? []
      arr.push(etfCode)
      m.set(r.stock_code, arr)
    }
  }
  for (const [k, arr] of m) {
    arr.sort()
    m.set(k, arr)
  }
  return m
}
