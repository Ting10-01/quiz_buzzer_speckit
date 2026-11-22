# Implementation Plan: 老師登入

**Branch**: `002-teacher-login` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-teacher-login/spec.md`

## Summary

002 讓老師在 T-Login 用 Google 帳號登入（R1），同一次登入取得 `drive.file` 授權（助教補充 10/21），並在伺服器端拒絕未登入者使用老師功能的請求。以 Google 登入的人即為老師（001 FR-013、feature-split 002）；任何人登入成功都取代前一個老師，舊憑證作廢、Google 授權換成新帳號（D21 的 002 部分）。D21 的「重新登入後回到控制台」等 001 修改頁面切換，在那之前重新登入後進入 T-Pick（暫時限制）。

**2026-11-22 修訂**：配合 001 最終版（PR #10）與 feature-split 最新版，刪除「第一個登入的帳號才是老師」與 `NOT_TEACHER`；`SCOPE_DENIED` 由 002 新增（001 data-model 已授權），改以 200 回傳；「需請 001 修改」只剩 D21 的頁面切換。

做法（[research.md](research.md)）：

- 前端以 Google Identity Services 的授權碼 popup 取得 `code`，伺服器以 `google-auth-library` 交換授權並驗證 id_token（RD-01）。
- 伺服器記憶體保存唯一的「目前的老師」（老師憑證與 Google 授權屬於同一個帳號）；前端把憑證放在 `sessionStorage`，以 `Authorization: Bearer` 帶上（RD-02）。
- 002 建立 `server/` 骨架：Fastify 組合根 `buildApp`、`loadConfig`（環境變數）、pino 遮蔽機敏欄位、統一錯誤格式、Socket.IO 掛載與 handshake 老師驗證（RD-06～RD-08）。
- 提供 003–006 共用的 `requireTeacher`、`GoogleClientProvider.authorizedClient()`、`GET /api/auth/picker-token`，以及前端的 `ApiClient`、`TeacherCredentialStore`（[contracts/server-extension.md](contracts/server-extension.md)）。
- 前端只新增 `HttpAuthService` 並改 `createServiceRegistry()` 中 `auth` 的綁定；001 的頁面不改，唯一例外是依 001 FR-013 在 T-Login 的失敗訊息對照加上 `SCOPE_DENIED` 的訊息文字。

**以三張圖為藍圖**：本計畫的組件、類別、方法與呼叫順序一律依 [`diagrams/002-component.puml`](../../diagrams/002-component.puml)、[`diagrams/002-class.puml`](../../diagrams/002-class.puml)、[`diagrams/002-sequence.puml`](../../diagrams/002-sequence.puml)。圖中每個組件與類別對應「藍圖對照」中的一個檔案；[data-model.md](data-model.md) 與類別圖一一對應。規劃時補進類別圖的項目見「圖表的修訂」。

## Technical Context

**Language/Version**: TypeScript 5（strict）；Node.js 24 LTS（沿用 001 RD-01、RD-02）

**Primary Dependencies**: 伺服器新增 `fastify`（5.x，內建 pino）、`socket.io`（4.x）、`google-auth-library`；開發用 `tsx`、`socket.io-client`（測試）。前端不新增套件（Google Identity Services 於執行期由 Google 載入）。版本於 implement 時鎖定在 `package-lock.json`

**Storage**: 無。目前的老師、老師憑證、Google 授權只存在伺服器記憶體；老師憑證另存在老師分頁的 `sessionStorage`

**Testing**: Vitest（伺服器單元與 Fastify `inject()` 整合、前端單元）、`socket.io-client`（handshake 整合）、Playwright（E2E，以替身取代 Google）；真正連線 Google 只做人工驗證（research RD-12）

**Target Platform**: 本機。伺服器 `127.0.0.1:3000`；前端 Vite dev server `http://localhost:5173`，以 proxy 轉發 `/api`、`/socket.io`

**Project Type**: Web 應用（npm workspaces：`frontend/`、`shared/`、本子功能新增 `server/`）

**Performance Goals**: 依 SC-001（30 秒內完成登入）與 SC-007（每種錯誤 15 秒內顯示）；等待 Google 最多 15 秒

**Constraints**: 金鑰只從環境變數讀取（四個 Google 變數，REQ-AUTH-12）；不讀寫 `credentials/`；不使用 cookie 判斷老師身分；001 的頁面、介面、實體欄位不改；`SignInFailure` 由 002 新增 `SCOPE_DENIED`（001 data-model 寫明其他失敗種類由 002 新增）

**Scale/Scope**: 1 位老師、同時最多約 200 個分頁連線（沿用 005 的壓力目標）；4 個 HTTP 路由、1 個 preHandler、1 個 Socket.IO 中介層

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 三張圖與 PNG 都存在；本計畫以它們為藍圖，「藍圖對照」列出每個組件與類別的檔案；規劃時的補充已先更新圖表並重新產生 PNG | 通過 |
| II. 規格先行與可追溯性 | 每條 REQ-AUTH 都有 AC；tasks 的追溯表對應每條 REQ 到任務與測試。規劃時新增的兩則訊息（`INVALID_CODE`、`INTERNAL`）已先加入 spec「登入結果與錯誤訊息」 | 通過 |
| III. 分層架構與依賴抽象 | 前端：頁面 → `AuthService` ← `HttpAuthService`，只改組合根的綁定。伺服器：路由 → `TeacherAuth` → `GoogleOAuthGateway`（介面）；003–006 只在 `buildApp` 註冊路由、透過 `requireTeacher` 與 `GoogleClientProvider` 使用，不修改 002 的實作 | 通過 |
| IV. 外部資料於執行期解析 | 002 不解析試算表；Google 回傳的 `scope`、id_token 於執行期檢查 | 不適用／通過 |
| V. 單一權威狀態來源 | 誰是老師只由伺服器的 `TeacherAuth` 決定（最後一次登入成功的人）；老師憑證與 Google 授權在同一段同步程式中一起換發，不會分屬兩個帳號；前端只保存伺服器發的憑證，不自行判斷身分 | 通過 |
| VI. 最小資訊揭露與機敏資料保護 | 老師檢查在伺服器端（`requireTeacher`、handshake）；憑證只在發出它的分頁；四個金鑰只從環境變數讀取；Google 授權只在記憶體；pino `redact`；picker-token 只回 access token、API key、app id。repo 只有 `server/.env.example`（只有名稱）。access token 與 API key 會出現在老師的瀏覽器，這是 Picker 的必要條件（research RD-05），API key 以 Google Cloud 限制來源與 API | 通過 |
| VII. 輸入驗證與錯誤訊息 | `POST /api/auth/google` 驗證標頭與 `code`；`Authorization` 格式驗證；`PORT` 驗證；每種錯誤都有指定的中文訊息（spec 表） | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 都有正常與邊界案例的自動化測試；Google 以 `GoogleOAuthGateway`、`GoogleIdentityClient` 的替身取代；人工驗證 M1–M13 記在 `manual-verification.md` | 通過 |
| IX. 程式碼規範 | 錯誤轉換集中在 `ApiClient`（前端）與 `ErrorBody` 錯誤處理（伺服器），不重複實作；命名與註解用英文 | 通過 |
| X. 人工把關 | 本計畫經人工審查後才進入 tasks | 待審查 |
| XI. 簡潔 | 不做登出、撤銷授權、更換老師、憑證期限、cookie、CORS、`dotenv`（用 Node 內建 `--env-file-if-exists`）。兩個介面（`GoogleOAuthGateway`、`GoogleIdentityClient`）各只有一個實作，存在的理由是原則 VIII 要求以替身取代外部服務 | 通過 |

**Phase 1 設計後重新檢查**：data-model、contracts、quickstart 沒有引入新的違反；結果同上表。

## 藍圖對照

| 圖中的組件或類別 | 檔案 | 來源圖 |
| --- | --- | --- |
| `HttpAuthService` | `frontend/src/services/http/HttpAuthService.ts` | component、class、sequence |
| `GoogleIdentityClient`、`GoogleCodeResult`、`GoogleCodeError` | `frontend/src/services/http/GoogleIdentityClient.ts` | component、class |
| `GisGoogleIdentityClient` | `frontend/src/services/http/GisGoogleIdentityClient.ts` | component、class、sequence |
| `ApiClient`、`ApiError` | `frontend/src/services/http/ApiClient.ts` | component、class、sequence |
| `TeacherCredentialStore` | `frontend/src/services/http/TeacherCredentialStore.ts` | component、class、sequence |
| `createServiceRegistry`（001，只改 `auth` 綁定） | `frontend/src/services/createServiceRegistry.ts` | component |
| `SignInFailure.SCOPE_DENIED`（002 新增） | `shared/src/entities.ts`；訊息文字加在 `frontend/src/pages/teacher/TeacherLoginPage.tsx` 的失敗訊息對照（001 FR-013） | class |
| `buildApp` | `server/src/app.ts` | component、class |
| `AppConfig`、`GoogleConfig`、`loadConfig` | `server/src/config.ts` | component、class |
| `loggerOptions` | `server/src/logger.ts` | component |
| `ErrorBody`、錯誤處理 | `server/src/http/errors.ts` | class |
| `authRoutes`、`PickerToken` | `server/src/auth/authRoutes.ts` | component、class、sequence |
| `requireTeacher` | `server/src/auth/requireTeacher.ts` | component、class、sequence |
| `TeacherAuth`、`TeacherBinding`、`SignInOutcome` | `server/src/auth/TeacherAuth.ts` | component、class、sequence |
| `GoogleOAuthGateway`、`GoogleSignIn`、`GoogleTokens`、`GoogleUnavailableError` | `server/src/auth/GoogleOAuthGateway.ts` | component、class |
| `GoogleAuthLibraryGateway` | `server/src/auth/GoogleAuthLibraryGateway.ts` | component、class、sequence |
| `GoogleClientProvider`、`TeacherNotSignedInError`、`isGoogleAuthExpired` | `server/src/auth/GoogleClientProvider.ts` | component、class、sequence |
| `attachSocketServer`、`TEACHER_ROOM` | `server/src/realtime/socketServer.ts` | component、class、sequence |
| （進入點，圖中不畫） | `server/src/main.ts` | — |

時序圖第 1 段對應 `signInWithGoogle` → `POST /api/auth/google` → `TeacherAuth.signIn` 的呼叫順序；第 2 段對應 `requireTeacher` 與 handshake；第 3 段對應 picker-token 與 `authorizedClient()`。實作完成後的圖表一致性驗證（原則 I）以這三段逐一對照。

## 圖表的修訂

| 編號 | 規劃時發現 | 修訂內容 |
| --- | --- | --- |
| G-1 | research RD-11 需要區分「連不上 Google」與其他錯誤 | 類別圖新增 `GoogleUnavailableError`（`GoogleAuthLibraryGateway` 丟出） |
| G-2 | 003、006 要從 `app` 取得 `GoogleClientProvider`（contracts/server-extension.md） | 類別圖新增 `buildApp --> TeacherAuth`、`buildApp --> GoogleClientProvider : app.googleClients` |
| G-3 | 2026-11-22 配合 001 最終版：以 Google 登入的人即為老師、任何登入取代前一個老師、`SCOPE_DENIED` 由 002 新增且以 200 回傳 | 類別圖拿掉 `NOT_TEACHER`、`TeacherBinding.googleSub`、`GoogleSignIn.sub`，`SignInFailure` 註記改為「002 新增」；時序圖第 1 段拿掉「sub 不同 → NOT_TEACHER」分支，`SCOPE_DENIED` 改為 200，成功分支改為「取代前一個老師」並註明 D21 的暫時限制 |

PNG 已重新產生。

## Project Structure

### Documentation (this feature)

```text
specs/002-teacher-login/
├── spec.md
├── plan.md                     # 本檔
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth-http.md            # /api/auth/* 四個路由與前端轉換
│   ├── socket-handshake.md     # Socket.IO 掛載與老師連線驗證
│   └── server-extension.md     # 給 003–006 的擴充點
├── checklists/requirements.md
├── analyze-report.md
├── manual-verification.md      # implement 階段產生
└── tasks.md
```

### Source Code (repository root)

```text
package.json                    # workspaces 加入 server；新增 dev、test 共用 scripts
server/
├── package.json                # dev: tsx watch --env-file-if-exists=.env src/main.ts
├── tsconfig.json
├── .env.example                # 只列 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_API_KEY、GOOGLE_APP_ID、PORT
├── src/
│   ├── main.ts
│   ├── app.ts                  # buildApp：伺服器組合根
│   ├── config.ts
│   ├── logger.ts
│   ├── http/errors.ts
│   ├── auth/
│   │   ├── authRoutes.ts
│   │   ├── requireTeacher.ts
│   │   ├── TeacherAuth.ts
│   │   ├── GoogleOAuthGateway.ts
│   │   ├── GoogleAuthLibraryGateway.ts
│   │   └── GoogleClientProvider.ts
│   └── realtime/socketServer.ts
└── tests/
    ├── helpers/
    │   ├── fakeGoogleGateway.ts
    │   ├── logCapture.ts
    │   └── testApp.ts          # buildApp + 假 gateway；listen 隨機埠
    ├── unit/
    │   ├── config.test.ts
    │   ├── TeacherAuth.test.ts
    │   ├── GoogleClientProvider.test.ts
    │   └── GoogleAuthLibraryGateway.test.ts
    ├── integration/
    │   ├── authRoutes.test.ts
    │   ├── requireTeacher.test.ts
    │   ├── socketHandshake.test.ts
    │   └── logging.test.ts
    └── e2e/startTestServer.ts  # 給 Playwright 用的伺服器（假 gateway）
frontend/
├── vite.config.ts              # 加入 server.proxy：/api、/socket.io（ws）
├── src/services/
│   ├── createServiceRegistry.ts   # auth → HttpAuthService
│   └── http/
│       ├── ApiClient.ts
│       ├── TeacherCredentialStore.ts
│       ├── HttpAuthService.ts
│       ├── GoogleIdentityClient.ts
│       └── GisGoogleIdentityClient.ts
└── tests/
    ├── unit/http/
    │   ├── ApiClient.test.ts
    │   ├── TeacherCredentialStore.test.ts
    │   └── HttpAuthService.test.ts
    └── e2e/teacher-login.spec.ts
```

**Structure Decision**: 沿用 001 的 npm workspaces，新增 `server/`（001 RD-02）。伺服器依職責分 `auth/`、`http/`、`realtime/`；003–006 之後在 `server/src/` 下各自新增資料夾，並只在 `app.ts` 註冊。前端的 HTTP 實作集中在 `frontend/src/services/http/`，003–006 的 `Http*Service` 也放這裡。

## 與其他子功能的交界

| 交界 | 002 提供 | 對方 | 契約 |
| --- | --- | --- | --- |
| 老師專用 HTTP 路由 | `app.requireTeacher` | 003、004、005、006 | server-extension.md |
| 老師即時連線 | handshake、`socket.data.isTeacher`、`TEACHER_ROOM`、換發時中斷 | 004、005 | socket-handshake.md |
| 伺服器端 Google 授權 | `app.googleClients.authorizedClient()`、`isGoogleAuthExpired` | 003、006 | server-extension.md |
| 檔案選擇器 | `GET /api/auth/picker-token` | 003 | auth-http.md |
| 前端呼叫伺服器 | `ApiClient`、`TeacherCredentialStore` | 003、004、005、006 | server-extension.md |
| 登入失敗種類 | 002 新增 `SCOPE_DENIED`（T023） | 001（data-model 已授權由 002 新增） | spec D1 |
| 重新登入回控制台 | 任何登入取代前一個老師、活動不變 | 001（頁面切換，已在 PR #10 留言）、004（何謂進行中） | spec「需請 001 修改」第 1 條；001 改之前為暫時限制，重新登入後進入 T-Pick |

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
