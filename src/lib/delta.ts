import type { EtfDelta, HoldingRow } from './types'

function keyRows(rows: HoldingRow[]): Map<string, HoldingRow> {
  const m = new Map<string, HoldingRow>()
  for (const r of rows) {
    m.set(r.stock_code, r)
  }
  return m
}

export function computeEtfDelta(prev: HoldingRow[], curr: HoldingRow[]): EtfDelta {
  const etfCode = curr[0]?.etf_code ?? prev[0]?.etf_code ?? ''
  const pm = keyRows(prev)
  const cm = keyRows(curr)

  const added: EtfDelta['added'] = []
  const removed: EtfDelta['removed'] = []
  const stillHeld: EtfDelta['stillHeld'] = []

  for (const [code, row] of cm) {
    if (!pm.has(code)) {
      added.push({
        stock_code: code,
        stock_name: row.stock_name,
      })
    }
  }

  for (const [code, prow] of pm) {
    if (!cm.has(code)) {
      removed.push({
        stock_code: code,
        stock_name: prow.stock_name,
      })
    }
  }

  for (const [code, crow] of cm) {
    const prow = pm.get(code)
    if (!prow) continue
    stillHeld.push({
      stock_code: code,
      stock_name: crow.stock_name ?? prow.stock_name,
    })
  }

  return { etfCode, added, removed, stillHeld }
}

export function computeAllEtfDeltas(
  byEtf: Map<string, { prev: HoldingRow[]; curr: HoldingRow[] }>,
): Map<string, EtfDelta> {
  const out = new Map<string, EtfDelta>()
  for (const [etf, { prev, curr }] of byEtf) {
    out.set(etf, computeEtfDelta(prev, curr))
  }
  return out
}
