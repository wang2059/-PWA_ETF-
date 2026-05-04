# GitHub Actions：每日擷取持股

## 排程時間（已依你需求設定）

- **台灣時間 19:00**（晚上 7 點）執行一次。
- GitHub 的 `cron` 一律使用 **UTC**：
  - 台灣 **UTC+8** → 19:00 台灣 = **當日 11:00 UTC**
  - 對應 cron：`0 11 * * *`

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

例：台灣 20:00 → UTC 12:00 → `0 12 * * *`。
