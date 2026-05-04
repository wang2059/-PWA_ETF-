/** 字卡用：依強度 t∈[0,1] 在淺色與深色間插值（買超紅、賣超綠） */

type RGB = { r: number; g: number; b: number }

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  }
}

function toRgb(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

export type RankCardPalette = {
  background: string
  border: string
  accentBar: string
  codeColor: string
  nameColor: string
  rankColor: string
  badgeBg: string
  badgeColor: string
}

/** 買超／加碼：淺紅 → 深紅 */
export function paletteBuy(tRaw: number): RankCardPalette {
  const t = Math.min(1, Math.max(0, tRaw))
  const bgA: RGB = { r: 255, g: 247, b: 247 }
  const bgB: RGB = { r: 153, g: 27, b: 27 }
  const bg = lerpRgb(bgA, bgB, t)
  const border = lerpRgb({ r: 254, g: 202, b: 202 }, { r: 127, g: 29, b: 29 }, t)
  const accentBar = lerpRgb({ r: 252, g: 165, b: 165 }, { r: 69, g: 10, b: 10 }, t)
  const darkText = t < 0.42
  const codeColor = darkText ? '#7f1d1d' : '#ffffff'
  const nameColor = darkText ? '#991b1b' : 'rgba(255,255,255,0.92)'
  const rankColor = darkText ? '#b91c1c' : 'rgba(255,255,255,0.75)'
  const badgeBg = darkText ? 'rgba(185, 28, 28, 0.15)' : 'rgba(255,255,255,0.22)'
  const badgeColor = darkText ? '#991b1b' : '#fff'

  return {
    background: toRgb(bg),
    border: toRgb(border),
    accentBar: toRgb(accentBar),
    codeColor,
    nameColor,
    rankColor,
    badgeBg,
    badgeColor,
  }
}

/** 賣超：淺綠 → 深綠 */
export function paletteSell(tRaw: number): RankCardPalette {
  const t = Math.min(1, Math.max(0, tRaw))
  const bgA: RGB = { r: 240, g: 253, b: 244 }
  const bgB: RGB = { r: 20, g: 83, b: 45 }
  const bg = lerpRgb(bgA, bgB, t)
  const border = lerpRgb({ r: 187, g: 247, b: 208 }, { r: 22, g: 101, b: 52 }, t)
  const accentBar = lerpRgb({ r: 134, g: 239, b: 172 }, { r: 6, g: 78, b: 59 }, t)
  const darkText = t < 0.42
  const codeColor = darkText ? '#14532d' : '#ffffff'
  const nameColor = darkText ? '#166534' : 'rgba(255,255,255,0.92)'
  const rankColor = darkText ? '#15803d' : 'rgba(255,255,255,0.75)'
  const badgeBg = darkText ? 'rgba(22, 101, 52, 0.14)' : 'rgba(255,255,255,0.2)'
  const badgeColor = darkText ? '#166534' : '#fff'

  return {
    background: toRgb(bg),
    border: toRgb(border),
    accentBar: toRgb(accentBar),
    codeColor,
    nameColor,
    rankColor,
    badgeBg,
    badgeColor,
  }
}

/** 依列表最大檔數換算強度 */
export function intensity(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0
  return count / maxCount
}
