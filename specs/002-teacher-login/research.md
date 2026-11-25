# Research: 老師登入

**Feature**: `002-teacher-login` | **Date**: 2026-11-21（2026-11-22 配合 001 最終版修訂） | **Plan**: [plan.md](./plan.md)

整個專案共用的技術選擇沿用 001 的 [research.md](../001-ui-prototype/research.md)（RD-01～RD-08）：前端 React + TypeScript + Vite；後端 Node.js 24 LTS + TypeScript + Fastify；指令走 HTTP REST、推播走 Socket.IO；pino；Vitest、Playwright；npm workspaces `frontend/`、`shared/`、`server/`。本文件只記錄 002 自己要決定的事，不另選框架。

素材：舊 `001-guided-notes-import` 的 Google 授權（research R2、R3、contracts/google-auth-http.md）與舊 `002-buzzer-session` 的老師憑證（research R6、TeacherCredential、AC-34）。舊設計的「首頁選老師取得憑證」「終端機取回連結（AC-35）」「`/api/google/connect` 整頁導向與 `/callback`」「授權存到 `credentials/google-token.json`」「解除連結」都不再使用。

---

## RD-01 登入方式：Google Identity Services 授權碼（popup）＋ 伺服器交換

- **Decision**:
  - 前端載入 Google Identity Services（`https://accounts.google.com/gsi/client`），以 `google.accounts.oauth2.initCodeClient` 開啟 popup，`scope` 為 `openid email https://www.googleapis.com/auth/drive.file`，`ux_mode: 'popup'`，`prompt: 'consent select_account'`。
  - 拿到授權碼（`code`）後，前端 `POST /api/auth/google { code }`；伺服器以 `google-auth-library` 的 `OAuth2Client.getToken({ code, redirect_uri: 'postmessage' })` 換取授權，再以 `verifyIdToken({ audience: GOOGLE_CLIENT_ID })` 取出 `email`。
  - 老師身分（REQ-AUTH-02）與 Google 授權（REQ-AUTH-05）在同一次交換中取得。id_token 只用來取得 `email`（顯示帳號），不用來判斷是不是老師。
- **Rationale**:
  - popup 不離開目前的頁面；001 的頁面切換以 React state 保存、重新整理一律回首頁（001 RD-11），整頁導向到 Google 再導回會讓頁面回到首頁。
  - 授權碼在伺服器交換，長期授權（refresh token）只留在伺服器記憶體，006 在伺服器端寫回時拿得到；瀏覽器只拿到授權碼。
  - `prompt=consent` 讓 Google 每次都回傳 refresh token。伺服器重新啟動後記憶體中的授權會消失，若不強制同意畫面，第二次以後的登入可能拿不到 refresh token，一小時後就無法讀寫試算表。代價是每次登入都多按一次同意（spec Assumptions，待使用者確認）。
- **Alternatives considered**:
  - 伺服器端整頁導向（舊設計的 `/connect`、`/callback`）：離開 SPA，回來時頁面回到首頁；還要 `state` 對應老師工作階段。
  - GIS token model（瀏覽器直接拿 access token）：沒有 refresh token，伺服器無法在一小時後代表老師寫回；access token 也會長時間停在瀏覽器。
  - 只用「Sign in with Google」按鈕（只拿 ID token）：拿不到 `drive.file` 授權，違反「登入同時取得授權」。

## RD-02 目前的老師與老師憑證

2026-11-22 修訂：以 Google 登入的人即為老師（001 FR-013、feature-split 002），任何登入成功都取代前一個老師；不再比對帳號，也沒有 `NOT_TEACHER`。

- **Decision**:
  - `TeacherAuth` 在記憶體保存一份 `TeacherBinding`（`account`、`teacherToken`），代表目前的老師。伺服器啟動時沒有。
  - `signIn(code)`：`await gateway.exchangeCode(code)` 之後，**同步**完成下列步驟（中間沒有 `await`）：
    1. 缺少 `drive.file` → `SCOPE_DENIED`，丟棄這組授權，目前的老師不變。
    2. 否則產生新的 `teacherToken`，以新帳號取代 `TeacherBinding`，`GoogleClientProvider.replace(tokens)`；原本已有老師時通知 `onRotate` 的監聽者（中斷舊的老師連線）。不論是同一個帳號還是另一個帳號，處理方式相同。
  - 老師憑證：`crypto.randomBytes(32).toString('base64url')`（43 字元）。驗證以 `crypto.timingSafeEqual` 比對，長度不同直接回 false。同一時間只有一組有效；換發後舊的立即無效（REQ-AUTH-03）。
  - 前端只存在 `sessionStorage` 的 `teacherToken`（同分頁重新整理仍在、其他分頁讀不到、分頁關閉消失）；請求以 `Authorization: Bearer <token>` 帶上；Socket.IO 以 `auth.teacherToken` 帶上。伺服器不設任何 cookie。
  - 老師憑證沒有時間限制，在伺服器重新啟動或被新的登入取代前一直有效（spec Edge Cases）。
- **Rationale**: Node.js 單執行緒，`await` 之後的同步區段不會被其他請求插入；換發憑證與 `replace(tokens)` 在同一段同步程式中完成，所以兩次同時登入時最後完成的那次有效，且有效憑證與 Google 授權一定屬於同一個帳號（AC-27、SC-005），不需要鎖。`sessionStorage` 以分頁為單位，解決「同一個瀏覽器的學生分頁讀得到老師憑證」（001 RD-06、舊 002 R6）。
- **Alternatives considered**: cookie session（被同一瀏覽器的所有分頁共用，學生分頁也會帶上）；`localStorage`（所有分頁共用）；JWT（不需要跨伺服器驗證，反而難以讓舊憑證立即作廢）；允許多組有效憑證（無法保證只有一個老師分頁在操作，且多組 Google 授權時 003、006 不知道用哪一組）；只允許第一個登入的帳號（2026-11-21 的做法，已被 001 FR-013 與 feature-split 取代）。

## RD-03 權限檢查與帳號名稱

- **Decision**:
  - 授權交換回應的 `scope` 欄位列出使用者實際同意的權限；不含 `https://www.googleapis.com/auth/drive.file` 時回 `SCOPE_DENIED`（Google 的同意畫面允許使用者取消勾選非登入用的權限）。
  - `TeacherAccount.name` 取電子郵件 `@` 前面的部分；`email` 取 id_token 的 `email`。不要求 `profile` 權限（spec Clarifications，待使用者確認）。
- **Rationale**: 只依 `drive.file` 是否被同意決定能否成為老師，避免老師登入後才在匯入時失敗。
- **Alternatives considered**: 缺權限時仍成為老師、等匯入時再提示（後面才失敗，且要額外的重新授權流程）；要求 `profile`（多一項權限，只為了顯示名稱）。

## RD-04 伺服器端的 Google 授權：`GoogleClientProvider`

- **Decision**:
  - `GoogleClientProvider.replace(tokens)` 以 `gateway.createClient(tokens)` 建立一個 `OAuth2Client`（帶 client id、secret 與 `access_token`、`refresh_token`、`expiry_date`），取代舊的。
  - `authorizedClient()` 回傳目前的 `OAuth2Client`；還沒有老師登入時丟出 `TeacherNotSignedInError`（`code = 'NOT_SIGNED_IN'`）。003、006 把它交給 `@googleapis/sheets`、`@googleapis/drive` 使用，access token 過期時函式庫自動以 refresh token 更新（AC-17）。
  - `isGoogleAuthExpired(error)`：錯誤為 `invalid_grant`，或 Google 回 401 時回 true。授權被撤銷時，picker-token 路由與 003、006 都以它判斷，顯示「Google 授權已失效，請回首頁重新登入」（AC-19）。
  - 授權只存在記憶體，不寫入檔案（REQ-AUTH-12）；不提供撤銷與解除連結（沒有登出需求）。
- **Rationale**: 003、006 只需要「一個已授權的 client」，不需要知道登入流程；同一個 client 讓兩個子功能的授權狀態一致。
- **Alternatives considered**: 把授權存到 `credentials/google-token.json`（舊設計；使用者已定案只存在記憶體）；每次呼叫都回傳 access token 字串（003、006 要自己處理更新）。

## RD-05 檔案選擇器資料：`GET /api/auth/picker-token`

- **Decision**: 只有老師（`requireTeacher`）能呼叫。路由呼叫 `authorizedClient().getAccessToken()`（必要時更新），回傳 `{ accessToken, apiKey: GOOGLE_API_KEY, appId: GOOGLE_APP_ID }`。不回傳 refresh token 或 client secret。
- **Rationale**: Google Picker 必須在老師的瀏覽器中以 access token、developer key 與 app id 開啟（舊 001 research R3）；`setAppId` 必須是同一個 Cloud 專案編號，被挑選的檔案才會授權給 `drive.file`。access token 只給老師分頁，約一小時過期。`GOOGLE_API_KEY` 一定會出現在瀏覽器，不是祕密，在 Google Cloud 限制只能呼叫 Picker API、只接受 `http://localhost:5173`（001 RD-06）。
- **Alternatives considered**: 把 API key 與 app id 放在前端的 `.env.local`（金鑰分散在兩處；使用者定案只放伺服器環境變數）。

## RD-06 伺服器骨架

- **Decision**:
  - `server/src/main.ts`：`loadConfig(process.env)` → `buildApp(config, deps)` → `listen({ host: '127.0.0.1', port })`。`PORT` 預設 3000。
  - 環境變數以 Node.js 內建的 `--env-file-if-exists=.env` 載入（`server/package.json` 的 `dev`、`start` 指令），不加 `dotenv` 套件。repo 只放列出變數名稱的 `server/.env.example`；`server/.env` 已被根目錄 `.gitignore` 的 `.env` 規則排除。
  - `loadConfig`：四個 Google 變數都有值時 `google` 為 `GoogleConfig`，否則為 `null` 並在 `missingGoogleVars` 列出缺少的名稱；伺服器照常啟動，log 以 `warn` 列出名稱（不印值）。`/api/auth/config`、`/api/auth/google`、`/api/auth/picker-token` 回 `503 GOOGLE_NOT_CONFIGURED`（AC-21）。
  - `buildApp` 是伺服器的**組合根**：建立 Fastify（logger 用 RD-07 的設定）、統一錯誤處理、`decorate('requireTeacher', ...)`、註冊 `authRoutes`、掛載 Socket.IO（`app.io`）。003–006 新增路由時，在 `buildApp` 中以 `app.register(xxxRoutes)` 註冊，老師專用路由加 `{ preHandler: app.requireTeacher }`。
  - 錯誤回應一律是 `ErrorBody { code, message }`，`message` 是給老師看的中文（spec「登入結果與錯誤訊息」）；非預期錯誤回 `500 INTERNAL`「伺服器發生錯誤，請稍後再試」，不回傳堆疊。
  - 開發時前端用 Vite dev server（`http://localhost:5173`），以 `server.proxy` 把 `/api` 與 `/socket.io`（`ws: true`）轉到 `http://127.0.0.1:3000`，前後端同源，不需要 CORS。
- **Rationale**: 一個組合根讓 003–006 加路由時只改一處（對應前端的 `createServiceRegistry`，原則 III）；同源讓 Bearer 以外不需要任何跨網域設定。Node 24 內建讀取 env 檔，少一個套件（XI）。
- **Alternatives considered**: 缺少變數時拒絕啟動（學生頁面與其他模擬流程也無法展示）；伺服器同時提供前端的建置檔（開發階段不需要，001 已用 Vite）。

## RD-07 pino 遮蔽機敏欄位

- **Decision**: Fastify 的 `logger` 設定：
  - `redact.paths`：`req.headers.authorization`、`req.headers.cookie`、`*.teacherToken`、`*.accessToken`、`*.refreshToken`、`*.access_token`、`*.refresh_token`、`*.id_token`、`*.code`、`*.clientSecret`、`*.apiKey`，`censor: '[Redacted]'`。
  - 不記錄請求與回應的 body（Fastify 預設即如此）；錯誤 log 只記錄 `code` 與 `message`，不記錄 Google 函式庫錯誤物件中的 `config`（裡面有請求 body）。
  - 記錄登入事件：`auth.signIn`，欄位 `result`（`OK`、`SCOPE_DENIED`）、`email`、`replaced`（是否取代了前一個老師）。
- **Rationale**: 原則 VI；001 RD-07。遮蔽清單集中在一個檔案，003–006 新增欄位時只改這裡。
- **Alternatives considered**: 只靠「不要 log」的程式慣例（一行 `log.info(obj)` 就可能外洩）。

## RD-08 Socket.IO 掛載與 handshake 老師驗證

- **Decision**:
  - `attachSocketServer(app, teacherAuth)` 以 `new Server(app.server, { transports: ['websocket'] })` 建立 `io`，存為 `app.io`。只用 WebSocket 是 004 的決定（001 D22），002 建立骨架時直接套用。
  - `io.use` 中介層：`socket.handshake.auth.teacherToken` 不存在 → 一般連線（`socket.data.isTeacher = false`）；存在且 `verify` 為 true → `socket.data.isTeacher = true` 並加入 `TEACHER_ROOM`（`'teacher'`）；存在但無效 → `next(new Error('UNAUTHORIZED'))`，連線被拒絕。
  - `teacherAuth.onRotate` → `io.in(TEACHER_ROOM).disconnectSockets(true)`：換發憑證時，此刻在老師房間的都是舊憑證的連線，全部中斷（AC-08）。新分頁之後以新憑證連線。
  - 學生連線的組別、房間與事件由 004 定義；002 只保證老師連線的身分。
- **Rationale**: 老師專用的推播（例如 005 的送出列表）只送到 `TEACHER_ROOM`，學生連線不在房間內，R9 與原則 VI 在伺服器端成立（SC-003）。
- **Alternatives considered**: 每個老師事件各自檢查憑證（003–006 各寫一次，容易漏）；連線後再送登入事件（連線建立到驗證之間有空窗）。

## RD-09 CSRF 與來源

- **Decision**: `POST /api/auth/google` 要求標頭 `X-Requested-With: XmlHttpRequest`（Google 對 popup 授權碼流程的建議），沒有時回 `400 BAD_REQUEST`。其他老師請求以 `Authorization` 標頭驗證，瀏覽器不會自動帶上，不需要另外防 CSRF。
- **Rationale**: 授權碼端點不需要老師憑證，是唯一可能被其他網頁跨站送出的請求；自訂標頭會觸發 CORS 預檢，而伺服器不允許跨來源。

## RD-10 前端：`ApiClient`、`TeacherCredentialStore`、`HttpAuthService`

- **Decision**:
  - `TeacherCredentialStore`：`get`、`set`，包裝 `sessionStorage` 的 `teacherToken`；讀寫失敗（例如被瀏覽器停用）時視為沒有憑證。
  - `ApiClient.request(method, path, body?)`：有憑證就帶 `Authorization: Bearer`；JSON 進出。成功回傳 body；HTTP 錯誤以 `ApiError { status, code, message }` reject，`message` 取伺服器的 `ErrorBody.message`；`401 UNAUTHORIZED` 且本分頁有憑證時，message 改為「老師登入已失效，請回首頁重新登入」，不清除本分頁的憑證，所以被取代後的每一次老師請求都顯示同一句（#18）；`fetch` 失敗以 `ApiError { status: 0, code: 'NETWORK' }`「連不上伺服器，請確認伺服器已啟動」reject。`ApiError` 具有 `message`，符合 001 的 `UnexpectedError`，可直接往上丟（001 RD-13）。003–006 的 `Http*Service` 共用它。
  - `HttpAuthService.signInWithGoogle()`：`GET /api/auth/config` → `requestCode` → `POST /api/auth/google` → `TeacherCredentialStore.set` → `SignInResult`。`POST /api/auth/google` 以 200 回傳 `{ ok: false, failure: 'SCOPE_DENIED' }` 時轉成登入失敗（預期中的失敗用 200 回傳，與 003–006 的慣例一致；2026-11-22 由 403 改為 200）；Google 視窗取消轉成 `CANCELLED`；彈出視窗被擋、元件載入失敗轉成 `UnexpectedError`。進行中時再次呼叫，回傳同一個 Promise（spec Edge Cases：連續快速點擊）。
  - `HttpAuthService.getCurrentAccount()`：本分頁沒有憑證回 `null`；否則 `GET /api/auth/me`；憑證作廢時由 `ApiClient` reject「老師登入已失效，請回首頁重新登入」（REQ-AUTH-11）。
  - `GisGoogleIdentityClient`：第一次使用時插入 GIS `<script>`；`initCodeClient` 的 `callback` 回 `code` 或 `error`（`access_denied` → `CANCELLED`）；`error_callback` 的 `popup_closed` → `CANCELLED`、`popup_failed_to_open` → `POPUP_BLOCKED`；script 載入失敗 → `LOAD_FAILED`。
  - `createServiceRegistry()` 只改 `auth` 的綁定為 `HttpAuthService`（001 plan「替換模擬實作的方式」）。`choicePrompt` 在 `guidedNotes` 仍是模擬實作時保留；`MockAuthService` 保留，只供測試使用。
- **Rationale**: 001 的頁面與介面不改；`GoogleIdentityClient` 介面讓單元測試以替身取代 Google（原則 VIII）。
- **Alternatives considered**: 每個 `Http*Service` 各自處理 Bearer 與錯誤（重複且訊息不一致，違反 IX）。

## RD-11 等待 Google 的時間上限

- **Decision**: `GoogleAuthLibraryGateway.exchangeCode` 以 15 秒為上限（設定 `OAuth2Client` 對 Google 請求的逾時）；逾時或網路錯誤丟出 `GoogleUnavailableError`，路由回 `502 GOOGLE_UNAVAILABLE`「連不上 Google，請稍後再試」（AC-22）。授權碼無效（Google 回 `invalid_grant`）回 `400 INVALID_CODE`「Google 登入未完成，請再試一次」。
- **Rationale**: 原則 VII；避免停在載入中（SC-007）。

## RD-12 測試方式

- **Decision**（沿用 001 RD-08）:
  - 伺服器單元測試（Vitest）：`TeacherAuth` 以假的 `GoogleOAuthGateway`（`server/tests/helpers/fakeGoogleGateway.ts`）測第一次登入、`SCOPE_DENIED`、同帳號與另一個帳號登入時的換發與作廢、同時登入；`loadConfig`；`GoogleClientProvider`、`isGoogleAuthExpired`。
  - 伺服器整合測試：`buildApp` + Fastify `inject()` 測四個路由與 `requireTeacher`；listen 隨機埠 + `socket.io-client` 測 handshake 與換發後中斷；以 pino 的目的地串流擷取 log，檢查不含任何憑證內容。
  - 前端單元測試：`ApiClient`、`TeacherCredentialStore`、`HttpAuthService`（假的 `GoogleIdentityClient` 與 `fetch`）。
  - E2E（Playwright）：以 `server/tests/e2e/startTestServer.ts` 啟動使用假 gateway 的伺服器；以 `page.route` 把 GIS script 換成回傳固定授權碼的替身；驗證登入成功、取消、`SCOPE_DENIED`、在第二個分頁登入（同帳號或另一個帳號）使第一個分頁失效、學生分頁讀不到 `sessionStorage`。正式程式不含任何測試用開關。
  - 真正連線 Google 的流程只做人工驗證（[quickstart.md](./quickstart.md)），結果記錄在 `manual-verification.md`。
- **Rationale**: 自動化測試不依賴 Google（原則 VIII）；人工驗證涵蓋真正的同意畫面與 Picker。
