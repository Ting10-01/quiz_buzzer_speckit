# Implementation Plan: 搶答與判定

**Branch**: `005-buzz-submission` | **Date**: 2026-11-21（2026-11-22 配合 001 最終版修訂） | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-buzz-submission/spec.md`

## Summary

005 以真正的實作取代 001 的 `MockSubmissionService`，實作 001 最終版 `SubmissionService` 的七個方法，配合 001 的頁面現況、不改頁面。學生在一題開放後經 Socket.IO 整組送出，伺服器依連線判斷組別（004 `GroupMembership`），所有送出與老師的判定都放進 004 的 `CommandQueue.run`（與 004 的開放、結束一題共用同一個順序）同步逐一處理，取得連續的順位；經過時間用 004 的 `SequenceClock.stamp()` 減去 004 記錄的開放時間。老師經 HTTP（002 `app.requireTeacher`）依順序判定：只有最前面的待判定答案可判定；接受時在同一個 `run` 內呼叫 004 的 `ActivityManager.endQuestion(n)` 自動結束本題，其餘待判定答案改為未判定，`judge` 回傳 `JudgeOutcome { submissions, activity }` 讓老師頁面依階段切換；不接受時該組不能重送，學生停在等待判定頁。同組組員送出時，伺服器通知同組其他分頁（`onGroupSubmitted`）；學生加入時可取得本組這一題的送出（`getGroupSubmission`）。學生只收到本組的送出與判定，`rank` 一律為 0（R9；001 改成可選前的做法）。送出結果存在 `SubmissionStore`，提供給 006。

**以三張圖為藍圖**：組件、類別、方法與呼叫順序一律依 [`diagrams/005-component.puml`](../../diagrams/005-component.puml)、[`diagrams/005-class.puml`](../../diagrams/005-class.puml)、[`diagrams/005-sequence.puml`](../../diagrams/005-sequence.puml)。下方「藍圖對照」把圖中每個組件與類別對應到程式檔案；[data-model.md](./data-model.md) 的類別、欄位、方法與類別圖一一對應。

## Technical Context

**Language/Version**: TypeScript 5（strict），Node.js 24 LTS（沿用 001 research RD-01、RD-02）

**Primary Dependencies**: Fastify（002 的 `buildApp`）、Socket.IO 4（002 的 `app.io`、004 的前端 `RealtimeClient`，只用 WebSocket 傳輸）、pino（002 的 `loggerOptions`）、004 的 `CommandQueue`、`SequenceClock`、`ActivityStore`、`GroupMembership`、`ActivityManager`、002 的前端 `ApiClient`、React（001 的前端，不改頁面）。005 不新增執行期套件；`socket.io-client` 已是前端依賴，伺服器的整合與壓力測試另加為 devDependency

**Storage**: 伺服器記憶體（`SubmissionStore`）；伺服器重啟即消失，不寫檔（001 research RD-05）

**Testing**: Vitest（單元、整合；整合以 Fastify `inject()` 與真的 Socket.IO 連線）、Playwright（多分頁端對端）、壓力測試 `npm run test:load -w server`（research RD-10、RD-11）

**Target Platform**: 本機單一 Node 程序；Chrome 為主，多分頁模擬老師與各組

**Project Type**: Web 應用（npm workspaces：`frontend/`、`shared/`、`server/`，與 001 相同）

**Performance Goals**: 200 個學生連線、1 秒內 1,000 筆送出：回覆 p95 ≤ 1 秒、最長 ≤ 2 秒；老師畫面落後 ≤ 1 秒（REQ-SUB-NFR-01、02）

**Constraints**: 順序只由伺服器決定，臨界區不得 `await`（REQ-SUB-07）；學生端不得收到他組資料與順位（REQ-SUB-16）；不改 001 的頁面，配合 001 最終版的現況（唯一請 001 改的 `Submission.rank` 可選不阻擋實作）；不使用資料庫

**Scale/Scope**: 2–20 組、每組最多 10 個分頁；伺服器 8 個類別（004 的 `CommandQueue`、`SequenceClock` 不算在內）、前端 1 個服務實作、1 個共用事件型別檔

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查，結果相同。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 三張圖與 PNG 都在 `diagrams/`；「藍圖對照」把每個組件、類別對應到程式路徑；data-model 與類別圖一致 | 通過 |
| II. 規格先行與可追溯性 | 每條 REQ-SUB、NFR 都有 AC 或 SC；tasks 階段建立追溯表。D10–D18 依 001 最終版與 feature-split 3.2、第 4 節逐條處理（spec「001 交給 005 的事項」） | 通過 |
| III. 分層架構與依賴抽象 | 頁面只依賴 001 的 `SubmissionService` 介面；005 只新增 `ServerSubmissionService` 並改組合根綁定。伺服器：`SubmissionGateway`、`SubmissionRoutes` 是邊界，規則在 `SubmissionEngine`，資料在 `SubmissionStore`；Socket.IO 只出現在 Gateway 與 Notifier | 通過 |
| IV. 外部資料於執行期解析 | 小題數取自 `ActivityStore` 中 003 解析出的題目，不寫死 | 通過 |
| V. 單一權威狀態來源 | 階段與題號只讀 004 的 `ActivityStore`；送出、順位、判定只在 `SubmissionStore`；前端只呈現伺服器回傳或推送的完整列表 | 通過 |
| VI. 最小資訊揭露與機敏資料 | 學生只收本組資料，`rank` 一律為 0（`SubmissionVisibility.forStudent`）；送出列表與判定需 `app.requireTeacher`，老師推播只送 `TEACHER_ROOM`；log 不記答案與憑證；005 不碰金鑰 | 通過（research RD-06） |
| VII. 輸入驗證與錯誤訊息 | 送出的題號、格數、空白、長度、組別都在伺服器驗證，錯誤指出是哪一格；判定請求格式錯誤回 400，不合規則不改變狀態 | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 有正常與邊界案例；Google、時鐘以替身取代；壓力測試；人工驗證紀錄 | 通過 |
| IX. 程式碼規範 | 不新增頁面元件；呈現（頁面）與資料（服務）分離；英文命名 | 通過 |
| X. 人工把關 | 本計畫需人工審查後才進入 tasks | 待審查 |
| XI. 簡潔 | 不用資料庫、鎖、worker、每連線 Outbox（research RD-05）；沒有只有一個實作的新介面；不自建佇列與時鐘，直接用 004 的；判定通知掃描連線而不維護組別房間（research RD-05） | 通過 |

## 藍圖對照（diagrams → 程式）

| 圖中的組件／類別 | 程式位置 | 來源圖 |
| --- | --- | --- |
| `ServerSubmissionService` | `frontend/src/services/server/ServerSubmissionService.ts` | component、class、sequence |
| `createServiceRegistry()`（改 `submission` 綁定，移除 `judgementControl`、`submissionValidationControl`、`teammateControl`） | `frontend/src/services/createServiceRegistry.ts`（001 的檔案，只改綁定） | component |
| `SubmitRequest`、`SubmitReply`、`OwnSubmissionRequest`、`OwnSubmissionReply`、`JudgeRequest`、`SubmissionsChanged`、`GroupSubmitted`、`SubmissionJudged`、事件名稱常數 | `shared/src/submissionEvents.ts` | class |
| `SubmissionGateway` | `server/src/submission/SubmissionGateway.ts` | component、class、sequence |
| `SubmissionRoutes` | `server/src/submission/SubmissionRoutes.ts` | component、class、sequence |
| `SubmissionEngine` | `server/src/submission/SubmissionEngine.ts` | component、class、sequence |
| `SubmissionStore`、`QuestionSubmissions`、`SubmissionRecord` | `server/src/submission/SubmissionStore.ts` | component、class、sequence |
| `SubmissionVisibility` | `server/src/submission/SubmissionVisibility.ts` | component、class |
| `SubmissionNotifier` | `server/src/submission/SubmissionNotifier.ts` | component、class、sequence |
| 組裝與註冊（建立上述物件、訂閱 `ActivityStore.subscribe`、在 `app.io` 註冊事件、註冊路由） | `server/src/submission/index.ts` 的 `submissionRoutes`（Fastify plugin）；在 002 的 `buildApp`（`server/src/app.ts`）加一行 `app.register(submissionRoutes, deps)` | component |
| 004 `CommandQueue`、`SequenceClock`、`ActivityStore`、`GroupMembership`、`ActivityManager.endQuestion`、`RealtimeClient`；002 `buildApp`、`app.requireTeacher`、`app.io`、`TEACHER_ROOM`、`ApiClient`、logger；006 `ResultService` | 其他子功能的檔案，005 只呼叫，不修改 | component、class、sequence |

## 交界假設

已對照 001 最終版、004 `contracts/server-modules.md`（含前端 `RealtimeClient.on`、`emitWithAck`、`onConnect`）、`socket-events.md` 與 002 `contracts/server-extension.md`、`socket-handshake.md`。下列是 005 依賴、但對方契約沒有明寫或需要對方配合的部分。

| # | 假設 | 對象 |
| --- | --- | --- |
| A-1 | `ActivityStore.subscribe(listener)` 的 listener 在 `commit` 當下、仍在 `CommandQueue.run` 內同步被呼叫（004 契約已寫明）。005 在 listener 中看到第 n 題不再開放時，把待判定改為未判定 | 004 |
| A-2 | 004 擁有唯一的 `CommandQueue.run<T>(command: () => T): T` 與 `SequenceClock.stamp()`；004 的開放、結束一題也走這條佇列（REQ-ACT-17），所以 005 的送出、判定與它們構成單一順序。`ActivityState.openedAt` 由同一個 `SequenceClock` 記錄 | 004 |
| A-3 | 004 的 `ActivityManager.snapshot(Audience.TEACHER)` 可在 `CommandQueue.run` 內呼叫，回傳當下的老師視角 `Activity`；005 用它組 `JudgeOutcome.activity`（004 data-model 已列出 `snapshot(audience)`，但寫的用途是「連線時第一次推送」） | 004 |
| A-4 | `ActivityManager.endQuestion(n)` 在第 n 題不是目前開放的題目時丟 `ActivityRuleError(QUESTION_NOT_OPEN)`，已結束時不改變不報錯；005 只在確認第 n 題開放中之後呼叫。最後一題時 004 一併把活動改為 `FINISHED`（D9） | 004 |
| A-5 | 005 的老師路由加進 002 的老師路由清單測試（002 T043），確認沒有老師憑證時被 `app.requireTeacher` 拒絕 | 002 |
| A-6 | 002 提供測試用的老師憑證取得方式（不連 Google），供 005 的整合、端對端與壓力測試使用；學生加入組別與開題直接走 004 的 `group:join` 與 HTTP | 002、004 |
| A-7 | 006 以 `SubmissionStore.list(n)`、`winner(n)` 取得每題結果；`list` 回傳老師視角（含 `rank`）的 `Submission[]` | 006 |
| A-8 | 001 把 `Submission.rank` 改成可選之前，學生視角 `rank` 填 0；改完後由 005 的後續任務 T035 改成不放 `rank`。這一項不阻擋 005 的實作 | 001 |

## Project Structure

### Documentation (this feature)

```text
specs/005-buzz-submission/
├── spec.md
├── plan.md                     # 本檔
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── submission-api.md       # Socket.IO 事件與 HTTP API
│   └── submission-store.md     # 提供給 006 的 SubmissionStore
├── checklists/requirements.md
├── analyze-report.md
├── manual-verification.md      # implement 階段產生
└── tasks.md
```

### Source Code (repository root)

```text
shared/src/
└── submissionEvents.ts                  # 005：事件名稱與 payload 型別
server/
├── package.json                         # 005：加入 test:load script、socket.io-client devDependency
├── src/
│   ├── app.ts                           # 002 的 buildApp：加一行 app.register(submissionRoutes, deps)
│   └── submission/                      # 005
│       ├── index.ts                     # submissionRoutes（Fastify plugin）：組裝並註冊
│       ├── SubmissionEngine.ts
│       ├── SubmissionStore.ts           # SubmissionStore、QuestionSubmissions、SubmissionRecord
│       ├── SubmissionVisibility.ts
│       ├── SubmissionNotifier.ts
│       ├── SubmissionGateway.ts
│       └── SubmissionRoutes.ts
└── tests/
    ├── unit/submission/
    ├── integration/submission/
    └── load/submission.load.ts
frontend/
├── src/services/
│   ├── createServiceRegistry.ts         # 001 的檔案：只改 submission 綁定、移除兩個模擬控制
│   └── server/ServerSubmissionService.ts
└── tests/
    ├── unit/ServerSubmissionService.test.ts
    └── e2e/
        ├── submission.spec.ts
        └── submission-texts.spec.ts
```

**Structure Decision**: 伺服器的 005 程式集中在 `server/src/submission/`，只有 `SubmissionGateway`、`SubmissionNotifier` 使用 Socket.IO，只有 `SubmissionRoutes` 使用 Fastify；`SubmissionEngine`、`SubmissionStore` 不依賴網路，可用假物件做單元測試。事件型別放 `shared/`，前後端改動欄位時編譯期就會發現。

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
