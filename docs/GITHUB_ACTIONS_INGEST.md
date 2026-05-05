# GitHub Actions：每日擷取持股

## 排程時間（已依你需求設定）

- **台灣時間 20:00**（晚上 8 點）執行一次，略晚以減少「部分 ETF 頁面尚未換新資料日」的缺漏。
- GitHub 的 `cron` 一律使用 **UTC**：
  - 台灣 **UTC+8** → 20:00 台灣 = **當日 12:00 UTC**
  - 對應 cron：`0 12 * * *`

實際觸發可能 **延遲數分鐘**（GitHub 負載時），屬正常現象。

---

## 你需要設定的 Repository Secrets

在 GitHub Repo：**Settings** → **Secrets and variables** → **Actions** → **New repository secret**：

| Secret 名稱 | 值 |
|-------------|-----|
| `SUPABASE_URL` | Supabase **Project URL**（與 `VITE_SUPABASE_URL` 相同） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** 金鑰（勿外洩） |

勿把 service_role 放進程式碼或前端。

---

## 手動執行一次（測試）

**Actions** 標籤 → 選 **Ingest ETF holdings** → **Run workflow** → 選分支 → **Run workflow**。

---

## 若時間要改

編輯 [`.github/workflows/ingest-holdings.yml`](../.github/workflows/ingest-holdings.yml) 裡的 `cron:`。

換算：`台灣時間` 減 8 小時 = `UTC`（台灣無夏令時間）。

例：台灣 20:00 → UTC 12:00 → `0 12 * * *`（目前專案已用此設定）。

---

## 補跑、單檔重抓（補齊缺漏日）

- **全 12 檔再跑一輪**（本機，需 `.env.ingest`）：

  ```bash
  npm run ingest
  ```

- **只重抓某一檔**（例如台新相關 `00986A`）：

  ```bash
  node scripts/run-ingest.mjs --etf=00986A
  ```

  寫入規則與全量相同：以 MoneyDJ 頁面上的 **「資料日期」** 作為 `trade_date`，並刪除同 `trade_date` + `etf_code` 後再整批 insert。

- **殘酷但重要**：若 MoneyDJ 上該檔**已只顯示更新後的資料日**（例如只顯示 5/5），**無法**用同一支爬蟲「變出」5/4 的歷史快照；常見作法是當天曾成功 ingest 過，或向投信／官方匯出檔自行匯入。

### 5/4 與 5/5 做加減（PWA 上）

- 先讓 `holdings_snapshot` 裡，各檔 ETF 在 **`trade_date = 你關心的兩個交易日`** 都有列（缺哪檔就對該檔補跑 ingest，且頁面資料日必須已是該日）。
- 開 PWA，**報表日期**選 **5/5**（若 5/5 為休市則會對到最近交易日）；程式會用 **`previousTradingDay`** 算出上一交易日（若為 5/4 即會比對 5/4→5/5）。
