# Contract: Google 授權 API（HTTP）

**Owner**: `001-guided-notes-import`（003 寫回時沿用同一個授權） | **Base**: `http://localhost:3000/api/google`

除了 `/callback`，所有請求都要帶老師憑證：`Authorization: Bearer <teacherToken>`。任何回應與 log 都不得包含 refresh token 或用戶端密鑰（原則 VI）。

## 環境變數（由執行系統的人自行填寫，不進版控）

| 變數 | 用途 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth 用戶端 ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 用戶端密鑰 |
| `GOOGLE_API_KEY` | 檔案選擇器用的瀏覽器金鑰（限制為 Picker API、`http://localhost:3000`） |
| `GOOGLE_APP_ID` | Google Cloud 專案編號（檔案選擇器的 `setAppId`） |

缺少任一變數時，伺服器照常啟動，但 `/status` 回 `{ "status": "UNAVAILABLE" }`，匯入頁顯示「尚未設定 Google 連線，請參考 README」。

## GET /api/google/status

**Response 200**：`{ "status": "LINKED", "email": "teacher@example.com" }`；`status` 為 `UNLINKED`、`LINKED`、`EXPIRED` 或 `UNAVAILABLE`，後三者沒有 `email`。

## POST /api/google/connect

開始連結。伺服器產生一次性的 `state`（10 分鐘過期），記住它對應的老師工作階段。

**Response 200**：`{ "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?…" }`，前端把整個頁面導向這個網址。

## GET /api/google/callback

Google 把老師的瀏覽器導回這裡（不帶老師憑證，以 `state` 驗證）。

- 同意：用 `code` 換取授權並存到 `credentials/google-token.json`，然後 `302` 到 `/teacher/import?google=linked`。
- 拒絕、`state` 錯誤或過期：不保存任何東西，`302` 到 `/teacher/import?google=denied`（AC-06）。

## POST /api/google/unlink

向 Google 撤銷授權並刪除本機的授權檔。**Response 204**。已確認的題目清單不受影響。

## GET /api/google/picker-session

開啟檔案選擇器所需的資料，只回給老師。

**Response 200**：`{ "accessToken": "ya29…", "appId": "123456789012", "apiKey": "AIza…" }`

| HTTP | code | 說明 |
| --- | --- | --- |
| 401 | `NOT_LINKED` | 還沒連結 Google 帳號 |
| 401 | `AUTH_EXPIRED` | 授權已失效，需要重新連結 |
| 503 | `GOOGLE_UNAVAILABLE` | 伺服器沒有設定 Google 環境變數 |
