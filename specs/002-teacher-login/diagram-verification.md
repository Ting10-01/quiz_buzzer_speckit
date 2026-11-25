# 002 圖表一致性驗證

驗證日期：2026-11-25；程式版本：`7ae818a`（002 分支 worktree）

對照範圍：`diagrams/002-component.puml`、`diagrams/002-class.puml`、`diagrams/002-sequence.puml` 與 `server/src/`、`frontend/src/services/http/`、`frontend/src/services/createServiceRegistry.ts`、`frontend/src/pages/teacher/TeacherLoginPage.tsx`（只看失敗訊息）、`shared/src/entities.ts`。判斷依據為 `specs/002-teacher-login/plan.md`、`data-model.md`、`research.md`、`contracts/`。行號以上述版本為準；下文的差異編號（B1、C1…）對應最後一節。

## 組件圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| `TeacherLoginPage` ..> `AuthService`：`signInWithGoogle()` | `frontend/src/pages/teacher/TeacherLoginPage.tsx:18,24` | 一致 | 經 `useServiceRegistry()` 取得 `auth` 後呼叫 |
| `PickPage` ..> `AuthService`：`getCurrentAccount()` | `frontend/src/pages/teacher/PickPage.tsx:21` | 一致 | |
| `AuthService` <<interface>> | `frontend/src/services/interfaces.ts:22-25` | 一致 | |
| `createServiceRegistry` --> `AuthService`、--> `HttpAuthService`（auth 綁定） | `frontend/src/services/createServiceRegistry.ts:6,24,28` | 一致 | 只改了 `auth` 的綁定，與圖上「只改 auth 的綁定」相符 |
| （圖上沒有）`createServiceRegistry` 建立 `TeacherCredentialStore`、`ApiClient`、`GisGoogleIdentityClient` | `createServiceRegistry.ts:4-7,22-23,28` | 差異 | 組合根實際依賴這三個實作，圖上沒畫（B8） |
| `HttpAuthService` -|> `AuthService` | `frontend/src/services/http/HttpAuthService.ts:24` | 一致 | |
| `HttpAuthService` --> `GoogleIdentityClient`、`ApiClient`、`TeacherCredentialStore` | `HttpAuthService.ts:9-11,28-32` | 一致 | 建構子注入 |
| `GisGoogleIdentityClient` -|> `GoogleIdentityClient` | `frontend/src/services/http/GisGoogleIdentityClient.ts:27` | 一致 | |
| `GisGoogleIdentityClient` --> Google 登入視窗（popup） | `GisGoogleIdentityClient.ts:5,36-53` | 一致 | 首次使用才載入 GIS 腳本 |
| `ApiClient`「帶 Bearer、把錯誤轉成 UnexpectedError」 | `frontend/src/services/http/ApiClient.ts:5-14,28,37-50` | 一致 | `ApiError` 有 `message`，結構上符合 `UnexpectedError` |
| `ApiClient` --> `TeacherCredentialStore`：讀取老師憑證 | `ApiClient.ts:21,24,47` | 一致 | 另外在 401 `UNAUTHORIZED` 時呼叫 `clear()`；標籤只寫「讀取」，屬簡化（行為缺漏見時序圖 B5） |
| `ApiClient` --> `authRoutes`：HTTP（Authorization: Bearer） | `ApiClient.ts:26-36` | 一致 | |
| `TeacherCredentialStore`：sessionStorage（只在本分頁） | `frontend/src/services/http/TeacherCredentialStore.ts:3-28` | 一致 | |
| 註解「伺服器不使用 cookie 判斷老師身分」 | `server/src/auth/requireTeacher.ts:16-21` | 一致 | 只讀 `Authorization` |
| `buildApp` --> `loadConfig` | `server/src/app.ts:8,27`；`server/src/main.ts:4` | 一致 | `buildApp` 依賴 `AppConfig` 型別；實際呼叫 `loadConfig` 的是 `main.ts`，plan.md:85 明定進入點不畫（C7） |
| `buildApp` --> `loggerOptions` | `app.ts:10,28`；`server/src/logger.ts:5-27` | 一致 | 含 redact 機敏欄位 |
| `buildApp` --> `authRoutes`、`requireTeacher`、`attachSocketServer` | `app.ts:34,37,38` | 一致 | |
| （圖上沒有）`buildApp` 建立 `TeacherAuth`、`GoogleClientProvider`、`GoogleAuthLibraryGateway` | `app.ts:31-33` | 差異 | 類別圖已有前兩者（plan G-2），組件圖沒有；`GoogleAuthLibraryGateway` 兩張圖都沒有（B8） |
| （圖上沒有）`buildApp` --> `http/errors.ts`（`errorHandler`） | `app.ts:9,29` | 差異 | plan.md:77 指定 `errors.ts` 只在類別圖對應，組件圖不畫屬預期（C7） |
| `authRoutes` --> `requireTeacher`：me、picker-token | `server/src/auth/authRoutes.ts:54,57` | 一致 | 透過 `app.requireTeacher` |
| `authRoutes` --> `TeacherAuth`：`signIn(code)` | `authRoutes.ts:41,54` | 一致 | 另外呼叫 `currentAccount()`（:54），標籤只寫 `signIn`（C9） |
| `authRoutes` --> `GoogleClientProvider`：picker-token | `authRoutes.ts:60` | 一致 | |
| （圖上沒有）`authRoutes` --> `loadConfig`／`AppConfig` | `authRoutes.ts:2,9,22-29,58-64` | 差異 | 每次請求讀 `config.google`（clientId、apiKey、appId）（B7） |
| `requireTeacher` --> `TeacherAuth`：`verify(token)` | `requireTeacher.ts:21` | 一致 | |
| `attachSocketServer` --> `TeacherAuth`：`verify`、`onRotate` | `server/src/realtime/socketServer.ts:23,30` | 一致 | `onRotate` 時 `io.in(TEACHER_ROOM).disconnectSockets(true)` |
| `TeacherAuth` --> `GoogleOAuthGateway`：`exchangeCode(code)` | `server/src/auth/TeacherAuth.ts:38` | 一致 | |
| `GoogleAuthLibraryGateway` -|> `GoogleOAuthGateway`、--> OAuth 權杖端點 | `server/src/auth/GoogleAuthLibraryGateway.ts:14,46,51` | 一致 | `getToken` 交換授權碼，`verifyIdToken` 驗證 id_token |
| `TeacherAuth` --> `GoogleClientProvider`：`replace(tokens)` | `TeacherAuth.ts:50` | 一致 | |
| `GoogleClientProvider` --> `GoogleOAuthGateway`：`createClient(tokens)` | `server/src/auth/GoogleClientProvider.ts:21` | 一致 | |
| 註解「老師綁定、憑證、Google 授權只存在記憶體；金鑰只從環境變數讀取」 | `TeacherAuth.ts:28`；`GoogleClientProvider.ts:16`；`server/src/config.ts:1,25-39` | 一致 | |
| 003～006 ..> `requireTeacher`、`GoogleClientProvider`、`attachSocketServer`（`TEACHER_ROOM`、`socket.data.isTeacher`） | `requireTeacher.ts:7-12`；`app.ts:13-18,35`；`socketServer.ts:12,20,24,35` | 一致 | 擴充點都已提供；003～006 尚未實作，使用端無法驗證 |
| `GoogleClientProvider` ..> Sheets / Drive API（由 003、006 呼叫） | `GoogleClientProvider.ts:24-27` | 一致 | 002 只回傳 `OAuth2Client`，實際呼叫屬 003、006 |

## 類別圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| `TeacherAccount { name, email }` | `shared/src/entities.ts:11-14` | 一致 | |
| `SignInFailure { CANCELLED, SCOPE_DENIED }` | `entities.ts:16-21` | 一致 | 以 `as const` 物件加聯集型別表示列舉（C2）；註解標明 SCOPE_DENIED 由 002 新增 |
| `SignInResult { ok, account[0..1], failure[0..1] }` | `entities.ts:23-27` | 一致 | |
| `UnexpectedError { message }` | `entities.ts:145-147` | 一致 | |
| `AuthService` 兩個方法 | `frontend/src/services/interfaces.ts:22-25` | 一致 | |
| `HttpAuthService` `+signInWithGoogle()`、`+getCurrentAccount()` | `HttpAuthService.ts:34-44` | 一致 | |
| `HttpAuthService` `-signingIn: boolean` | `HttpAuthService.ts:26` | 差異（已知） | 實際為 `Promise<SignInResult> \| null`（B1） |
| （圖上沒有）`HttpAuthService` 直接 reject `UnexpectedError` | `HttpAuthService.ts:15-18,50-52` | 差異 | POPUP_BLOCKED、LOAD_FAILED 時丟出 `{ message }`，圖上只有 `ApiClient ..> ApiError`（B2） |
| `HttpAuthService ..|> AuthService`、`..> SignInResult` | `HttpAuthService.ts:24,34` | 一致 | |
| `GoogleIdentityClient.requestCode(clientId, scopes): Promise<GoogleCodeResult>` | `frontend/src/services/http/GoogleIdentityClient.ts:17-19` | 一致 | |
| `GisGoogleIdentityClient ..|> GoogleIdentityClient` | `GisGoogleIdentityClient.ts:27-30` | 一致 | 私有的 `loading`、`load()` 未畫（C6） |
| `GoogleCodeError { CANCELLED, POPUP_BLOCKED, LOAD_FAILED }` | `GoogleIdentityClient.ts:4-9` | 一致 | `as const` 表示法（C2） |
| `GoogleCodeResult { code[0..1], error[0..1] }` | `GoogleIdentityClient.ts:12-15` | 一致 | |
| `TeacherCredentialStore` `get/set/clear` | `TeacherCredentialStore.ts:5-28` | 一致 | |
| `ApiClient.request<T>(method, path, body?): Promise<T>` | `ApiClient.ts:23` | 一致 | |
| `ApiError { status, code, message }`、`ApiError ..|> UnexpectedError` | `ApiClient.ts:5-14` | 一致 | `extends Error`，以結構型別符合 `UnexpectedError`（C2） |
| `ApiClient --> TeacherCredentialStore`、`ApiClient ..> ApiError : reject` | `ApiClient.ts:21,38,48,50` | 一致 | |
| `AppConfig { port, google[0..1], missingGoogleVars }`、`GoogleConfig` 四欄位 | `server/src/config.ts:3-14` | 一致 | 程式為 `interface`，`google: GoogleConfig \| null`（C2） |
| `TeacherAuth` `signIn/verify/currentAccount/onRotate`、`-binding[0..1]` | `TeacherAuth.ts:28,37-71` | 一致 | 簽章相同；私有 `rotateListeners`、`logSignIn` 與建構子參數 `AuthLog` 未畫（C6） |
| `TeacherBinding`、`SignInOutcome` | `TeacherAuth.ts:8-18` | 一致 | |
| `GoogleOAuthGateway` `exchangeCode`、`createClient` | `server/src/auth/GoogleOAuthGateway.ts:17-20` | 一致 | |
| `GoogleAuthLibraryGateway ..|> GoogleOAuthGateway`、`--> GoogleConfig` | `GoogleAuthLibraryGateway.ts:14-19` | 一致 | |
| `GoogleAuthLibraryGateway ..> GoogleUnavailableError : throw（逾時 15 秒、網路錯誤）` | `GoogleAuthLibraryGateway.ts:11,22,49,53,67,75`；`GoogleOAuthGateway.ts:23-29` | 一致 | 另外在 token 不完整、沒有 email 時也丟出 |
| `GoogleSignIn`、`GoogleTokens` | `GoogleOAuthGateway.ts:3-13` | 一致 | |
| `GoogleClientProvider` `replace`、`authorizedClient`、`-client[0..1]`、`..> TeacherNotSignedInError` | `GoogleClientProvider.ts:15-28` | 一致 | |
| `TeacherNotSignedInError { code = "NOT_SIGNED_IN" }` | `GoogleClientProvider.ts:5-11` | 一致 | |
| `PickerToken { accessToken, apiKey, appId }` | `authRoutes.ts:64` | 一致 | 程式沒有具名型別，是路由回傳的物件字面值（C2） |
| `ErrorBody { code, message }` | `server/src/http/errors.ts:4-7` | 一致 | |
| `requireTeacher` <<preHandler>> `+(request, reply): Promise<void>` | `requireTeacher.ts:5,17-25` | 差異 | 程式是工廠 `createRequireTeacher(teacherAuth)`，回傳型別 `RequireTeacher = (request, reply) => Promise<FastifyReply \| void>`（C1） |
| `requireTeacher --> TeacherAuth`、`..> ErrorBody : 401` | `requireTeacher.ts:2,17,22` | 一致 | |
| `authRoutes` 四條路由 | `authRoutes.ts:23,28,54,57` | 一致 | |
| `authRoutes` --> `TeacherAuth`、`GoogleClientProvider`、`requireTeacher`；..> `PickerToken`、`ErrorBody`、`isGoogleAuthExpired` | `authRoutes.ts:3-6,21,41,54-67` | 一致 | |
| （圖上沒有）`authRoutes` --> `AppConfig` | `authRoutes.ts:2,9,22-29,58-64` | 差異 | B7 |
| （圖上沒有）`authRoutes` ..> `GoogleUnavailableError`、`isInvalidGrant`、`isGoogleUnreachable`、`sendError` | `authRoutes.ts:3,5,46-48,63,69` | 差異 | 錯誤分類輔助函式（C6） |
| `attachSocketServer +(app, teacherAuth): io.Server`、`TEACHER_ROOM = "teacher"` | `socketServer.ts:12,14` | 一致 | |
| （圖上沒有）`attachSocketServer` 以 `app.io` 提供 Server | `socketServer.ts:5-9,35` | 差異 | contracts/server-extension.md:13 列為擴充點（B9） |
| `buildApp +(config: AppConfig, deps): FastifyInstance` | `app.ts:21-27` | 一致 | `deps` 型別為 `AppDeps { gateway?, logStream? }`（C6） |
| `buildApp` --> `AppConfig`、`authRoutes`、`requireTeacher`、`attachSocketServer`、`TeacherAuth`、`GoogleClientProvider : app.googleClients` | `app.ts:8,13-18,32-38` | 一致 | |
| （圖上沒有）`buildApp --> requireTeacher` 的 `app.requireTeacher` 名稱 | `app.ts:34`；`requireTeacher.ts:7-12` | 差異 | `app.googleClients` 有標名稱，`app.requireTeacher` 沒有（B9） |
| （圖上沒有）`buildApp --> GoogleAuthLibraryGateway` | `app.ts:31` | 差異 | B8 |
| `isGoogleAuthExpired +(error: unknown): boolean` | `GoogleClientProvider.ts:32-34` | 一致 | invalid_grant 或 HTTP 401（data-model.md:43） |
| 註解（TeacherAuth）：不比對帳號、取代 binding、onRotate、SCOPE_DENIED 時老師不變、await 後同步換發、只在記憶體 | `TeacherAuth.ts:37-55` | 一致 | |
| 註解（GoogleClientProvider）：每次呼叫前重新取得、還沒有老師 → `TeacherNotSignedInError` | `GoogleClientProvider.ts:13-27` | 一致 | |

## 時序圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| 1. `Page -> Auth : signInWithGoogle()` | `TeacherLoginPage.tsx:24`；`HttpAuthService.ts:34-39` | 一致 | 連點回傳同一個 Promise（B1 的理由） |
| 1. `Auth -> Api -> Routes : GET /api/auth/config` | `HttpAuthService.ts:47`；`authRoutes.ts:23-26` | 一致 | |
| 1. alt 缺少 Google 環境變數 → 503 `GOOGLE_NOT_CONFIGURED` → `ApiError` → reject | `authRoutes.ts:16-18,24`；`ApiClient.ts:44,50` | 一致 | 頁面以 `ErrorArea` 顯示（`TeacherLoginPage.tsx:31-32`），圖上沒畫（C8） |
| 1. `Auth -> Gis : requestCode(clientId, [openid, email, drive.file])` | `HttpAuthService.ts:13,48` | 一致 | |
| 1. `Gis -> Google`：popup，`prompt=consent select_account` | `GisGoogleIdentityClient.ts:36-53` | 一致 | |
| 1. alt 關閉視窗或取消 → `{ error: CANCELLED }` → `SignInResult(CANCELLED)` → 「已取消登入」 | `GisGoogleIdentityClient.ts:45-51`；`HttpAuthService.ts:49`；`TeacherLoginPage.tsx:13,29` | 一致 | |
| （圖上沒有）POPUP_BLOCKED、LOAD_FAILED → reject `UnexpectedError` | `GisGoogleIdentityClient.ts:31-35,49-50`；`HttpAuthService.ts:15-18,50-52` | 差異 | contracts/auth-http.md:64-65 有設計，圖缺分支（B2） |
| 1. `Auth -> Api -> Routes : POST /api/auth/google { code }`（X-Requested-With） | `HttpAuthService.ts:54`；`ApiClient.ts:26`；`authRoutes.ts:28-37` | 一致 | |
| （圖上沒有）400 `BAD_REQUEST`、400 `INVALID_CODE`、502 `GOOGLE_UNAVAILABLE` | `authRoutes.ts:31-37,45-50` | 差異 | contracts/auth-http.md:30-35 有設計，圖缺分支（B3） |
| 1. `Routes -> TAuth : signIn(code)`、`TAuth -> Gw : exchangeCode(code)`、`Gw -> Google`（最多 15 秒）、`Gw --> TAuth : GoogleSignIn` | `authRoutes.ts:41`；`TeacherAuth.ts:38`；`GoogleAuthLibraryGateway.ts:21-23,43-62` | 一致 | |
| 1. alt 沒有同意 drive.file → `SCOPE_DENIED`（200）→ 頁面訊息 | `TeacherAuth.ts:6,43-46`；`authRoutes.ts:42-44`；`HttpAuthService.ts:55`；`TeacherLoginPage.tsx:14` | 一致 | 訊息文字與圖逐字相同（圖上只多了換行） |
| 1. else：`TAuth -> TAuth` 取代老師、產生新 token → `replace(tokens)` → `createClient` → opt `onRotate` | `TeacherAuth.ts:41,48-52`；`GoogleClientProvider.ts:20-22`；`socketServer.ts:30` | 一致 | 程式先 `replace(tokens)`（:50）再寫入 binding（:51），全部同步，順序差異沒有外部可見效果（C4） |
| 1. `TAuth --> Routes --> Api : 200 { ok: true, teacherToken, account }`、`Auth -> Cred : set(teacherToken)`、`SignInResult(ok, account)` | `TeacherAuth.ts:54`；`authRoutes.ts:43`；`HttpAuthService.ts:56-57` | 一致 | |
| 1. `Page --> Teacher : 挑選學習單頁（D21 暫時一律進 T-Pick）` | `TeacherLoginPage.tsx:26-27` | 一致（已知限制） | 程式與圖一致，但與 D21 最終設計不同（A1） |
| 1. `Page -> Auth : getCurrentAccount()` → `Auth -> Api : GET /me` → `Api -> Cred : get()` | `PickPage.tsx:21`；`HttpAuthService.ts:41-44`；`ApiClient.ts:24` | 差異 | `HttpAuthService` 先自己呼叫 `credentials.get()`，沒有憑證就回 `null` 不打伺服器；圖缺這個呼叫與分支（B4） |
| 1. `Routes -> Guard : preHandler`、`Guard -> TAuth : verify`、`Routes -> TAuth : currentAccount()`、200 `TeacherAccount` | `authRoutes.ts:54`；`requireTeacher.ts:18-23`；`TeacherAuth.ts:57-66` | 一致 | |
| 2. 老師專用請求沒有憑證或憑證錯誤 → `Guard -> TAuth : verify` → false → 401 `UNAUTHORIZED`「需要老師登入」 | `requireTeacher.ts:19-23` | 一致 | 沒有 `Authorization` 時程式短路，不呼叫 `verify`（C3） |
| （圖上沒有）`ApiClient` 收到 401 `UNAUTHORIZED` 且本分頁有憑證 → `clear()`，訊息改為「老師登入已失效，請回首頁重新登入」 | `ApiClient.ts:16,45-49` | 差異 | contracts/auth-http.md:72 有設計；被取代的舊老師分頁走這條，圖沒畫（B5） |
| 2. Socket 沒帶 `auth.teacherToken` → 接受為一般連線 | `socketServer.ts:18-22` | 一致 | `isTeacher = false` |
| 2. Socket 帶錯誤或作廢的 token → `verify` → false → 拒絕 `UNAUTHORIZED` | `socketServer.ts:23` | 一致 | token 不是字串時不呼叫 `verify` 直接拒絕（C3） |
| 2. 老師連線 → `verify` → true → `isTeacher = true`、加入 `TEACHER_ROOM` | `socketServer.ts:23-26` | 一致 | |
| 3. `GET /api/auth/picker-token`、preHandler、`Routes -> Provider : authorizedClient()` | `authRoutes.ts:57-60` | 一致 | 前端呼叫端屬 003，尚未實作 |
| 3. alt 還沒有老師登入 → throw `TeacherNotSignedInError` → 401 `NOT_SIGNED_IN` | `authRoutes.ts:57,60`；`TeacherAuth.ts:50-51`；`errors.ts:15-22` | 差異 | 這條分支走不到：`requireTeacher` 通過代表 binding 存在，而 binding 與 client 在 `signIn` 中同步設定。即使走到，`authorizedClient()` 在 try 之外，會落到 `errorHandler` 回 500 `INTERNAL`，不是 401。契約也沒有這個回應（B6） |
| 3. `Routes -> Google : getAccessToken()`；alt invalid_grant → 401 `GOOGLE_AUTH_EXPIRED`；else 200 `PickerToken` | `authRoutes.ts:61-68`；`GoogleClientProvider.ts:32-34` | 一致 | 判斷式也涵蓋 HTTP 401（C5） |
| （圖上沒有）picker-token 502 `GOOGLE_UNAVAILABLE`、503 `GOOGLE_NOT_CONFIGURED` | `authRoutes.ts:58-59,63,69` | 差異 | contracts/auth-http.md:54-55 有設計（B6） |
| 3. 註解：003、006 呼叫 `authorizedClient()`，以 `isGoogleAuthExpired` 判斷 | `GoogleClientProvider.ts:14,30-34` | 一致 | |

## 差異與處理建議

**A1（已知）D21「重新登入回控制台」：屬於 (a)，延後處理**
- 現況：`TeacherLoginPage.tsx:26-27` 登入成功一律 `navigate({ id: 'T-Pick' })`。時序圖第 70 行已註明這是暫時限制，所以圖和程式一致；不一致的是 D21 的最終設計（spec.md:32、plan.md:9）。
- 理由：最終要改的是程式。頁面切換屬於 001，plan.md:11 已列為「需請 001 修改」，不在 002 範圍。
- 建議：002 不動。001 改好頁面切換之後，同時刪除時序圖第 70 行括號裡的暫時限制說明。

**B1（已知）`HttpAuthService.signingIn` 型別：屬於 (b)**
- 現況：`HttpAuthService.ts:26` 是 `Promise<SignInResult> | null`，圖上 `class.puml:43` 是 `boolean`。
- 理由：連點時要回傳同一個 Promise（`HttpAuthService.ts:25,34-39`，spec Edge Cases），只用 boolean 做不到，程式的作法合理。
- 建議：類別圖改為 `-signingIn: Promise<SignInResult> [0..1]`。

**B2 POPUP_BLOCKED／LOAD_FAILED 分支：屬於 (b)**
- 現況：`HttpAuthService.ts:50-52` 直接 reject `UnexpectedError`，訊息在 `HttpAuthService.ts:15-18`。時序圖第 37-41 行只有「取消」和「取得授權碼」；類別圖也沒有 `HttpAuthService ..> UnexpectedError`。
- 理由：contracts/auth-http.md:64-65 有設計這兩種情況，程式依契約實作。
- 建議：時序圖第 1 段加 `else 視窗被擋或載入失敗：Gis --> Auth : { error: POPUP_BLOCKED | LOAD_FAILED }`、`Auth --> Page : reject UnexpectedError`；類別圖加 `HttpAuthService ..> UnexpectedError : reject`。

**B3 `POST /api/auth/google` 的錯誤回應：屬於 (b)**
- 現況：`authRoutes.ts:31-37` 回 400 `BAD_REQUEST`，`:46` 回 400 `INVALID_CODE`，`:47-49` 回 502 `GOOGLE_UNAVAILABLE`。時序圖第 1 段沒有這些分支。類別圖只畫了 `GoogleUnavailableError` 由 gateway 丟出。
- 理由：contracts/auth-http.md:30-35 有設計。
- 建議：在 `exchangeCode` 之後加一個 alt，寫「Google 不接受授權碼 → 400 INVALID_CODE」和「逾時或連不上 → 502 GOOGLE_UNAVAILABLE」，兩者都由 `Api --> Auth : reject ApiError` 收尾。`BAD_REQUEST` 可以寫成一行 note。

**B4 `getCurrentAccount()` 沒有憑證的分支：屬於 (b)**
- 現況：`HttpAuthService.ts:42` 先呼叫 `credentials.get()`，沒有憑證就回 `null`，不呼叫伺服器。時序圖第 71-74 行畫成 `Auth -> Api` 之後才 `Api -> Cred : get()`。
- 理由：contracts/auth-http.md:70 有設計。
- 建議：在 `Auth -> Api` 前加 `Auth -> Cred : get()`，並加 `alt 本分頁沒有憑證 → Auth --> Page : null`。

**B5 舊憑證收到 401 時清除本分頁憑證：屬於 (b)**
- 現況：`ApiClient.ts:45-49` 在 401 `UNAUTHORIZED` 而且本分頁有憑證時呼叫 `clear()`，訊息換成「老師登入已失效，請回首頁重新登入」。時序圖第 2 段只畫了沒有憑證的學生分頁。
- 理由：contracts/auth-http.md:72 與 REQ-AUTH-11 有設計。時序圖標題寫「任何登入取代前一個老師」，被取代的分頁之後怎麼處理也應該畫出來。
- 建議：第 2 段加一個情境「被取代的老師分頁：Guard 回 401 UNAUTHORIZED → Api -> Cred : clear() → reject ApiError（老師登入已失效…）」。

**B6 picker-token 的分支：屬於 (b)**
- 現況：時序圖第 110-112 行的「還沒有老師登入 → 401 NOT_SIGNED_IN」，程式走不到。理由有三：`requireTeacher`（`authRoutes.ts:57`）已經擋掉沒有老師的請求；`TeacherAuth.ts:50-51` 同步設定 client 與 binding；就算走到了，`authRoutes.ts:60` 在 try 之外，會由 `errors.ts:15-22` 回 500 `INTERNAL`，不是 401。另外，契約有的 502 `GOOGLE_UNAVAILABLE`（`authRoutes.ts:63,69`）與 503 `GOOGLE_NOT_CONFIGURED`（`:58-59`），圖上都沒有。
- 理由：contracts/auth-http.md:50-55 沒有列 `NOT_SIGNED_IN`，只有 401 `GOOGLE_AUTH_EXPIRED`、502、503；程式和契約一致。data-model.md:41 寫的 `TeacherNotSignedInError` 是給 003、006 直接呼叫 `authorizedClient()` 用的。
- 建議：刪掉 picker-token 的「還沒有老師登入」分支，改成 note：「requireTeacher 通過時一定有老師；`TeacherNotSignedInError` 給 003、006 直接呼叫時使用」。在 `getAccessToken()` 的 alt 裡加「逾時或連不上 → 502 GOOGLE_UNAVAILABLE」。

**B7 `authRoutes` 依賴 `AppConfig`：屬於 (b)**
- 現況：`authRoutes.ts:2,9,22-29,58-64` 每次請求都讀 `config.google`（clientId、apiKey、appId），兩張圖都沒有這條依賴。
- 理由：503 `GOOGLE_NOT_CONFIGURED` 和 picker-token 的 apiKey、appId 都靠這條依賴。
- 建議：組件圖加 `Routes --> Config`；類別圖加 `AuthRoutes --> AppConfig`。

**B8 組合根建立的實作沒畫：屬於 (b)**
- 現況：伺服器端 `app.ts:31-33` 建立 `GoogleAuthLibraryGateway`、`GoogleClientProvider`、`TeacherAuth`。組件圖沒有 `App -->` 這三者；類別圖有後兩者（plan G-2），但沒有 `BuildApp --> GoogleAuthLibraryGateway`。前端 `createServiceRegistry.ts:22-23,28` 建立 `TeacherCredentialStore`、`ApiClient`、`GisGoogleIdentityClient`，組件圖只畫了 `Registry --> HAuth`。
- 理由：組合根本來就是唯一綁定實作的地方（原則 III），畫出來才看得出替換點。
- 建議：組件圖加 `App --> TAuth`、`App --> Provider`、`App --> Gw`、`Registry --> Gis`、`Registry --> Api`、`Registry --> Cred`；類別圖加 `BuildApp --> GoogleAuthLibraryGateway`。

**B9 `app.requireTeacher`、`app.io` 的名稱沒畫：屬於 (b)**
- 現況：`app.ts:34` 和 `requireTeacher.ts:7-12` 提供 `app.requireTeacher`；`socketServer.ts:5-9,35` 提供 `app.io`。類別圖只在 `app.googleClients` 標了名稱。
- 理由：contracts/server-extension.md:5 規定 003～006 使用的名稱改變時要同步改類別圖。這兩個名稱在契約裡（:10、:13），圖上卻沒有。
- 建議：把類別圖 `BuildApp --> RequireTeacher` 的標籤改成 `app.requireTeacher`；在 `attachSocketServer` 加一行 `app.io`，或加 `BuildApp --> SocketServer : app.io`。

**C1 `requireTeacher` 的名稱與回傳型別：屬於 (c)**
- 現況：程式是工廠 `createRequireTeacher(teacherAuth)`（`requireTeacher.ts:17`），回傳型別為 `Promise<FastifyReply | void>`（`:5`），圖上寫 `Promise<void>`。
- 理由：003～006 只透過 `app.requireTeacher` 當 preHandler 使用，不會直接呼叫。回傳 `FastifyReply` 是 Fastify async hook 表示「已回應」的寫法，語意不變。
- 建議：不需處理。如果要精確，可以在類別名稱旁註記 `createRequireTeacher(teacherAuth)`。

**C2 型別表示法：屬於 (c)**
- 現況與理由：`SignInFailure`、`GoogleCodeError` 以 `as const` 物件表示列舉（`entities.ts:16-21`、`GoogleIdentityClient.ts:4-9`）；`AppConfig` 等是 `interface`，`[0..1]` 對應 `| null` 或 `?`；`PickerToken` 沒有具名型別（`authRoutes.ts:64`）；`ApiError` 以結構型別符合 `UnexpectedError`。這些都是 TypeScript 對 UML 的對應方式。
- 建議：不需處理。

**C3 沒有 token 時不呼叫 `verify`：屬於 (c)**
- 現況：`requireTeacher.ts:21` 和 `socketServer.ts:23` 在沒有 token 或 token 不是字串時短路，不呼叫 `verify`。時序圖第 88-89 行把「沒有 Authorization」也畫成呼叫 `verify`。
- 理由：兩種情況的結果與訊息相同。
- 建議：不需處理。

**C4 `signIn` 內部順序：屬於 (c)**
- 現況：程式依序為產生 token、`replace(tokens)`、寫入 binding、`onRotate`（`TeacherAuth.ts:49-52`）。圖上先畫「取代老師、產生 token」再畫 `replace`。
- 理由：中間沒有 `await`，外部看不出順序。
- 建議：不需處理。

**C5 `isGoogleAuthExpired` 的條件：屬於 (c)**
- 現況：時序圖第 116 行只寫 invalid_grant，程式還包含 HTTP 401（`GoogleClientProvider.ts:33`）。
- 理由：data-model.md:43 有寫，屬於圖上的簡寫。
- 建議：不需處理。

**C6 圖上沒有的公開輔助項目與私有細節：屬於 (c)**
- 現況：
  - `AuthLog` 和登入事件 log（`TeacherAuth.ts:20-22,73-75`）
  - `DRIVE_FILE_SCOPE`（`TeacherAuth.ts:6`）、`GOOGLE_TIMEOUT_MS`（`GoogleAuthLibraryGateway.ts:11`）
  - `AppDeps`（`app.ts:21-24`）
  - `httpStatusOf`、`isInvalidGrant`、`isGoogleUnreachable`（`GoogleOAuthGateway.ts:32-48`）
  - `sendError`、`errorHandler`（`errors.ts:9-23`）
  - `GisGoogleIdentityClient` 的 `load()`（`GisGoogleIdentityClient.ts:57-72`）
- 理由：這些都是 002 內部實作或測試注入點，contracts/server-extension.md 沒有列給 003～006 使用。
- 建議：不需處理。

**C7 `main.ts` 與 `errors.ts` 不在組件圖：屬於 (c)**
- 理由：plan.md:85 明定「進入點，圖中不畫」；plan.md:77 指定 `ErrorBody`、錯誤處理只在類別圖對應。
- 建議：不需處理。

**C8 時序圖省略的前端細節：屬於 (c)**
- 現況：
  - `ApiClient` 每次請求都讀憑證，並固定帶 `X-Requested-With`（`ApiClient.ts:24-28`）
  - 連不上伺服器時回 `ApiError(0, 'NETWORK')`（`:37-39`）
  - 頁面以 `ErrorArea` 顯示 reject 的訊息（`TeacherLoginPage.tsx:31-32`）
- 理由：這些都是組件圖「把錯誤轉成 UnexpectedError」的共通行為。
- 建議：不需處理。

**C9 組件圖 `Routes --> TAuth` 只標 `signIn(code)`：屬於 (c)**
- 現況：程式另外呼叫 `currentAccount()`（`authRoutes.ts:54`），類別圖與時序圖都有畫。
- 建議：不需處理，也可以把標籤補成 `signIn(code)、currentAccount()`。

結論：有差異，共 1 個 a（已知 D21，延後由 001 修改）、9 個 b（其中 B1 為已知）、9 個 c。

## 處理結果（2026-11-25，使用者決定照建議處理）

| 差異 | 處理 |
| --- | --- |
| A1（D21） | 不改程式。登入後依活動階段回控制台要等 001 修改頁面切換；時序圖已註明暫時限制，001 修改後刪除該註明 |
| B1–B9 | 改圖：三張圖、`data-model.md`、`plan.md`「圖表的修訂」G-4 已同步，PNG 重新產生（commit「spec(002): 依圖表一致性驗證同步三張圖與資料模型」） |
| C1–C9 | 表示法差異，接受，不處理 |

結論：處理後程式與三張圖一致；唯一的偏離是 D21 的暫時限制，已在 spec、時序圖與本報告記錄。

## issue #18 之後（2026-11-25）

`ApiClient` 收到 401 `UNAUTHORIZED` 時不再清除本分頁憑證，`TeacherCredentialStore.clear()` 已移除。上面組件圖第 21 列、類別圖第 61 列與 B5 提到的 `clear()` 是當時的程式；三張圖已同步刪除，PNG 重新產生（commit「spec(002): 被取代的老師分頁保留憑證，每次請求都提示重新登入」）。其餘結論不變。
