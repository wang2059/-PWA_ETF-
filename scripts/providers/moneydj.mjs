/**
 * MoneyDJ ETF「全部持股」頁（Basic0007B）
 * 僅供自用資料整理；請遵守網站使用條款與請求頻率，勿過度密集請求。
 */
import * as cheerio from 'cheerio'

const HOLDINGS_URL =
  'https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm'

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function fetchMoneydjPortfolio(etfCode) {
  const code = etfCode.replace(/\.tw$/i, '').toUpperCase()
  const etfid = `${code}.TW`
  const sourceUrl = `${HOLDINGS_URL}?etfid=${encodeURIComponent(etfid)}`

  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  })

  if (!res.ok) {
    throw new Error(`MoneyDJ HTTP ${res.status} — ${sourceUrl}`)
  }

  const html = await res.text()
  return parseMoneydjHoldingsHtml(html, code, sourceUrl)
}

function parseMoneydjHoldingsHtml(html, etfCode, sourceUrl) {
  const $ = cheerio.load(html)

  const dateText = $('#ctl00_ctl00_MainContent_MainContent_sdate3').text()
  let trade_date = null
  const dm = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  if (dm) trade_date = `${dm[1]}-${dm[2]}-${dm[3]}`
  if (!trade_date) {
    const fb = html.match(/資料日期[：:\s]*(\d{4})\/(\d{2})\/(\d{2})/)
    if (fb) trade_date = `${fb[1]}-${fb[2]}-${fb[3]}`
  }

  const rows = []
  $('table#ctl00_ctl00_MainContent_MainContent_stable3 tbody tr').each((_, tr) => {
    const $tr = $(tr)
    const a = $tr.find('td.col05 a')
    if (!a.length) return

    const href = a.attr('href') || ''
    const hm = href.match(/etfid=(\d+)\.TW/i)
    if (!hm) return

    const stock_code = hm[1]
    const linkText = a.text().trim()
    const nm = linkText.match(/^(.+?)\((\d+)\.TW\)\s*$/)
    const stock_name = nm ? nm[1].trim() : linkText.replace(/\(\d+\.TW\)\s*$/, '').trim()

    const wText = $tr.find('td.col06').text().replace(/,/g, '').trim()
    const sText = $tr.find('td.col07').text().replace(/,/g, '').trim()
    const weight_pct = wText ? Number.parseFloat(wText) : null
    const shares = sText ? Number.parseFloat(sText) : null

    rows.push({
      stock_code,
      stock_name: stock_name || null,
      weight_pct: Number.isFinite(weight_pct) ? weight_pct : null,
      shares: Number.isFinite(shares) ? shares : null,
    })
  })

  return {
    etf_code: etfCode,
    trade_date,
    rows,
    source_url: sourceUrl,
  }
}
