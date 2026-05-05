/** 台北當日 0–1439（與 Intl 一致） */
export function taipeiMinutesSinceMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/**
 * 對齊每日 ingest（台灣 20:00 前後）：短視窗輪詢是否有新 trade_date。
 * 區間稍寬以吸收 GitHub 排程延遲。
 */
export function isEveningIngestPollWindow(now = new Date()): boolean {
  const m = taipeiMinutesSinceMidnight(now)
  // 拉長到晚間，避免 ingest/部署延遲導致錯過自動刷新
  return m >= 19 * 60 + 55 && m <= 23 * 60 + 30
}

/** 台灣時間已過每日 ingest 時刻（20:00） */
export function isAfterTaipeiIngestTime(now = new Date()): boolean {
  return taipeiMinutesSinceMidnight(now) >= 20 * 60
}
