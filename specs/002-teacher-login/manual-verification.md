# 002 人工驗證紀錄

- 日期：2026-11-24 晚上至 2026-11-25 凌晨
- 版本：003 分支（含 002 全部 commit），`npm run dev` 同時啟動前端與伺服器
- Google Cloud 專案：quiz-buzzer-speckit（同意畫面為正式版、外部）
- 帳號：帳號 A 為 Gmail 帳號，帳號 B 為學校帳號
- 瀏覽器：Chrome；Google 登入視窗的操作由使用者執行，其餘由 Claude 透過 Chrome 擴充功能操作並讀取畫面與伺服器 log

| # | 結果 | 實際觀察 |
| --- | --- | --- |
| M1 | 通過 | 帳號 A 登入後進入挑選學習單頁，顯示名稱與電子郵件 |
| M2 | 通過 | 帳號 B 在另一個分頁登入後，帳號 A 的分頁再操作時顯示「老師登入已失效，請回首頁重新登入」，頁面內容不變 |
| M3 | 通過 | Google 視窗按取消、直接關閉視窗各一次，都顯示「已取消登入」；伺服器 log 只有 `GET /api/auth/config`，沒有呼叫 `POST /api/auth/google` |
| M4 | 通過 | 帳號 B 不勾雲端硬碟就同意：顯示「需要存取雲端硬碟才能讀取學習單。請再按一次「用 Google 登入」，並在 Google 的畫面勾選雲端硬碟檔案那一項。」；log 為 `SCOPE_DENIED`、`replaced: false`；帳號 A 的分頁照常讀取試算表。Google 預設不勾選這一項，實測後依 spec Session 2026-11-24 修改了訊息 |
| M5 | 未執行 | 需要 004 的活動，004 完成後再驗 |
| M6 | 通過 | 同一個帳號在另一個分頁登入後，前一個分頁再操作時顯示「老師登入已失效，請回首頁重新登入」 |
| M7 | 通過 | 同一瀏覽器的學生分頁 `sessionStorage` 沒有任何鍵；在學生分頁呼叫 `/api/auth/me` 回 401 |
| M8 | 通過 | `curl -i http://127.0.0.1:3000/api/auth/me` 回 `401 {"code":"UNAUTHORIZED","message":"需要老師登入"}` |
| M9 | 通過 | 匯入後到 Google 帳戶「第三方應用程式和服務」移除本系統，再切換工作表：顯示「Google 授權已失效，請回首頁重新登入」，頁面保留原本的辨識結果 |
| M10 | 通過 | 以空白的 `GOOGLE_API_KEY` 啟動伺服器：照常啟動，log 只列出缺少的變數名稱 `["GOOGLE_API_KEY"]`；登入頁顯示「伺服器尚未設定 Google 登入，請參考 README 設定環境變數」 |
| M11 | 修正後通過 | 第一次驗證不通過：只開前端時，Vite 代理回空白的 502，畫面顯示「伺服器發生錯誤，請稍後再試」。已修正 `ApiClient`（沒有 ErrorBody 的錯誤回應視為連不上伺服器，commit「fix(002): 伺服器沒開時提示連不上伺服器」，附單元測試），重驗顯示「連不上伺服器，請確認伺服器已啟動」 |
| M12 | 以模擬通過 | Chrome 擴充功能無法開啟 `chrome://` 設定頁，改在頁面中讓 `window.open` 回傳 `null`（瀏覽器擋下彈出視窗時 GIS 收到的結果）：顯示「瀏覽器擋住了 Google 登入視窗，請允許彈出視窗後再試」。實際在 Chrome 設定封鎖彈出視窗的情況未驗證 |
| M13 | 通過（部分） | 搜尋本次伺服器 log：`ya29`、`1//`、`Bearer `、`GOCSPX`、`AIza`、`refresh_token`、`access_token`、`teacherToken`、`id_token` 皆 0 筆，42 個 `authorization` 標頭都是 `[Redacted]`。比對四個環境變數實際值的部分屬於 T056，需由使用者執行 |

## 發現的問題

1. M11：開發環境經 Vite 代理時，伺服器沒開的提示不符合 AC-23。已修正並加測試。
2. M4：第一次登入幾乎都會遇到 `SCOPE_DENIED`（Google 預設不勾選雲端硬碟），原訊息沒有說明下一步。已先改 spec 再改訊息（T058）。

## T056 機密檢查（2026-11-25）

由使用者執行 `npm run check:secrets`：在 518 個 commit 中（不含 `server/.env`）搜尋 `server/.env` 的 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID` 的實際值，以及 access token（`ya29.`）、refresh token（`1//`）、client secret（`GOCSPX-`）、API key（`AIza`）的格式，全部 0 筆，結果為「通過」。指令只印出名稱與筆數，值沒有出現在畫面或對話中。
