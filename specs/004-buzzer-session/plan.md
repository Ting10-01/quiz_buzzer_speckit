# Implementation Plan: 活動與階段同步

**Branch**: `004-buzzer-session` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-buzzer-session/spec.md`

## Summary

004 在伺服器建立唯一權威的活動狀態（`ActivityStore`），老師以 REST 指令建立活動、修改組數、在準備中取消活動、逐題開放與結束；學生以 Socket.IO 連線加入組別，伺服器依連線記住組別（`GroupMembership`）。所有改變狀態的操作在同一條 `CommandQueue` 中以同步程式碼逐一處理；每次改變後 `ActivityBroadcaster` 把帶版本號的完整快照推送給所有連線，前端只採用較新的版本。前端新增 `HttpActivityService` 實作 001 的 `ActivityService`，只改 `createServiceRegistry()` 的綁定，頁面不改。組數規則與說明文字由 004 以 `shared/src/activityRules.ts` 提供，001 的頁面依 spec「需請 001 修改」C2 引用（REQ-ACT-23、research RA-16）。004 配合 001 最終版（PR #10）：`joinGroup` 的預期失敗以 `UnexpectedError` reject；仍需 001 修改的是 C2（組數規則與說明文字），修改前是暫時限制；C1（D21）001 已於 2026-11-27 完成。2026-11-26 依 main 上的 feature-split、001 最終版（取消活動、RD-12 的 `onPhaseChange(null)`）與 002 #18 修訂。

**以三張圖為藍圖**：本計畫的組件、類別、方法與呼叫順序一律依 [`diagrams/004-component.puml`](../../diagrams/004-component.puml)、[`diagrams/004-class.puml`](../../diagrams/004-class.puml)、[`diagrams/004-sequence.puml`](../../diagrams/004-sequence.puml)。下方「藍圖對照」把圖中每個組件與類別對應到一個檔案；[data-model.md](./data-model.md) 與類別圖一一對應；時序圖的 7 段各對應 User Story 與測試（見「時序圖與測試」）。

## Technical Context

**Language/Version**: TypeScript 5（strict）；Node.js 24 LTS

**Primary Dependencies**: 沿用 001 research RD-01～RD-08：Fastify（002 建立）、React + Vite（001 建立）。004 新增 `socket.io`（server）與 `socket.io-client`（frontend；server 的測試也用）。不另選框架

**Storage**: 伺服器記憶體（`ActivityStore`、`GroupMembership`）。學生身分存在各分頁的 `sessionStorage`。不存檔（RD-05）

**Testing**: Vitest（server 單元與整合，整合測試以真的 Socket.IO 連線跑在隨機埠，Fastify `inject()` 測 REST）；Vitest + Testing Library（frontend，以假的 `RealtimeClient` 與 002 `ApiClient` 的替身測 `HttpActivityService`）；Playwright（多分頁同步）；壓力測試 `npm run test:load:activity -w server`（research RA-15）

**Target Platform**: 本機單一 Node 程序；Chrome 最新版，多分頁模擬老師與各組

**Project Type**: Web 應用（npm workspaces：`frontend/`、`shared/`、`server/`）

**Performance Goals**: 1 個老師 + 200 個學生連線時，階段改變 1 秒內送達全部連線（NFR-01）；200 個學生 1 秒內同時加入，每個都恰好一次回覆（NFR-02）

**Constraints**: 狀態只在伺服器（原則 V）；改變狀態的程式碼內不得 `await`（RA-02）；只用 WebSocket（D22）；學生收到的資料不含學習單資訊（REQ-ACT-19）；不改 001 的頁面，只改組合根（原則 III、RA-16）

**Scale/Scope**: 2–20 組、每組最多 10 個分頁；5 個 REST 端點、2 個 Socket.IO 學生事件、1 個推送事件；伺服器 10 個檔案、shared 2 個、frontend 2 個

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查（結果相同）。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 三張圖與 PNG 都在；「藍圖對照」把每個組件、類別對應到檔案；實作後依圖表做一致性驗證（tasks 最後一個 Phase） | 通過 |
| II. 規格先行與可追溯 | 每條 REQ-ACT 有 AC（checklist Notes）；tasks 的追溯表對應每條 REQ 到任務與測試；需要 001 改的地方先列在 spec，不直接改 001 | 通過 |
| III. 分層與依賴抽象 | 前端：頁面 → `ActivityService` ← `HttpActivityService`，只改組合根，不修改 001 已驗證的頁面（規則與文字以 `shared/activityRules` 提供，頁面由 001 依 C2 引用）；伺服器：`activityRoutes`、`ActivityGateway`（邊界）→ `ActivityManager`（規則）→ `ActivityStore`、`GroupMembership`（狀態）；`GroupMembership` 只依賴 `SocketRef`，不引用 Socket.IO；模擬實作的橋接只在組合根（RA-14） | 通過 |
| IV. 外部資料於執行期解析 | 題數、小題數取自 003 的匯入結果，不寫死 | 通過 |
| V. 單一權威狀態來源 | 階段、題號、組數、人數只在 `ActivityStore` 與 `GroupMembership`；前端只採用推送或回應中的快照，以版本號丟掉舊的（RA-03）；`getCurrentActivity` 也來自同一個推送（RA-09） | 通過 |
| VI. 最小揭露與機敏資料 | 學生版快照不含試算表 ID（RA-08）；組別由伺服器依連線判斷（RA-06）；學生身分在 `sessionStorage`，同瀏覽器其他分頁拿不到；`studentToken` 不進 log（RA-12）；004 不使用任何金鑰 | 通過 |
| VII. 輸入驗證與錯誤訊息 | 組數、題號、組別編號都在伺服器驗證（頁面限制範圍由 001 依 C2 完成）；組數錯誤以 `ValidationError` 指出欄位與原因；加入組別被拒絕以 `UnexpectedError` 說明原因（001 的 `joinGroup` 沒有預期失敗的回傳值）；規則不允許時狀態不變（data-model） | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 有正常與邊界測試（tasks）；Google、匯入、老師驗證以替身取代；quickstart 列出 17 個人工情境；壓力測試 | 通過 |
| IX. 程式碼規範 | 不新增頁面或元件；`RealtimeClient` 只寫一次，005、006 共用；英文命名 | 通過 |
| X. 人工把關 | 本 plan 需人工審查後才能進入 tasks | 待審查 |
| XI. 簡潔 | 不做 `Outbox`、不另設 GET 端點、不做連線狀態、不存檔、不另建 Socket.IO 伺服器（RA-04、RA-09、RA-13）；唯一的抽象 `SocketRef` 是為了讓 `GroupMembership` 能不靠 Socket.IO 測試 | 通過 |

## 藍圖對照（diagrams → 程式）

| 圖中的組件或類別 | 檔案 | 來源圖 |
| --- | --- | --- |
| `activityRules`（組數常數與說明文字） | `shared/src/activityRules.ts` | component、class |
| `SetupPage`、`StudentPlayPage` 引用 `activityRules` | 001 依 spec「需請 001 修改」C2 修改，004 不改 | component、class |
| `ActivitySnapshot`、`GroupAck` | `shared/src/activitySync.ts` | component、class |
| `HttpActivityService` | `frontend/src/services/HttpActivityService.ts` | component、class、sequence |
| `RealtimeClient` | `frontend/src/services/RealtimeClient.ts` | component、class |
| `createServiceRegistry()` 的綁定 | `frontend/src/services/createServiceRegistry.ts`（只改 `activity` 綁定、移除 `phaseControl` 與 `activityValidationControl`、加上 RA-14 的暫時橋接） | component |
| `ApiClient`、`ApiError`、`TeacherCredentialStore`（002） | `frontend/src/services/http/`（002 提供） | component、class |
| `ActivityState`、`ActivityStore` | `server/src/activity/ActivityStore.ts` | component、class、sequence |
| `GroupMembership`、`SocketRef` | `server/src/activity/GroupMembership.ts` | component、class、sequence |
| `CommandQueue` | `server/src/activity/CommandQueue.ts` | component、class、sequence |
| `SequenceClock` | `server/src/activity/SequenceClock.ts` | component、class |
| `ActivityManager`、`ActivityRuleError` | `server/src/activity/ActivityManager.ts` | component、class、sequence |
| `ActivityView`、`Audience` | `server/src/activity/ActivityView.ts` | component、class |
| `ActivityBroadcaster` | `server/src/activity/ActivityBroadcaster.ts` | component、class、sequence |
| `ActivityGateway` | `server/src/activity/ActivityGateway.ts` | component、class、sequence |
| `activityRoutes` | `server/src/activity/activityRoutes.ts` | component、class、sequence |
| 模組組裝（給 005、006） | `server/src/activity/index.ts`：`createActivityModule(app, deps)`，在 002 的 `buildApp(config, deps)`（`server/src/app.ts`）以 `app.register(...)` 註冊 | component；契約 [server-modules.md](./contracts/server-modules.md) |
| `app.requireTeacher`、`app.io` 與 handshake 老師驗證（`socket.data.isTeacher`、`TEACHER_ROOM`）、`loggerOptions`（002）；`ImportStore`（003） | 002、003 提供 | component、class |

## 時序圖與測試

| 時序圖段落 | User Story | 主要測試 |
| --- | --- | --- |
| 1. 建立活動 | US1 | `activityRoutes.test.ts`、`ActivityManager.test.ts` |
| 2. 學生加入組別 | US2 | `ActivityGateway.test.ts`、`GroupMembership.test.ts` |
| 3. 開放第 n 題 | US3 | `ActivityManager.test.ts`、`sync.test.ts` |
| 4. 結束第 n 題（老師或 005） | US3 | `ActivityManager.test.ts`（含就地執行與重複要求） |
| 5. 學生重新整理後回到原組別 | US2 | `ActivityGateway.test.ts`、e2e `activity-sync.spec.ts` |
| 6. 老師重新整理後重新登入 | US4 | `teacherRefresh.test.ts`；e2e `activity-sync.spec.ts`（回到控制台；001 C1 已完成） |
| 7. 準備中取消活動 | US1 | `ActivityManager.cancel.test.ts`、`activityRoutes.cancel.test.ts`、`HttpActivityService.cancel.test.ts`；e2e `activity-sync.spec.ts` |

## 替換模擬實作

- 依 001 plan「替換模擬實作的方式」：新增 `HttpActivityService`，只修改 `createServiceRegistry()` 中 `activity` 的綁定；移除 `phaseControl` 與 `activityValidationControl`，模擬控制列就不再顯示「模擬：推進到下一個階段」與活動的「模擬：驗證失敗」。
- `MockActivityService` 保留，只供測試使用（001 plan 讓各子功能決定）；它已不在組合根中。
- 005、006 完成前，組合根把 `HttpActivityService` 的活動與本分頁組別寫進 `MockSession`，讓模擬的送出與結果仍能展示（research RA-14）。

## 與其他子功能的交界

| 方向 | 內容 | 依據 |
| --- | --- | --- |
| 004 使用 001 | `ActivityService`（含 `cancelActivity`、`onPhaseChange(null)`，001 RD-12） | 001 spec、research RD-12 |
| 001 使用 004 | `activityRules` 的組數常數與說明文字（001 FR-023、FR-051；spec「需請 001 修改」C2） | research RA-16 |
| 004 使用 002 | `buildApp(config, deps)`、`app.requireTeacher`、`app.io`（已設 `transports: ['websocket']`；handshake 老師驗證、`TEACHER_ROOM`、`socket.data.isTeacher`；換發憑證時中斷舊老師連線）、`ErrorBody`、`loggerOptions.redact.paths`；前端 `ApiClient`、`TeacherCredentialStore`（#18：401 時不清除憑證） | 002 `contracts/server-extension.md`、`socket-handshake.md`、`auth-http.md`；RA-07、RA-13 |
| 004 使用 003 | `ImportStore.latest()`（建立活動時取題目與 `Spreadsheet`） | 跨子功能交界表 |
| 005 使用 004 | `ActivityStore`、`GroupMembership.groupOf(socket)`、`ActivityManager.endQuestion(n)`、`CommandQueue`、`SequenceClock`、Socket.IO 伺服器與 `RealtimeClient` | [contracts/server-modules.md](./contracts/server-modules.md) |
| 006 使用 004 | `ActivityStore`（題目、`endedAt`） | 同上 |

## Project Structure

### Documentation (this feature)

```text
specs/004-buzzer-session/
├── spec.md
├── plan.md                    # 本檔
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── activity-http.md       # 老師的 REST 指令（含取消活動）
│   ├── socket-events.md       # 連線、推送與學生事件
│   ├── activity-service.md    # HttpActivityService 如何實作 001 的 ActivityService
│   └── server-modules.md      # 給 005、006 的伺服器模組
├── checklists/requirements.md
├── analyze-report.md
├── manual-verification.md     # implement 階段產生
├── load-test.md               # implement 階段產生（T047 壓力測試結果）
└── tasks.md
```

### Source Code (repository root)

```text
shared/src/
├── activityRules.ts           # 004：組數範圍與預設、說明文字
└── activitySync.ts            # 004：ActivitySnapshot、GroupAck
server/
├── src/
│   ├── app.ts                 # 002 的 buildApp；004 在此以 app.register 註冊 activity 模組
│   ├── logger.ts              # 002；004 在 redact.paths 加 *.studentToken
│   └── activity/              # 004
│       ├── index.ts           # createActivityModule()
│       ├── ActivityStore.ts
│       ├── GroupMembership.ts
│       ├── CommandQueue.ts
│       ├── SequenceClock.ts
│       ├── ActivityManager.ts
│       ├── ActivityView.ts
│       ├── ActivityBroadcaster.ts
│       ├── ActivityGateway.ts
│       └── activityRoutes.ts
└── tests/
    ├── helpers/activityTestServer.ts   # 隨機埠伺服器 + 002/003 替身 + 連線工具
    ├── unit/activity/
    ├── integration/activity/
    └── load/phaseSync.load.ts
frontend/
├── src/services/
│   ├── HttpActivityService.ts # 004
│   ├── RealtimeClient.ts      # 004（005、006 共用）
│   ├── http/                  # 002：ApiClient.ts、TeacherCredentialStore.ts
│   └── createServiceRegistry.ts   # 只改 activity 綁定
└── tests/
    ├── unit/HttpActivityService.test.ts
    └── e2e/activity-sync.spec.ts
```

**Structure Decision**: 沿用 001 的 npm workspaces。伺服器的 004 程式全部放在 `server/src/activity/`；`ActivityStore`、`GroupMembership`、`CommandQueue`、`SequenceClock`、`ActivityManager`、`ActivityView` 不引用 Fastify 與 Socket.IO，可直接做單元測試；只有 `activityRoutes`、`ActivityGateway`、`ActivityBroadcaster` 碰網路。跨網路的型別放 `shared/`。

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
