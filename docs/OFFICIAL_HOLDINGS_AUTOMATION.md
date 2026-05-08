# 官方持股自動化 — 來源策略與環境變數

## 預設策略：Official-first + MoneyDJ fallback

1. 若該檔 ETF 在 [`scripts/config/etf-official-sources.json`](../scripts/config/etf-official-sources.json) 設定為可用之 **官方 driver**（例如 `csv_url` 且提供 `csvUrl`），則**優先**自官方 URL 擷取並正規化。
2. 若官方擷取失敗、或未設定官方來源（`driver: none`），則 **fallback** 至現有 MoneyDJ provider（[`scripts/providers/moneydj.mjs`](../scripts/providers/moneydj.mjs)）。
3. 寫入 Supabase 時，`holdings_snapshot.source` 會標註可追溯字串（見同目錄 `OFFICIAL_HOLDINGS_SOURCES.md` 之「source 欄位規範」）。

## 環境變數（ingest 腳本）

| 變數 | 預設 | 說明 |
|------|------|------|
| `INGEST_OFFICIAL_FIRST` | `1` | `1` = 先試官方再 MoneyDJ；`0` = 僅 MoneyDJ（略過官方） |
| `INGEST_OFFICIAL_ONLY` | `0` | `1` = 只允許官方成功；失敗則該檔不寫入且不 fallback（慎用） |
| `INGEST_HEALTH_STRICT` | `0` | `1` = 健康檢查失敗時 process exit 1 |
| `OFFICIAL_CSV_<ETF>` | — | 覆寫該檔 ETF 的官方 CSV URL（例：`OFFICIAL_CSV_00981A=https://...`），優先於 JSON 內 `csvUrl` |
| `OFFICIAL_TRADE_DATE_<ETF>` | — | 官方 CSV 無「資料日期」欄時，手動指定 `YYYY-MM-DD` |

## Excel／巨集

官方檔若為 **CSV／可直接 URL 下載**，由 ingest 自動解析最穩定。  
若僅提供 **Excel 手動下載**，可改為定期將檔案放到物件儲存或由排程下載後改走 **CSV 匯出 URL**；巨集本身不負責「全自動取檔」。
