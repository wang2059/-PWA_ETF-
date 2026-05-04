/** 境內主動式 ETF（排除 00983A、00990A）— 與計畫書一致 */
export const ETF_ALLOWLIST = [
  { code: '00980A', name: '主動野村臺灣優選', issuer: '野村投信' },
  { code: '00981A', name: '主動統一台股增長', issuer: '統一投信' },
  { code: '00982A', name: '主動群益台灣強棒', issuer: '群益投信' },
  { code: '00985A', name: '主動野村台灣50', issuer: '野村投信' },
  { code: '00986A', name: '主動台新龍頭成長', issuer: '台新投信' },
  { code: '00987A', name: '主動台新優勢成長', issuer: '台新投信' },
  { code: '00991A', name: '主動復華未來50', issuer: '復華投信' },
  { code: '00992A', name: '主動群益科技創新', issuer: '群益投信' },
  { code: '00993A', name: '主動安聯台灣', issuer: '安聯投信' },
  { code: '00994A', name: '主動第一金台股優', issuer: '第一金投信' },
  { code: '00995A', name: '主動中信台灣卓越', issuer: '中信投信' },
  { code: '00996A', name: '主動兆豐台灣豐收', issuer: '兆豐投信' },
] as const

export const ETF_CODES = ETF_ALLOWLIST.map((e) => e.code)

export function etfLabel(code: string): string {
  const row = ETF_ALLOWLIST.find((e) => e.code === code)
  return row ? `${row.code} ${row.name}` : code
}

/** 基金簡稱（不含代號），供彈窗列表避免代號重複 */
export function etfFundName(code: string): string {
  return ETF_ALLOWLIST.find((e) => e.code === code)?.name ?? code
}
