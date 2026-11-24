# Quickstart: 老師登入

驗證 002 的執行與驗證步驟。契約見 [contracts/](./contracts/)，資料見 [data-model.md](./data-model.md)。

## 1. 前置設定（只需做一次，由執行系統的人自己完成）

1. 在 Google Cloud 建立專案，啟用 **Google Sheets API**、**Google Drive API**、**Google Picker API**。
2. OAuth 同意畫面：類型「外部」、狀態「測試」；範圍加入 `openid`、`email`、`.../auth/drive.file`；測試使用者加入老師帳號與助教測試用帳號（至少兩個帳號，才能驗證 AC-26）。
3. 憑證 → 建立 OAuth 用戶端 ID，類型「網頁應用程式」，**已授權的 JavaScript 來源**填 `http://localhost:5173`（popup 授權碼流程不需要重新導向 URI）。
4. 憑證 → 建立 API 金鑰，限制為「Google Picker API」、網站來源 `http://localhost:5173/*`。
5. 專案編號（數字）就是 `GOOGLE_APP_ID`。
6. 在伺服器的環境變數設定下列名稱（可寫在 `server/.env`，已在 `.gitignore`；格式見 `server/.env.example`）：

   | 變數 | 內容 |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | 第 3 步的用戶端 ID |
   | `GOOGLE_CLIENT_SECRET` | 第 3 步的用戶端密鑰 |
   | `GOOGLE_API_KEY` | 第 4 步的 API 金鑰 |
   | `GOOGLE_APP_ID` | 第 5 步的專案編號 |
   | `PORT`（可省略） | 伺服器埠，預設 3000 |

   不要把任何值寫進 repo、文件或對話。

## 2. 執行

```bash
nvm use                      # Node 24（.nvmrc）
npm install
npm run dev -w server        # http://127.0.0.1:3000，以 --env-file-if-exists=.env 讀取環境變數
npm run dev -w frontend      # http://localhost:5173，/api 與 /socket.io 轉到伺服器
```

## 3. 自動化測試

```bash
npm test -w server           # 單元與整合（假的 Google gateway、Fastify inject、socket.io-client）
npm test -w frontend         # ApiClient、TeacherCredentialStore、HttpAuthService
npm run test:e2e -w frontend # Playwright：假 GIS + 使用假 gateway 的伺服器
```

預期：全部通過；測試過程不連線 Google。

## 4. 人工驗證（真正的 Google，結果記在 `manual-verification.md`）

| # | 步驟 | 預期 | 對應 |
| --- | --- | --- | --- |
| M1 | 啟動伺服器，首頁選「我是老師」→「用 Google 登入」，選帳號 A，全部同意 | 進入挑選學習單頁，顯示帳號 A 的名稱與電子郵件 | AC-01、SC-001 |
| M2 | 帳號 A 是老師時，另開無痕視窗用帳號 B 登入；回到帳號 A 的分頁操作老師功能 | 帳號 B 進入挑選學習單頁；帳號 A 的分頁顯示「老師登入已失效，請回首頁重新登入」 | AC-26 |
| M3 | 登入視窗按取消；再試一次並直接關閉視窗 | 兩次都顯示「已取消登入」 | AC-03 |
| M4 | 用帳號 B 登入，同意畫面不勾選雲端硬碟那一項 | 「需要存取雲端硬碟才能讀取學習單。請再按一次「用 Google 登入」，並在 Google 的畫面勾選雲端硬碟檔案那一項。」；原本的老師仍可操作；再用帳號 B 全部同意則成功 | AC-04 |
| M5 | 帳號 A 是老師且已建立活動（004 完成後）時，在同一個分頁重新整理，再用帳號 A 登入 | 登入成功，進入挑選學習單頁（D21 暫時限制，回不到控制台）；學生分頁看到的活動階段不變 | AC-07、SC-006 |
| M6 | 帳號 A 在分頁 1 登入後，在分頁 2 也用帳號 A 登入；回到分頁 1 操作老師功能 | 分頁 1 顯示「老師登入已失效，請回首頁重新登入」 | AC-08 |
| M7 | 在老師分頁旁開一個學生分頁，開發者工具看 `sessionStorage` | 學生分頁沒有 `teacherToken` | AC-11 |
| M8 | 以 `curl -i http://127.0.0.1:3000/api/auth/me` 不帶標頭 | `401`，`需要老師登入` | AC-10 |
| M9 | 在 Google 帳號設定移除本系統的存取權，再開檔案選擇器（003 完成後） | 「Google 授權已失效，請回首頁重新登入」 | AC-19 |
| M10 | 移除一個 Google 環境變數後啟動伺服器並登入 | log 列出缺少的變數名稱；登入頁顯示「伺服器尚未設定 Google 登入…」 | AC-21 |
| M11 | 關閉伺服器後按「用 Google 登入」 | 「連不上伺服器，請確認伺服器已啟動」 | AC-23 |
| M12 | 瀏覽器封鎖 localhost 的彈出視窗後登入 | 「瀏覽器擋住了 Google 登入視窗…」 | AC-24 |
| M13 | 跑完 M1–M12 後，在伺服器 log 搜尋 `ya29`、`1//`、`Bearer `、四個環境變數的值 | 0 筆 | AC-20、SC-004 |
