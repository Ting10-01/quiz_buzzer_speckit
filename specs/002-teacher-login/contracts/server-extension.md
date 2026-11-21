# Contract: 伺服器骨架與給其他子功能的擴充點

**Owner**: `002-teacher-login` | **使用者**: 003、004、005、006

本文件列出 003–006 實作時直接使用的名稱。名稱改變時必須先改本文件與 `diagrams/002-class.puml`。

## 伺服器

| 名稱 | 位置 | 用法 |
| --- | --- | --- |
| `buildApp(config, deps)` | `server/src/app.ts` | 伺服器組合根。003–006 在這裡以 `app.register(xxxRoutes)` 註冊自己的路由（新增一行，屬於預期中的修改，原則 III） |
| `app.requireTeacher` | `server/src/auth/requireTeacher.ts`（由 `buildApp` 以 `decorate` 提供） | 老師專用路由加 `{ preHandler: app.requireTeacher }`。不得自行解析 `Authorization` |
| `app.io`、`TEACHER_ROOM` | `server/src/realtime/socketServer.ts` | 見 [socket-handshake.md](./socket-handshake.md) |
| `GoogleClientProvider.authorizedClient()` | `server/src/auth/GoogleClientProvider.ts`（`buildApp` 以 `app.googleClients` 提供） | 003、006 把回傳的 `OAuth2Client` 交給 `@googleapis/sheets`、`@googleapis/drive`（`auth` 參數）。沒有老師登入時丟 `TeacherNotSignedInError` |
| `isGoogleAuthExpired(error)` | 同上 | Google API 呼叫失敗時判斷是否為授權失效；為 true 時回 `401 GOOGLE_AUTH_EXPIRED`「Google 授權已失效，請回首頁重新登入」 |
| `ErrorBody` | `server/src/http/errors.ts` | 錯誤回應一律為 `{ code, message }`；`message` 是給老師看的中文 |
| `loggerOptions` | `server/src/logger.ts` | 新增機敏欄位時加到 `redact.paths`，不得在其他地方另設 logger |
| `AppConfig` | `server/src/config.ts` | 新的環境變數在 `loadConfig` 讀取；不得在其他地方直接讀 `process.env` |

## 前端

| 名稱 | 位置 | 用法 |
| --- | --- | --- |
| `ApiClient.request(method, path, body?)` | `frontend/src/services/http/ApiClient.ts` | 003–006 的 `Http*Service` 一律經由它呼叫伺服器：自動帶老師憑證、把錯誤轉成 `ApiError`（符合 `UnexpectedError`）。預期中的錯誤（例如 `ImportError`）由各服務自行辨識 `code` 轉成回傳值 |
| `TeacherCredentialStore.get()` | `frontend/src/services/http/TeacherCredentialStore.ts` | 004 建立老師的 Socket.IO 連線時放入 `auth.teacherToken`。不得把憑證存到其他地方 |
| `createServiceRegistry()` | `frontend/src/services/createServiceRegistry.ts`（001） | 002 只改 `auth` 的綁定；003–006 各自只改自己的那一個 |
| `GET /api/auth/picker-token` | [auth-http.md](./auth-http.md) | 003 開啟 Google Picker 前呼叫 |

## 不提供的東西

- 學生身分與組別：屬於 004（`GroupMembership.groupOf(socket)`）。
- Google API 的包裝（讀取試算表、寫回）：屬於 003、006。
- 登出、撤銷授權、更換老師帳號：沒有需求。
