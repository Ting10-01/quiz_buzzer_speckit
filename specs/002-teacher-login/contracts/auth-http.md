# Contract: 老師登入 HTTP API

**Owner**: `002-teacher-login` | **Base**: `/api/auth`（開發時經 Vite proxy 由 `http://localhost:5173` 轉到 `http://127.0.0.1:3000`）

所有請求與回應都是 JSON。錯誤回應一律為 `ErrorBody`：`{ "code": "<代碼>", "message": "<給老師看的中文>" }`。任何回應與 log 都不得包含 refresh token、client secret 或老師憑證以外的授權內容（老師憑證只出現在 `POST /api/auth/google` 的回應）。

## 共通錯誤

| HTTP | code | message | 何時 |
| --- | --- | --- | --- |
| 401 | `UNAUTHORIZED` | 需要老師登入 | 標示「需要老師」的路由沒有 `Authorization: Bearer <teacherToken>`、格式不對或不是目前有效的憑證（`requireTeacher`） |
| 503 | `GOOGLE_NOT_CONFIGURED` | 伺服器尚未設定 Google 登入，請參考 README 設定環境變數 | 四個 Google 環境變數有任一個缺少 |
| 500 | `INTERNAL` | 伺服器發生錯誤，請稍後再試 | 其他未預期的錯誤（不回傳堆疊） |

## GET /api/auth/config

不需要老師。提供前端開啟 Google 登入視窗需要的 client id（不是祕密）。

**Response 200**：`{ "clientId": "1234-abc.apps.googleusercontent.com" }`

## POST /api/auth/google

不需要老師。以 Google 登入視窗取得的授權碼登入（REQ-AUTH-01～05）。

- **Headers**：`X-Requested-With: XmlHttpRequest`（必填，research RD-09）
- **Request**：`{ "code": "<Google 授權碼>" }`（非空字串，最長 2,048 字元）
- **Response 200（登入成功）**：`{ "ok": true, "teacherToken": "<43 字元 base64url>", "account": { "name": "teacher", "email": "teacher@example.com" } }`。以 Google 登入的人即為老師，不比對帳號；這次登入取代前一個老師（同一個帳號或另一個帳號都一樣）：前一組老師憑證作廢、中斷舊的老師即時連線、Google 授權換成這次登入的帳號（REQ-AUTH-02、REQ-AUTH-03）。
- **Response 200（預期中的登入失敗）**：`{ "ok": false, "failure": "SCOPE_DENIED" }`：使用者沒有同意 `drive.file`；伺服器丟棄這組授權，目前的老師不變（REQ-AUTH-05）。預期中的失敗以 200 回傳，與 003–006 的慣例一致。

| HTTP | code | message | 說明 |
| --- | --- | --- | --- |
| 400 | `BAD_REQUEST` | 登入請求格式錯誤 | 缺少標頭、`code` 不是非空字串或超過長度 |
| 400 | `INVALID_CODE` | Google 登入未完成，請再試一次 | Google 不接受授權碼（`invalid_grant`） |
| 502 | `GOOGLE_UNAVAILABLE` | 連不上 Google，請稍後再試 | 15 秒內沒有回應或網路錯誤 |
| 503 | `GOOGLE_NOT_CONFIGURED` | （共通） | |

沒有 `NOT_TEACHER`（2026-11-22 刪除；001 FR-013）。

## GET /api/auth/me

需要老師。回傳目前的老師帳號（REQ-AUTH-11）。

**Response 200**：`{ "name": "teacher", "email": "teacher@example.com" }`

## GET /api/auth/picker-token

需要老師。回傳開啟 Google 檔案選擇器需要的資料（REQ-AUTH-10），給 003 使用。

**Response 200**：`{ "accessToken": "ya29…", "apiKey": "AIza…", "appId": "123456789012" }`

| HTTP | code | message | 說明 |
| --- | --- | --- | --- |
| 401 | `GOOGLE_AUTH_EXPIRED` | Google 授權已失效，請回首頁重新登入 | `isGoogleAuthExpired` 為 true（授權被撤銷） |
| 502 | `GOOGLE_UNAVAILABLE` | 連不上 Google，請稍後再試 | 更新 access token 時逾時或網路錯誤 |
| 503 | `GOOGLE_NOT_CONFIGURED` | （共通） | |

## 前端如何轉換（`HttpAuthService`）

| 情況 | `signInWithGoogle()` 的結果 |
| --- | --- |
| `POST /api/auth/google` 200 `ok: true` | 存入 `TeacherCredentialStore`（取代本分頁原有的憑證）；`{ ok: true, account }` |
| Google 視窗 `CANCELLED` | `{ ok: false, failure: CANCELLED }`，不呼叫伺服器 |
| `POST /api/auth/google` 200 `ok: false, failure: SCOPE_DENIED` | `{ ok: false, failure: SCOPE_DENIED }`；本分頁原有的憑證不變 |
| Google 視窗 `POPUP_BLOCKED` | reject `UnexpectedError`「瀏覽器擋住了 Google 登入視窗，請允許彈出視窗後再試」 |
| Google 視窗 `LOAD_FAILED` | reject `UnexpectedError`「無法載入 Google 登入，請確認網路連線」 |
| 其他錯誤回應、連不上伺服器 | reject `ApiError`（`message` 見上表或「連不上伺服器，請確認伺服器已啟動」） |

| 情況 | `getCurrentAccount()` 的結果 |
| --- | --- |
| 本分頁沒有憑證 | `null`，不呼叫伺服器 |
| `GET /api/auth/me` 200 | `TeacherAccount` |
| 401 `UNAUTHORIZED` | 保留本分頁憑證（之後的請求同樣回 401）；reject `ApiError`「老師登入已失效，請回首頁重新登入」 |
