# Implementation Plan: 結果與寫回

**Branch**: `006-results-export` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-results-export/spec.md`

## Summary

006 以真正的實作取代 001 的 `MockResultService`。伺服器的 `ResultQuery` 從 004 的 `ActivityStore` 與 005 的 `SubmissionStore` 組出每一題的 `QuestionResult`，依「題目是否結束、活動是否結束、呼叫者是哪一組」在伺服器端過濾後，經 Socket.IO ack 回給頁面。老師按「寫回」時，`WriteBackService` 依序確認活動已結束、學習單沒有換掉、用 003 的 `SpreadsheetReader.load()` 與 `GuidedNotesParser.parse()` 重新解析工作表檢查版面（不更新 `ImportStore`）、複製備份工作表，最後以一次 `values.batchUpdate`（`RAW`）寫入有成功組別的填空格（標記＋答案）；任何一步失敗都不寫入任何填空格。

**以三張圖為藍圖**：組件、類別、方法與呼叫順序一律依 [`diagrams/006-component.puml`](../../diagrams/006-component.puml)、[`diagrams/006-class.puml`](../../diagrams/006-class.puml)、[`diagrams/006-sequence.puml`](../../diagrams/006-sequence.puml)。圖中每個 006 的組件對應「Project Structure」中的一個檔案（見「藍圖對照」）；[data-model.md](data-model.md) 與類別圖一一對應；寫回步驟的順序與時序圖第 3 段相同。

## Technical Context

**Language/Version**: TypeScript 5（strict）；Node.js 24 LTS

**Primary Dependencies**: 沿用 001 research：Fastify（伺服器，002 的 `buildApp`）、Socket.IO（002 的 `app.io`；前端用 004 的 `RealtimeClient`，只用 WebSocket）、pino、React + Vite（前端；HTTP 用 002 的 `ApiClient`）。Google API 用 003 已使用的 `@googleapis/sheets`。006 不新增套件。

**Storage**: 無。結果每次從 004、005 的記憶體狀態組出；寫回的對象是老師雲端上的原試算表

**Testing**: Vitest（單元、Fastify `inject()` 整合、`socket.io-client` 整合）；Playwright（端對端，沿用 005 的多分頁環境，Google 以替身取代）；真正寫回 Google 以人工驗證（[quickstart.md](quickstart.md)）

**Target Platform**: 本機單一 Node 程序，需能連上 Google；Chrome 多分頁

**Project Type**: Web 應用（npm workspaces：`frontend/`、`shared/`、`server/`）

**Performance Goals**: 一題結束後 1 秒內所有學生分頁顯示結果（200 分頁，SC-005）；200 題寫回 5 秒內完成（SC-004）

**Constraints**: 公布範圍在伺服器端過濾（原則 VI）；寫回全有或全無，失敗不寫任何格子（D20）；先檢查版面、再備份、最後寫入；只寫 003 解析出的填空格（原則 IV）；每次 Google 呼叫 15 秒逾時；不讀取、不修改 `.env`、`credentials/`

**Scale/Scope**: 200 題以內、20 組以內、200 個學生分頁；伺服器 7 個檔案、前端 1 個新檔與組合根 1 行綁定

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查（結果相同）。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 三張圖與 PNG 都在 `diagrams/`；本計畫的組件、類別與順序都依圖（「藍圖對照」） | 通過 |
| II. 規格先行與可追溯性 | 計畫沒有加入 spec 沒有的行為；每條 REQ-RES 都有 AC 或 SC，tasks 階段對應任務與測試；需要 001 改頁面的地方已列在 spec「需請 001 修改」，不在 006 修改 | 通過 |
| III. 分層架構與依賴抽象 | 頁面 → `ResultService` ← `ServerResultService`，只改組合根的綁定；`WriteBackService` 只依賴 `SpreadsheetWriter` 介面與其他子功能公開的 store，Google 只出現在 `GoogleSheetsWriter`；001～005 的既有實作不修改 | 通過 |
| IV. 外部資料於執行期解析 | 寫入位置只來自 003 匯入時解析出的 `blankCell`；版面檢查重用 003 的解析規則；對不上就拒絕，不猜測 | 通過 |
| V. 單一權威狀態來源 | 結果只由 004、005 的權威狀態組出，不另存、不重新判定；頁面只呈現回傳的 `QuestionResult` | 通過 |
| VI. 最小資訊揭露與機敏資料保護 | 題目未結束不提供結果；活動結束前學生只拿到本組送出；組別由伺服器依連線判斷；寫回需老師憑證；log 不含憑證與 Google token | 通過 |
| VII. 輸入驗證與錯誤訊息 | 題號驗證；寫回前檢查活動、學習單、版面、編輯權限；每種失敗都有原因與解決方式；失敗時學習單不變 | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 都有正常與邊界案例的自動化測試，Google 以替身取代；quickstart 16 個人工情境含真實寫回 | 通過 |
| IX. 程式碼規範 | 006 不新增介面元件（頁面屬於 001）；查詢、寫回、Google 呼叫分開；英文命名 | 通過 |
| X. 人工把關 | 本計畫需人工審查後才進入實作 | 待審查 |
| XI. 簡潔 | 不保存結果、不做 CSV、不做重啟恢復；唯一新介面 `SpreadsheetWriter` 有正式實作與測試替身；一個布林值處理並行寫回 | 通過 |

**Phase 1 設計後重新檢查**：data-model、contracts、quickstart 沒有引入新的違反；結果同上表。

## 藍圖對照（diagrams → 程式）

| 圖上的組件／類別 | 檔案 | 來源圖 |
| --- | --- | --- |
| ServerResultService | `frontend/src/services/ServerResultService.ts` | component、class、sequence |
| createServiceRegistry（只換 `result` 的綁定） | `frontend/src/services/createServiceRegistry.ts`（001 的檔案，只改一行） | component |
| resultSocketHandlers（`registerResultHandlers`） | `server/src/results/resultSocketHandlers.ts` | component、class、sequence |
| resultsRoutes | `server/src/results/resultsRoutes.ts` | component、class、sequence |
| ResultQuery、ResultQueryError、ResultQueryErrorCode | `server/src/results/ResultQuery.ts` | component、class、sequence |
| WriteBackService、WriteBackFailure、WriteBackErrorCode、WriteBackStep | `server/src/results/WriteBackService.ts` | component、class、sequence |
| cellTextRules（`composeCellText`、`backupName`） | `server/src/results/cellText.ts` | class、sequence |
| SpreadsheetWriter、CellText | `server/src/results/SpreadsheetWriter.ts` | class |
| GoogleSheetsWriter | `server/src/results/GoogleSheetsWriter.ts` | component、class |
| 註冊上述 plugin 與 socket handler | 002 的 `buildApp`（`server/src/app.ts`）加入 `app.register(resultsRoutes, …)` 與 `registerResultHandlers(app.io, …)` 各一行（002 contracts/server-extension.md 認可的預期修改） | component |
| 001 頁面、`ResultService`、實體 | 不修改 | component、class |
| 002 `app.requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`app.io`、`ApiClient`；003 `ImportStore`、`SpreadsheetReader`、`GuidedNotesParser`；004 `ActivityStore`、`GroupMembership`、`RealtimeClient`；005 `SubmissionStore` | 直接引用，不另寫 | component、class、sequence |

## Project Structure

### Documentation (this feature)

```text
specs/006-results-export/
├── spec.md
├── plan.md                # 本檔
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── results-api.md     # Socket.IO 事件與寫回 HTTP
├── checklists/requirements.md
├── analyze-report.md
├── manual-verification.md # implement 階段產生
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── src/results/
│   ├── ResultQuery.ts
│   ├── resultSocketHandlers.ts
│   ├── WriteBackService.ts
│   ├── cellText.ts
│   ├── SpreadsheetWriter.ts
│   ├── GoogleSheetsWriter.ts
│   └── resultsRoutes.ts
└── tests/
    ├── helpers/FakeSpreadsheetWriter.ts
    ├── unit/results/       # ResultQuery、cellText、WriteBackService、GoogleSheetsWriter
    └── integration/results/ # resultsRoutes（inject）、resultSocketHandlers（socket.io-client）
frontend/
├── src/services/
│   ├── ServerResultService.ts
│   └── createServiceRegistry.ts   # 只改 result 的綁定
└── tests/
    ├── unit/ServerResultService.test.ts
    └── e2e/results.spec.ts
```

**Structure Decision**: 006 的伺服器程式全部放在 `server/src/results/`，Google 的寫入呼叫只在 `GoogleSheetsWriter.ts`。`MockResultService` 保留給 001 的測試，不刪除（001 plan「替換模擬實作的方式」）。

## 與其他子功能的交界

名稱與簽章已與 002～005 的 contracts 對齊（2026-11-21）。

| 交界 | 006 用到的 | 依據 |
| --- | --- | --- |
| 002 `buildApp`、`app.register` | 註冊 `resultsRoutes` | 002 contracts/server-extension.md |
| 002 `app.requireTeacher` | 寫回路由的 `preHandler`；路由加入 002 T043 的老師專用路由清單測試 | 同上 |
| 002 `app.googleClients`（`GoogleClientProvider.authorizedClient()`）、`isGoogleAuthExpired`、`TeacherNotSignedInError` | `GoogleSheetsWriter` 取授權；授權失效回 `401 GOOGLE_AUTH_EXPIRED` | 同上 |
| 002 `ErrorBody`；`ApiClient` 遇到非 2xx 只保留 `{ status, code, message }` | 寫回的預期失敗一律 `200` + `WriteBackResult { ok: false }`；非 2xx 只用於兩種 401 與 500；socket ack 失敗用 `{ ok: false, code, message }` | 同上 |
| 002 `app.io` | 註冊 `result:question`、`result:all` | 002 contracts/socket-handshake.md |
| 002 前端 `ApiClient.request(method, path, body?)`、`ApiError` | `ServerResultService.writeBack` | 002 contracts/server-extension.md |
| 003 `ImportStore.latest()` | `spreadsheet.id`、`selectedWorksheet`、`blankCell`、`marker` | 003 contracts/import-store.md |
| 003 `app.spreadsheetReader.load()`、`SheetGrid`、`new GuidedNotesParser().parse()`、`SheetsReadError`（`NO_ACCESS`／`UNAVAILABLE`／`AUTH_EXPIRED`） | 版面檢查（不讀寫 `ImportStore`）；`sheetId` 與現有工作表名稱給備份用 | 003 contracts/import-store.md「給 006 的讀取工具」 |
| 004 `ActivityStore.current(): ActivityState \| null` | `phase`、`questions`、`spreadsheet`、`endedAt` | 004 contracts/server-modules.md、data-model |
| 004 `GroupMembership.groupOf(socket)` | 查詢者的組別 | 同上 |
| 004 前端 `RealtimeClient.emitWithAck` | `result:*` 的送出與 5 秒逾時 | 004 data-model |
| 005 `SubmissionStore.list(n)`、`winner(n)` | 每題依順位的送出與成功送出 | 005 contracts/submission-store.md |
| 001 `SubQuestion.marker` | 寫入「標記＋答案」 | 003 spec「需請 001 修改」（006 不另外要求） |

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
