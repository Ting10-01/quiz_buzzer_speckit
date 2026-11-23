---
description: "Task list for 002 老師登入"
---

# Tasks: 老師登入

**Input**: Design documents from `specs/002-teacher-login/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；001 的 spec 已合併（PR #10），001 的 `frontend/`、`shared/`、`createServiceRegistry()` 實作完成後才開始（001 tasks 完成）。

**2026-11-22 修訂**：配合 001 最終版，以 Google 登入的人即為老師、任何登入取代前一個老師；刪除 `NOT_TEACHER` 與「第一個登入的帳號才是老師」的任務內容；T023 不再等待 001，改由 002 新增 `SCOPE_DENIED`；`SCOPE_DENIED` 以 200 回傳。任務編號不變。

**Tests**: 原則 VIII 要求每個 User Story 至少一個正常案例與一個邊界案例的自動化測試，Google 一律以替身取代。測試先寫、先確認失敗，再實作。

**Organization**: 依 User Story 分 Phase。P1 的 US1（登入）、US2（重新登入取代前一個老師）、US3（拒絕未登入者）在前，P2 的 US4（Google 授權）、US5（機敏資料與錯誤）在後。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1–US5）
- 路徑以 repo 根目錄為準；`server/` 由本子功能建立

---

## Phase 1: Setup

**Purpose**: 建立 `server/` workspace 與開發用 proxy

- [ ] T001 在根目錄 `package.json` 的 `workspaces` 加入 `server`，新增 `dev:server`、`test:server` scripts（依 plan「Project Structure」）
- [X] T002 建立 `server/package.json` 與 `server/tsconfig.json`：dependencies `fastify`（5.x）、`socket.io`（4.x）、`google-auth-library`；devDependencies `typescript`、`tsx`、`vitest`、`socket.io-client`；scripts `dev`：`tsx watch --env-file-if-exists=.env src/main.ts`、`test`：`vitest run`（research RD-06）；tsconfig 延伸根目錄的 strict 設定
- [X] T003 [P] 建立 `server/.env.example`：只列 `GOOGLE_CLIENT_ID=`、`GOOGLE_CLIENT_SECRET=`、`GOOGLE_API_KEY=`、`GOOGLE_APP_ID=`、`PORT=3000`，不得有任何值（REQ-AUTH-12、AC-25）
- [ ] T004 [P] 在 `frontend/vite.config.ts` 加入 `server.proxy`：`/api` → `http://127.0.0.1:3000`、`/socket.io` → `http://127.0.0.1:3000`（`ws: true`）（research RD-06）

---

## Phase 2: Foundational（伺服器骨架與前端共用元件）

**Purpose**: 所有 Story 都依賴的設定、log、錯誤格式、組合根、Google gateway 介面與前端 `ApiClient`

**⚠️ CRITICAL**: 這個 Phase 完成前不開始任何 User Story

- [X] T005 [P] `server/tests/unit/config.test.ts`：四個 Google 變數都有值時 `google` 為 `GoogleConfig`；缺一個或只有空白時 `google = null` 且 `missingGoogleVars` 列出缺少的名稱；`PORT` 未設時為 3000；`PORT` 不是 1–65535 的整數時丟出說明哪個變數有誤的錯誤（REQ-AUTH-12、REQ-AUTH-13、AC-21）
- [X] T006 [P] 實作 `server/src/config.ts`：`loadConfig(env): AppConfig`、`AppConfig { port, google: GoogleConfig | null, missingGoogleVars }`、`GoogleConfig { clientId, clientSecret, apiKey, appId }`；整個伺服器只有這裡讀 `process.env`（data-model 3）
- [X] T007 [P] 實作 `server/src/logger.ts`：`loggerOptions`，`redact.paths` 為 `req.headers.authorization`、`req.headers.cookie`、`*.teacherToken`、`*.accessToken`、`*.refreshToken`、`*.access_token`、`*.refresh_token`、`*.id_token`、`*.code`、`*.clientSecret`、`*.apiKey`，`censor: '[Redacted]'`（research RD-07）
- [X] T008 [P] 實作 `server/src/http/errors.ts`：`ErrorBody { code, message }`、`sendError(reply, status, code, message)`、Fastify `setErrorHandler`（未預期錯誤回 `500 INTERNAL`「伺服器發生錯誤，請稍後再試」，不回傳堆疊；log 只記 `code` 與 `message`）
- [X] T009 [P] 實作 `server/src/auth/GoogleOAuthGateway.ts`：介面 `GoogleOAuthGateway { exchangeCode(code): Promise<GoogleSignIn>; createClient(tokens): OAuth2Client }`、`GoogleSignIn { email, grantedScopes, tokens }`、`GoogleTokens { accessToken, refreshToken, expiryDate }`、`GoogleUnavailableError { code = 'GOOGLE_UNAVAILABLE' }`（data-model 3）
- [X] T010 [P] 建立 `server/tests/helpers/fakeGoogleGateway.ts`：可設定 `code → GoogleSignIn` 的對應、指定的 `code` 延遲完成（測同時登入）、丟出 `GoogleUnavailableError` 或 `invalid_grant`；`createClient` 回傳可控制 `getAccessToken` 結果的假 client
- [X] T011 [P] 建立 `server/tests/helpers/logCapture.ts`：以 pino 目的地串流收集 log 行，供測試搜尋字串
- [X] T012 實作 `server/src/app.ts` 的 `buildApp(config, deps)`：建立 Fastify（`loggerOptions`）、註冊錯誤處理；預留 `authRoutes`、`requireTeacher`、`app.googleClients`、Socket.IO 的註冊位置（後續任務補上）；依 T006–T009
- [X] T013 實作 `server/src/main.ts`：`loadConfig(process.env)` → `buildApp` → `listen({ host: '127.0.0.1', port })`；`missingGoogleVars` 非空時以 `warn` 只列出變數名稱（REQ-AUTH-13）
- [X] T014 建立 `server/tests/helpers/testApp.ts`：以 `fakeGoogleGateway` 建立 `buildApp`；提供 `inject` 與 listen 隨機埠兩種用法；依 T010、T012
- [ ] T015 [P] `frontend/tests/unit/http/TeacherCredentialStore.test.ts`：`set` 後 `get` 回同一個值；`clear` 後為 `null`；只寫入 `sessionStorage` 的 `teacherToken`，`localStorage` 與 `document.cookie` 不變；`sessionStorage` 丟例外時 `get` 回 `null`（REQ-AUTH-06）
- [ ] T016 [P] 實作 `frontend/src/services/http/TeacherCredentialStore.ts`（research RD-10）
- [ ] T017 [P] `frontend/tests/unit/http/ApiClient.test.ts`：有憑證時帶 `Authorization: Bearer <token>`、沒有時不帶；2xx 回傳 body；錯誤回應以 `ApiError { status, code, message }` reject，`message` 取 `ErrorBody.message`；有憑證時收到 `401 UNAUTHORIZED` 改為「老師登入已失效，請回首頁重新登入」並清除憑證；收到 `401 GOOGLE_AUTH_EXPIRED` 時保留憑證、message 取伺服器的訊息；`fetch` 失敗以 `status 0`、`code 'NETWORK'`「連不上伺服器，請確認伺服器已啟動」reject（REQ-AUTH-13、AC-23）
- [ ] T018 實作 `frontend/src/services/http/ApiClient.ts`：`ApiClient.request<T>(method, path, body?)`、`ApiError`；依 T016

**Checkpoint**: 伺服器能啟動並回應 404；前端能以 `ApiClient` 呼叫伺服器

---

## Phase 3: User Story 1 - 老師用 Google 帳號登入 (Priority: P1) 🎯 MVP

**Goal**: 以 Google 登入成功的人成為老師；取消為 `CANCELLED`；沒同意 `drive.file` 為 `SCOPE_DENIED`（002 新增）

**Independent Test**: 以假 gateway 與假 GIS，帳號 A 登入成功、取消失敗、缺權限失敗且原本的老師不受影響

### Tests for User Story 1

- [X] T019 [P] [US1] `server/tests/unit/TeacherAuth.test.ts`（登入部分）：沒有老師時帳號 A `signIn` 成功、回傳 43 字元 base64url 的 `teacherToken` 與 `account`（`name` 為 email `@` 前面），`GoogleClientProvider.replace` 以 A 的 tokens 呼叫（AC-01）；缺 `drive.file` 回 `SCOPE_DENIED`：沒有老師時仍沒有老師，已有老師時原本的憑證仍 `verify` 為 true、`replace` 沒有被呼叫（AC-04）
- [X] T020 [P] [US1] `server/tests/integration/authRoutes.test.ts`（登入部分）：`GET /api/auth/config` 回 `{ clientId }`；`POST /api/auth/google` 成功回 200 `{ ok: true, teacherToken, account }`；缺 `drive.file` 回 200 `{ ok: false, failure: 'SCOPE_DENIED' }`（預期中的失敗用 200）；缺 `X-Requested-With` 或 `code` 不是 1–2,048 字元的字串回 `400 BAD_REQUEST`；`invalid_grant` 回 `400 INVALID_CODE`；`GET /api/auth/me` 帶有效憑證回 `TeacherAccount`；回應中沒有 `NOT_TEACHER`
- [ ] T021 [P] [US1] `frontend/tests/unit/http/HttpAuthService.test.ts`（登入部分）：以假的 `GoogleIdentityClient` 與 `fetch` 驗證 contracts/auth-http.md「前端如何轉換」的每一列：成功存入憑證並回 `{ ok: true, account }`；`CANCELLED` 不呼叫伺服器；200 `{ ok: false, failure: 'SCOPE_DENIED' }` 轉成登入失敗且本分頁原有憑證不變；登入進行中再呼叫回傳同一個 Promise、只開一次 Google 視窗；`getCurrentAccount()` 沒有憑證回 `null`、有憑證回帳號（AC-01、AC-03、AC-04、REQ-AUTH-11）
- [ ] T022 [P] [US1] `frontend/tests/e2e/teacher-login.spec.ts`（登入部分）：以 `server/tests/e2e/startTestServer.ts` 與 `page.route` 替換 GIS script；首頁 →「我是老師」→「用 Google 登入」→ T-Pick 顯示帳號 A；替身回 `CANCELLED` 時看到「已取消登入」；回缺權限的帳號時看到「需要同意存取 Google 試算表才能使用老師功能」

### Implementation for User Story 1

- [ ] T023 [US1] 新增 002 的登入失敗種類（001 data-model：「其他失敗種類由 002 新增」；001 FR-013）：在 `shared/src/entities.ts` 的 `SignInFailure` 加入 `SCOPE_DENIED`；在 `frontend/src/pages/teacher/TeacherLoginPage.tsx` 的失敗訊息對照加入 `SCOPE_DENIED` →「需要同意存取 Google 試算表才能使用老師功能」（只加訊息文字，不改欄位、按鈕或頁面切換）；在 `frontend/tests/component/TeacherLoginPage.test.tsx` 加入 `SCOPE_DENIED` 顯示該訊息並停留在 T-Login 的案例
- [X] T024 [US1] 實作 `server/src/auth/GoogleAuthLibraryGateway.ts`：`exchangeCode` 以 `OAuth2Client.getToken({ code, redirect_uri: 'postmessage' })` 交換、`verifyIdToken({ audience: clientId })` 取出 `email`，`scope` 以空白切成 `grantedScopes`；沒有 refresh token、逾時（15 秒）或網路錯誤丟 `GoogleUnavailableError`；`createClient(tokens)` 回傳帶 client id、secret 與 credentials 的 `OAuth2Client`（research RD-01、RD-11）
- [X] T025 [US1] 實作 `server/src/auth/GoogleClientProvider.ts` 的 `replace(tokens)`（以 `gateway.createClient` 建立並取代 client）與 `authorizedClient()`（沒有 client 丟 `TeacherNotSignedInError`，`code = 'NOT_SIGNED_IN'`）
- [X] T026 [US1] 實作 `server/src/auth/TeacherAuth.ts`：`signIn`、`verify`（`timingSafeEqual`，長度不同回 false）、`currentAccount`；不比對帳號，`drive.file` 已同意就成為老師；`exchangeCode` 之後到換發完成之間不得有 `await`（data-model 4）；`teacherToken` 為 `crypto.randomBytes(32).toString('base64url')`；log `auth.signIn` 事件（`result`、`email`、`replaced`）；依 T024、T025
- [X] T027 [US1] 實作 `server/src/auth/requireTeacher.ts`：只接受 `Authorization: Bearer <token>`，`verify` 失敗回 `401 UNAUTHORIZED`「需要老師登入」且不執行路由；在 `buildApp` 以 `app.decorate('requireTeacher', ...)` 提供
- [X] T028 [US1] 實作 `server/src/auth/authRoutes.ts` 的 `GET /api/auth/config`、`POST /api/auth/google`、`GET /api/auth/me`（依 contracts/auth-http.md），並在 `server/src/app.ts` 註冊 `authRoutes`、以 `app.googleClients` 提供 `GoogleClientProvider`
- [ ] T029 [P] [US1] 實作 `frontend/src/services/http/GoogleIdentityClient.ts`：介面 `GoogleIdentityClient`、`GoogleCodeResult`、`GoogleCodeError`（`CANCELLED`、`POPUP_BLOCKED`、`LOAD_FAILED`）
- [ ] T030 [US1] 實作 `frontend/src/services/http/GisGoogleIdentityClient.ts`：第一次使用時載入 `https://accounts.google.com/gsi/client`；`initCodeClient`（`scope: 'openid email https://www.googleapis.com/auth/drive.file'`、`ux_mode: 'popup'`、`prompt: 'consent select_account'`）；`access_denied`、`popup_closed` → `CANCELLED`；`popup_failed_to_open` → `POPUP_BLOCKED`；script 載入失敗 → `LOAD_FAILED`（research RD-10）；依 T029
- [ ] T031 [US1] 實作 `frontend/src/services/http/HttpAuthService.ts`（`signInWithGoogle`、`getCurrentAccount`），依 contracts/auth-http.md「前端如何轉換」；依 T018、T029
- [ ] T032 [US1] 修改 `frontend/src/services/createServiceRegistry.ts`：只把 `auth` 綁定改為 `HttpAuthService`（以 `GisGoogleIdentityClient`、`ApiClient`、`TeacherCredentialStore` 建立）；其他綁定、頁面、介面不改；`MockAuthService` 保留供測試（001 plan「替換模擬實作的方式」）
- [ ] T033 [US1] 建立 `server/tests/e2e/startTestServer.ts`：以假 gateway 啟動 `buildApp`（帳號 A、B、缺權限帳號三種授權碼），供 T022 使用

**Checkpoint**: US1 可單獨展示：真正的 Google 登入（人工）或替身（自動）登入成功即為老師

---

## Phase 4: User Story 2 - 重新登入取代前一個老師 (Priority: P1)

**Goal**: 任何登入成功（同一個帳號或另一個帳號）都取代前一個老師：舊憑證作廢、Google 授權換成新帳號、活動不變

**Independent Test**: 帳號 A 在分頁 1 登入，再於分頁 2 以帳號 A 或帳號 B 登入；分頁 1 的請求被拒絕且即時連線被中斷

### Tests for User Story 2

- [ ] T034 [P] [US2] `server/tests/unit/TeacherAuth.test.ts`（取代部分）：帳號 A 再次 `signIn`、以及帳號 B 在 A 之後 `signIn`，都回新的憑證，舊憑證 `verify` 為 false、新憑證為 true，`currentAccount()` 為最後登入的帳號；`GoogleClientProvider.replace` 以新 tokens 呼叫；`onRotate` 監聽者被呼叫一次；第一次登入時不呼叫 `onRotate`（AC-07、AC-08、AC-26）；A、B 同時 `signIn`（假 gateway 延遲）重複 100 次，每次結束時恰好一組憑證有效，且最後一次 `replace` 的 tokens 屬於持有有效憑證的帳號（AC-27、SC-005）；新的 `TeacherAuth`（模擬重新啟動）沒有老師
- [ ] T035 [P] [US2] `server/tests/integration/authRoutes.test.ts`（取代部分）：帳號 A 登入後，同帳號或帳號 B 再 `POST /api/auth/google`，舊憑證呼叫 `GET /api/auth/me` 回 401、新憑證回 200 且回傳最後登入的帳號（AC-08、AC-26）
- [ ] T036 [P] [US2] `frontend/tests/e2e/teacher-login.spec.ts`（重新登入部分）：分頁 1 登入 → 重新整理後 `sessionStorage` 仍有憑證（AC-09）→ 回首頁再登入成功並進入 T-Pick（AC-07，D21 暫時限制）；另一個 browser context 以帳號 B 登入後，分頁 1 在 T-Pick 重新呼叫 `getCurrentAccount` 時共通錯誤訊息區顯示「老師登入已失效，請回首頁重新登入」（AC-08、AC-26）

### Implementation for User Story 2

- [ ] T037 [US2] 在 `server/src/auth/TeacherAuth.ts` 完成取代：任何帳號登入成功都取代 `TeacherBinding`、換發 `teacherToken`、`replace(tokens)`，原本有老師時通知 `onRotate`；三者在同一段同步程式中完成；不得呼叫或引用任何活動狀態（REQ-AUTH-03）
- [ ] T038 [US2] 確認 `frontend/src/services/http/HttpAuthService.ts` 在同分頁再次登入時以新憑證取代舊憑證（`TeacherCredentialStore.set`），並在 T021 補上對應案例

**Checkpoint**: US2 可單獨展示：重新登入或換帳號登入後舊分頁失效，活動不變

---

## Phase 5: User Story 3 - 伺服器拒絕未登入者的老師請求 (Priority: P1)

**Goal**: 所有老師專用的 HTTP 請求與即時連線都在伺服器端驗證老師憑證

**Independent Test**: 沒有、錯誤、作廢三種憑證，HTTP 與 Socket.IO 都被拒絕；有效憑證成功；學生分頁讀不到老師憑證

### Tests for User Story 3

- [ ] T039 [P] [US3] `server/tests/integration/requireTeacher.test.ts`：在測試用 app 註冊一個掛 `app.requireTeacher` 的假路由（會改變計數器）；沒有標頭、`Basic xxx`、`Bearer`（空）、錯誤憑證、作廢憑證、設了 cookie 但沒有標頭，全部回 `401 UNAUTHORIZED`「需要老師登入」且計數器不變；有效憑證回 200（AC-10、AC-11、AC-12、SC-002）
- [ ] T040 [P] [US3] `server/tests/integration/socketHandshake.test.ts`：以 `socket.io-client` 連線：沒有 `auth.teacherToken` 被接受且不在 `TEACHER_ROOM`，`io.to(TEACHER_ROOM).emit` 的訊息收不到（AC-14、SC-003）；錯誤或作廢的憑證收到 `connect_error`，`message === 'UNAUTHORIZED'`（AC-13）；有效憑證被接受、`socket.data.isTeacher === true`、收得到老師訊息（AC-15）；同帳號或另一個帳號登入後舊的老師連線被中斷，重連被拒絕（AC-08、AC-26）；只允許 `websocket` 傳輸
- [ ] T041 [P] [US3] `frontend/tests/e2e/teacher-login.spec.ts`（隔離部分）：老師分頁登入後，同一個 browser context 開學生分頁，學生分頁的 `sessionStorage` 沒有 `teacherToken`、`document.cookie` 為空，以 `fetch('/api/auth/me')` 回 401（AC-11）

### Implementation for User Story 3

- [ ] T042 [US3] 實作 `server/src/realtime/socketServer.ts`：`attachSocketServer(app, teacherAuth)` 以 `new Server(app.server, { transports: ['websocket'] })` 建立並存為 `app.io`；`io.use` 依 contracts/socket-handshake.md 處理三種 handshake；匯出 `TEACHER_ROOM = 'teacher'`；`teacherAuth.onRotate` → `io.in(TEACHER_ROOM).disconnectSockets(true)`；在 `server/src/app.ts` 呼叫
- [ ] T043 [US3] 在 `server/tests/integration/requireTeacher.test.ts` 維護一份「老師專用路由清單」（目前為 `GET /api/auth/me`、`GET /api/auth/picker-token`），逐一以沒有憑證、作廢憑證的請求驗證回 `401 UNAUTHORIZED`；003–006 新增老師路由時必須加入這份清單（contracts/server-extension.md；SC-002）

**Checkpoint**: US3 可單獨展示：學生分頁與偽造憑證都被伺服器拒絕

---

## Phase 6: User Story 4 - 老師的 Google 授權供匯入與寫回使用 (Priority: P2)

**Goal**: 003 能取得檔案選擇器資料；003、006 能以 `authorizedClient()` 呼叫 Google；授權失效清楚回報

**Independent Test**: 以假 gateway 驗證 picker-token、自動更新、未登入、授權被撤銷

### Tests for User Story 4

- [ ] T044 [P] [US4] `server/tests/unit/GoogleClientProvider.test.ts`：未 `replace` 時 `authorizedClient()` 丟 `TeacherNotSignedInError`（AC-18）；`replace` 後回傳的 client 帶 refresh token，`expiryDate` 已過時 `getAccessToken()` 會更新（以假 client 驗證被呼叫，AC-17）；`isGoogleAuthExpired` 對 `invalid_grant` 與 401 回 true、對逾時回 false
- [ ] T045 [P] [US4] `server/tests/integration/authRoutes.test.ts`（picker-token 部分）：沒有憑證回 401；有效憑證回 `{ accessToken, apiKey, appId }` 且回應中沒有 refresh token 與 client secret（AC-16）；假 client 丟 `invalid_grant` 回 `401 GOOGLE_AUTH_EXPIRED`「Google 授權已失效，請回首頁重新登入」（AC-19）；丟 `GoogleUnavailableError` 回 `502 GOOGLE_UNAVAILABLE`

### Implementation for User Story 4

- [ ] T046 [US4] 在 `server/src/auth/GoogleClientProvider.ts` 實作 `isGoogleAuthExpired(error)`（research RD-04）
- [ ] T047 [US4] 在 `server/src/auth/authRoutes.ts` 實作 `GET /api/auth/picker-token`（`preHandler: app.requireTeacher`；`authorizedClient().getAccessToken()`；回 `PickerToken`；錯誤依 contracts/auth-http.md）

**Checkpoint**: 003 可開始使用 picker-token 與 `authorizedClient()`

---

## Phase 7: User Story 5 - 機敏資料不外流、錯誤清楚 (Priority: P2)

**Goal**: log 與 repo 沒有任何憑證內容；每種錯誤都有對應訊息

**Independent Test**: 跑完登入流程後搜尋 log；缺變數、Google 逾時、伺服器沒啟動、彈出視窗被擋各自得到正確訊息

### Tests for User Story 5

- [ ] T048 [P] [US5] `server/tests/integration/logging.test.ts`：以 `logCapture` 跑完登入、同帳號重新登入、另一個帳號登入、`SCOPE_DENIED`、帶錯誤憑證的請求、picker-token；log 中搜尋不到假 gateway 的授權碼、access token、refresh token、老師憑證、client secret、API key 的值；請求的 `authorization` 顯示 `[Redacted]`（AC-20、SC-004）
- [ ] T049 [P] [US5] `server/tests/integration/authRoutes.test.ts`（錯誤部分）：`google = null` 時 `/api/auth/config`、`/api/auth/google`、`/api/auth/picker-token` 回 `503 GOOGLE_NOT_CONFIGURED`，`/api/auth/me` 帶有效憑證不受影響（AC-21）；假 gateway 丟 `GoogleUnavailableError` 時 `POST /api/auth/google` 回 `502 GOOGLE_UNAVAILABLE` 且伺服器沒有綁定（AC-22）；路由丟出未預期錯誤時回 `500 INTERNAL`，body 沒有堆疊
- [ ] T050 [P] [US5] `server/tests/unit/GoogleAuthLibraryGateway.test.ts`：以 Vitest 假計時器與不回應的假 HTTP 傳輸驗證 15 秒後丟 `GoogleUnavailableError`（AC-22、SC-007）
- [ ] T051 [P] [US5] `frontend/tests/unit/http/HttpAuthService.test.ts`（錯誤部分）：`POPUP_BLOCKED` reject「瀏覽器擋住了 Google 登入視窗，請允許彈出視窗後再試」（AC-24）；`LOAD_FAILED` reject「無法載入 Google 登入，請確認網路連線」；`503`、`502`、`400 INVALID_CODE` reject 伺服器的 message（AC-21、AC-22）；`fetch` 失敗 reject「連不上伺服器，請確認伺服器已啟動」（AC-23）

### Implementation for User Story 5

- [ ] T052 [US5] 在 `server/src/auth/authRoutes.ts` 補齊錯誤對應：`google = null` → 503；`GoogleUnavailableError` → 502；`invalid_grant` → `400 INVALID_CODE`（contracts/auth-http.md）
- [ ] T053 [US5] 在 `frontend/src/services/http/HttpAuthService.ts` 補齊 `POPUP_BLOCKED`、`LOAD_FAILED` 的 `UnexpectedError` 訊息（spec「登入結果與錯誤訊息」）

**Checkpoint**: 所有錯誤訊息與 spec 表一致；log 不含機敏資料

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T054 在 `README.md` 新增「Google 登入設定」一節：依 quickstart 第 1 節列出 Google Cloud 設定步驟與四個環境變數**名稱**，不含任何值
- [ ] T055 依 `specs/002-teacher-login/quickstart.md` 第 4 節以真正的 Google 執行 M1–M13，結果記錄在 `specs/002-teacher-login/manual-verification.md`（原則 VIII；SC-001、SC-006、AC-19 等只能人工驗證的項目）
- [ ] T056 機密檢查：以 `git grep` 搜尋 `ya29`、`1//`、`GOCSPX-`、`AIza` 與本機四個環境變數的值，確認 repo 與 commit 紀錄 0 筆，結果記在 `manual-verification.md`（AC-25、SC-004）
- [ ] T057 圖表一致性驗證：逐一對照 `diagrams/002-component.puml`、`002-class.puml`、`002-sequence.puml` 與程式碼的組件、類別、方法與呼叫順序，結果寫在 `specs/002-teacher-login/diagram-verification.md`（原則 I）

---

## Dependencies & Execution Order

- **Setup（T001–T004）** → **Foundational（T005–T018）** → 各 User Story。
- **US1（T019–T033）** 是其他 Story 的前提（需要能登入才能測重新登入、拒絕、授權）。
- **US2** 依 US1；**US3** 的 T040 換發後中斷的案例依 US2 的 `onRotate`（T037）。
- **US4** 依 US1 的 `GoogleClientProvider`（T025）。**US5** 依 US1、US4 的路由。
- T023（`SCOPE_DENIED`）只依 001 的 `shared/src/entities.ts` 與 `TeacherLoginPage.tsx` 已實作，不需等 001 修改 spec。
- D21 的「重新登入後回到控制台」等 001 修改頁面切換；不影響本子功能的任何任務（T036 驗證的是暫時限制下進入 T-Pick）。
- Polish 在所有 Story 之後。

### Parallel Opportunities

- Setup：T003、T004 平行。
- Foundational：T005–T011、T015–T017 平行（不同檔案）。
- 每個 Story 的測試任務（標 [P]）可同時撰寫。
- US1 完成後，US2、US4 可平行；US3 在 US2 完成後進行。

## Implementation Strategy

1. **MVP**：Setup + Foundational + US1 → 老師能用 Google 登入，003 即可開始以 `requireTeacher` 開發。
2. 加上 US2、US3 → 重新登入與伺服器端拒絕完成，004、005 可開始使用 handshake 與 `TEACHER_ROOM`。
3. 加上 US4 → 003、006 可使用 Google 授權。
4. 加上 US5 與 Polish → 錯誤訊息、log 遮蔽、人工驗證與圖表驗證。

一次只執行一個 Phase，完成後停下並回報測試指令與結果（CLAUDE.md 第 2 節步驟 6）。

## 需求追溯（REQ → AC → Tasks）

| 需求 | 驗收準則 | 任務 |
| --- | --- | --- |
| REQ-AUTH-01 用 Google 登入、結果與訊息 | AC-01、AC-03、AC-04 | T021、T022、T023、T029、T030、T031、T032 |
| REQ-AUTH-02 以 Google 登入的人即為老師、同一時間一個老師 | AC-01、AC-26、AC-27 | T019、T020、T026、T033、T034 |
| REQ-AUTH-03 任何登入取代前一個老師、舊憑證作廢、活動不變 | AC-07、AC-08、AC-09、AC-26、AC-27 | T034、T035、T036、T037、T038、T040、T042 |
| REQ-AUTH-04 取消 | AC-03 | T021、T022、T030 |
| REQ-AUTH-05 一次取得 `drive.file`、缺權限失敗 | AC-04 | T019、T020、T023、T024、T026、T030 |
| REQ-AUTH-06 憑證只在本分頁、Bearer、不用 cookie | AC-09、AC-11 | T015、T016、T017、T018、T039、T041 |
| REQ-AUTH-07 伺服器拒絕未登入者的老師請求 | AC-10、AC-11、AC-12 | T027、T039、T043 |
| REQ-AUTH-08 即時連線的老師檢查 | AC-13、AC-14、AC-15 | T040、T042 |
| REQ-AUTH-09 伺服器端 Google 授權 | AC-17、AC-18 | T025、T044、T046 |
| REQ-AUTH-10 檔案選擇器資料 | AC-16、AC-19 | T045、T047 |
| REQ-AUTH-11 取得目前登入的帳號 | AC-01、AC-08 | T020、T021、T028、T031、T036 |
| REQ-AUTH-12 金鑰、授權、log 不外流 | AC-20、AC-25 | T002、T003、T005、T006、T007、T048、T056 |
| REQ-AUTH-13 錯誤訊息、缺變數仍啟動 | AC-21～AC-24 | T005、T008、T013、T017、T049、T050、T051、T052、T053 |

| Success Criteria | 任務 |
| --- | --- |
| SC-001 30 秒內登入 | T055 |
| SC-002 老師請求 100% 被拒絕 | T039、T043 |
| SC-003 學生收到老師訊息 0 則 | T040 |
| SC-004 機密出現 0 次 | T048、T056 |
| SC-005 同時登入 100 次恰好一組有效憑證、授權屬於同一帳號 | T034 |
| SC-006 重新整理後 1 分鐘內恢復 | T036、T055 |
| SC-007 錯誤 15 秒內顯示 | T050、T051 |
