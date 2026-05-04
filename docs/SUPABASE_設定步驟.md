# Supabase 設定步驟（本專案）

依序完成即可讓 **PWA 讀到雲端資料**、**擷取腳本寫入持股**。  
（不需要每天開著 Supabase 網頁，設好一次即可。）

---

## 一、建立專案

1. 瀏覽器開啟 [https://supabase.com](https://supabase.com) 並登入（可用 GitHub 帳號）。
2. 點 **New project**。
3. 填寫：
   - **Name**：自訂（例如 `etf-pwa`）。
   - **Database Password**：自行設定並**記在安全處**（之後很少用到，勿搞丟）。
   - **Region**：選離台灣較近的（例如 `ap-southeast-1` Singapore）即可。
4. 建立後等待約 **1～2 分鐘**，直到狀態變為 **Healthy / Active**。

---

## 二、建立資料表（執行 migration）

1. 在左側選單點 **SQL Editor**。
2. 點 **New query**。
3. 開啟本機專案檔案 [`supabase/migrations/001_holdings_snapshot.sql`](../supabase/migrations/001_holdings_snapshot.sql)，**全選複製**貼到編輯區。
4. 右下角點 **Run**（或 Run selected）。
5. 應看到 **Success**，無錯誤訊息。

這會建立 `holdings_snapshot` 表，並開放 **匿名唯讀**（給 PWA 用）。

---

## 三、複製 API 金鑰（給本機與 GitHub）

1. 左側 **Project Settings**（齒輪）→ **API**。
2. 請複製並保管：

   | 名稱 | 用途 |
   |------|------|
   | **Project URL** | 等同 `SUPABASE_URL` / `VITE_SUPABASE_URL` |
   | **anon public** | 給前端 PWA（可公開放在網頁建置變數） |
   | **service_role**（點 **Reveal**） | **僅**給擷取腳本／GitHub Actions，**絕勿**寫進前端或公開 |

---

## 四、本機環境變數

### 4.1 給 PWA（Vite）

1. 在專案根目錄複製 [`.env.example`](../.env.example) 為 **`.env`**（若尚無）。
2. 填入：

```env
VITE_SUPABASE_URL=（Project URL）
VITE_SUPABASE_ANON_KEY=（anon public 那一串）
```

3. 重新執行 `npm run dev`，瀏覽器即可從 Supabase 讀資料（不再只用示範資料）。

### 4.2 給擷取腳本（寫入資料庫）

1. 複製 [`.env.ingest.example`](../.env.ingest.example) 為 **`.env.ingest`**。
2. 填入：

```env
SUPABASE_URL=（與上面相同的 Project URL）
SUPABASE_SERVICE_ROLE_KEY=（service_role 那一串）
```

3. 本機測試：

```bash
npm run ingest:dry
npm run ingest
```

`.env.ingest` 已在 `.gitignore`，請勿提交到 Git。

---

## 五、部署 PWA 時（Vercel / Netlify 等）

在托管平台新增相同的 **Build 環境變數**：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

重新部署後，線上 PWA 才會連到你的 Supabase。

---

## 六、常見問題

- **畫面還是示範資料**：檢查 `.env` 是否命名正確、是否重新 `npm run dev`，以及 `VITE_USE_MOCK_DATA` 是否誤設為 `true`。
- **擷取成功但網頁沒資料**：確認 migration 已執行、RLS 政策存在；前端只用 **anon key** 應可 SELECT。
- **不想用 GitHub 自動跑**：可只在電腦手動執行 `npm run ingest`，不必設定 Actions。

更多自動排程見 [GitHub Actions 說明](./GITHUB_ACTIONS_INGEST.md)。
