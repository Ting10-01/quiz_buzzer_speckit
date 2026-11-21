# Research: 結果與寫回

**Feature**: `006-results-export` | **Date**: 2026-11-21 | **Plan**: [plan.md](plan.md)

技術選擇沿用 001 [research.md](../001-ui-prototype/research.md) 的全專案決定（RD-01～RD-08）：前端 React + TypeScript + Vite；伺服器 Node.js 24 LTS + TypeScript + Fastify；npm workspaces `frontend/`、`shared/`、`server/`；指令走 HTTP，推播走 Socket.IO（只用 WebSocket，001 D22 由 004 決定）；pino logging；Vitest、Fastify `inject()`、Playwright。006 不新增框架。Google API 用 003 已使用的官方拆分套件 `@googleapis/sheets`，授權取自 002 的 `GoogleClientProvider.authorizedClient()`（`buildApp` 以 `app.googleClients` 提供）。錯誤回應格式沿用 002 的 `ErrorBody`（`{ code, message }`），路由在 002 的 `buildApp` 以 `app.register(...)` 註冊。

本文件只記錄 006 自己的設計決定。

## RD-01 結果怎麼送到前端

- **Decision**: `getQuestionResult`、`getAllResults` 走 Socket.IO 的 emit＋ack（事件 `result:question`、`result:all`），伺服器端註冊在 002 建立的 `app.io`，前端經 004 的 `RealtimeClient.emitWithAck` 送出；`writeBack` 走 HTTP `POST /api/results/write-back`，路由加 `{ preHandler: app.requireTeacher }`，前端經 002 的 `ApiClient.request`。
- **Rationale**:
  - 學生在題目結束後、活動結束前，要拿到「本組自己的送出」（REQ-RES-03），伺服器必須知道這個請求屬於哪一組。004 依連線判斷組別（`GroupMembership.groupOf(socket)`，原則 VI），所以查詢走同一條 Socket.IO 連線，請求中不帶組別。
  - 讀取不需要老師身分：公布範圍對老師與「沒有加入組別的連線」相同（見 RD-02），所以 `result:*` 不驗證老師。
  - 寫回是會改動外部資料的指令，依 001 RD-03「指令走 HTTP」，並沿用 002 的 `requireTeacher`；HTTP 也最容易用 `inject()` 測試權限。
- **Alternatives considered**:
  - 讀取也走 HTTP，並在標頭帶 socket id 讓伺服器查組別：多一個要驗證的輸入，結果相同。
  - 一題結束時由伺服器主動推送結果：001 的介面是「頁面要求才取得」（`getQuestionResult`），推送需要改 001 的介面。

## RD-02 公布範圍在伺服器端過濾

- **Decision**: `ResultQuery` 先從 005 的 `SubmissionStore` 組出完整的 `QuestionResult`，再以 `visible(full, finished, viewerGroup)` 過濾：
  - 題目未結束 → 不回傳（`questionResult` 丟 `QUESTION_NOT_ENDED`；`allResults` 略過該題）。
  - 題目已結束、活動未結束 → `winner`、`submissionCount` 原樣；`submissions` 只留 `groupNumber === viewerGroup` 的那一筆（`viewerGroup` 為 `null` 時為空）。
  - 活動已結束（`FINISHED`）→ 原樣：所有送出，依 `rank` 排序。
- **Rationale**: 一個純函式涵蓋三種情況，容易以單元測試窮舉（SC-006）；過濾在權威來源端執行（原則 VI）。老師在 T-QuestionEnd 只需要成功組別與送出組數（001 FR-034），不需要另外的老師版本（原則 XI）。
- **Alternatives considered**: 依角色分成老師版與學生版兩種回傳型別（要改 001 的實體與介面）。

## RD-03 怎麼判斷「一題已結束」

- **Decision**: 讀 004 `ActivityStore.current()` 回傳的 `ActivityState`：第 n 題已結束 ⇔ `state.endedAt.has(n)`；活動已結束 ⇔ `state.phase === FINISHED`。沒有活動時 `current()` 為 `null`。
- **Rationale**: `endedAt` 是 004 在結束一題時寫入的權威狀態（004 data-model `ActivityState`），直接讀就好，不必依題號順序推算（原則 V）；004 讓最後一題結束時 `phase` 變成 `FINISHED`，所以活動結束時每一題都在 `endedAt` 中。

## RD-04 寫回前的版面檢查

- **Decision**: 重用 003 contracts/import-store.md「給 006 的讀取工具」：`app.spreadsheetReader.load(spreadsheetId)`（回傳 `LoadedSpreadsheet`，含每個工作表的 `SheetGrid`）與 `new GuidedNotesParser().parse(grid, spreadsheet)`，重新解析活動使用的工作表。兩者都不讀寫 `ImportStore`，006 不經過 `GuidedNotesImporter`。步驟：
  1. `loaded = reader.load(latest.spreadsheet.id)`；以 `loaded.sheets.find(s => s.name === latest.spreadsheet.selectedWorksheet)` 取得工作表，找不到 → `SHEET_NOT_FOUND`（003 建議視為版面不一致；006 改用較明確的「找不到學習單」訊息，兩者都不寫入）。
  2. `loaded.editable === false` → `NO_EDIT_PERMISSION`，不建立備份。
  3. `current = parser.parse(grid, latest.spreadsheet)`（`spreadsheet` 只被複製進結果）。
  4. 比較 `current` 與 `ImportStore.latest()`：題號清單相同，且每一題每個小題的 `blankCell` 相同。第一個不一致的題號回報為 `LAYOUT_CHANGED`；`current` 是 `ImportError`（例如表頭被改掉）視為第 1 題不一致。
- **Rationale**: 解析規則只在 003 一處（原則 IV、IX）；只比對題號與填空格位置，老師只改題目敘述或其他儲存格不會被擋（spec Edge Cases）；插入或刪除列會讓填空格位置改變，一定會被抓到（AC-21）。同一次 `load` 也給了備份需要的 `sheetId` 與現有的工作表名稱（RD-05），不必再讀一次。
- **Alternatives considered**: 呼叫 003 的 `GuidedNotesImporter.read()`（會更新 `ImportStore`）；只檢查題號欄（006 要另外知道題號欄的位置，等於重寫 003 的規則）；不檢查（可能把答案寫進錯的格子）。

## RD-05 備份工作表

- **Decision**: 版面檢查通過後，`SpreadsheetWriter.duplicateSheet(spreadsheetId, sheetId, newTitle)` 以 `spreadsheets.batchUpdate` 的 `duplicateSheet` 請求複製學習單工作表（`sourceSheetId` 為 RD-04 那次 `load` 的 `SheetGrid.sheetId`）。名稱由純函式 `backupName(worksheet, now, existing)` 產生：`${worksheet}-備份-YYYYMMDD-HHmm`（伺服器本機時間），已存在時依序加 `-2`、`-3`。`existing` 是同一次 `load` 的所有工作表名稱。
- **Rationale**: `duplicateSheet` 連同格式與合併範圍一起複製（SC-008）；放在同一份試算表，`drive.file` 範圍就夠，不會在老師的雲端硬碟多出檔案。
- **Alternatives considered**: 複製整份試算表（多一個檔案）；把寫回前的值存在伺服器（伺服器重啟就消失，老師在 Google 上看不到）。

## RD-06 一次批次、純文字寫入

- **Decision**: `SpreadsheetWriter.writeTexts` 呼叫一次 `spreadsheets.values.batchUpdate`，`valueInputOption: 'RAW'`，每個填空格一個 `ValueRange`，範圍為 `'<工作表名稱>'!<A1>`（工作表名稱中的單引號重複一次）。寫入文字由 `composeCellText(marker, answer)` 產生：`marker` 為空字串時是 `answer`，否則 `marker + answer`。
- **Rationale**: `RAW` 讓「=1+1」存成文字（AC-16）；單一批次請求由 Google 整批套用，失敗時不會只寫一部分（REQ-RES-14）；只寫值，不動格式與合併（REQ-RES-10）。寫入內容只由搶答結果決定，所以重試與寫一次的結果相同（AC-19）。
- **已知限制**: 寫入要求已送出、但 15 秒內沒有回應時，無法知道 Google 是否已套用。此時回 `WRITE_UNCONFIRMED`，訊息說明無法確認、不會只寫一部分、可以再寫回一次（2026-11-21 clarify）。
- **Alternatives considered**: `USER_ENTERED`（「=」開頭會變公式）；每格一個請求（慢，而且中途失敗會留下寫一半的工作表）。

## RD-07 Google 錯誤的對應

- **Decision**: 讀取（003 的 `GoogleSheetsReader`）與備份、寫入（006 的 `GoogleSheetsWriter`）拋出的錯誤，一律由 `WriteBackService.mapGoogleError(error, step)` 轉成 `WriteBackFailure`，`step` 為 `READ`、`BACKUP`、`WRITE`，依序判斷：

| 錯誤 | READ | BACKUP | WRITE |
| --- | --- | --- | --- |
| 002 `isGoogleAuthExpired(error)` 為 true，或 `TeacherNotSignedInError` | `GOOGLE_AUTH_EXPIRED` | `GOOGLE_AUTH_EXPIRED` | `GOOGLE_AUTH_EXPIRED` |
| 003 `SheetsReadError('AUTH_EXPIRED')` | `GOOGLE_AUTH_EXPIRED` | — | — |
| 003 `SheetsReadError('NO_ACCESS')`（Google 403／404） | `SHEET_NOT_FOUND` | — | — |
| 003 `SheetsReadError('UNAVAILABLE')`（逾時、網路、5xx） | `GOOGLE_UNAVAILABLE` | — | — |
| Google 403 | — | `NO_EDIT_PERMISSION` | `NO_EDIT_PERMISSION` |
| Google 404 | — | `SHEET_NOT_FOUND` | `SHEET_NOT_FOUND` |
| 逾時（15 秒）或網路中斷 | — | `GOOGLE_UNAVAILABLE` | `WRITE_UNCONFIRMED` |
| 其他（含 5xx） | 原樣丟出（500） | `BACKUP_FAILED` | `GOOGLE_UNAVAILABLE` |

- **Rationale**: 授權失效的判斷沿用 002 的 `isGoogleAuthExpired`，代碼沿用 002 的 `GOOGLE_AUTH_EXPIRED`；讀取錯誤沿用 003 已分好的 `SheetsReadError`。對應只有一處，`GoogleSheetsWriter` 只是薄薄一層 API 呼叫；每個代碼的訊息就是 spec「寫回失敗原因」表的文字（`WRITE_UNCONFIRMED`、`IN_PROGRESS` 以外都說明沒有寫入任何格子）。WRITE 的 5xx 表示 Google 已回應失敗、沒有套用，所以是 `GOOGLE_UNAVAILABLE` 而不是 `WRITE_UNCONFIRMED`。

## RD-08 同時只處理一個寫回

- **Decision**: `WriteBackService` 以一個 `inProgress` 布林值擋住並行的寫回；進行中再收到要求回 `IN_PROGRESS`，`finally` 中清除。
- **Rationale**: 伺服器是單一 Node 程序（001 RD-02），一個旗標就夠；避免同時建立兩份備份（AC-28）。

## RD-09 HTTP 回應格式

- **Decision**: `POST /api/results/write-back` 成功回 `200` 與 `WriteBackResult { ok: true, cellCount }`；預期中的失敗也回 `200`，body 為 `WriteBackResult { ok: false, cellCount: 0, failureReason }`。非 2xx 只用在：`401 UNAUTHORIZED`（002 `requireTeacher`）、`401 GOOGLE_AUTH_EXPIRED`（沿用 002 對授權失效的規定，body 為 002 `ErrorBody { code, message }`）、`500` 非預期錯誤。前端 `ServerResultService.writeBack` 把兩種 401 的 `ApiError` 轉成 `{ ok: false, cellCount: 0, failureReason }`，其他 `ApiError` 往上丟。
- **Rationale**: 002 的 `ApiClient` 遇到非 2xx 只保留 `{ status, code, message }`；001 契約規定寫回失敗是回傳值（`WriteBackResult.ok = false`），伺服器直接回傳同一個實體最簡單，前端只需處理兩種 401。
- **非預期錯誤**: 連不上伺服器（`ApiError` `NETWORK`）、`500`，`ServerResultService` 直接把 `ApiError`（符合 `UnexpectedError`）往上丟（001 FR-009）。

## RD-10 前端 `ServerResultService`

- **Decision**: 新增 `frontend/src/services/ServerResultService.ts`，實作 001 的 `ResultService`；建構時傳入 004 的 `RealtimeClient`（全部分頁共用的那一條連線）與 002 的 `ApiClient`。`result:*` 用 `RealtimeClient.emitWithAck`（5 秒逾時，逾時以 `UnexpectedError("連不上伺服器")` reject）；ack 為 `{ ok: false, code, message }` 時以 `UnexpectedError(message)` reject。在 `createServiceRegistry()` 把 `result` 綁定改成它；`MockResultService` 保留給 001 的測試使用，不刪除。
- **Rationale**: 只新增實作、只改組合根的一行綁定（001 plan「替換模擬實作的方式」、原則 III）；連線、逾時、老師憑證都沿用 002、004 的實作，不重寫（原則 IX）。頁面在題目未結束時不會呼叫 `getQuestionResult`（004 先切換頁面），所以 `QUESTION_NOT_ENDED` 只會在有人繞過頁面時出現，當作非預期錯誤即可。

## RD-11 測試策略

- **Decision**:
  - 單元（Vitest）：`ResultQuery`（公布範圍的每個組合，以 004、005 store 的替身）；`cellText`（標記、`backupName` 與重名）；`WriteBackService`（以假的 `SpreadsheetWriter`、`SpreadsheetReader`、`ImportStore` 測每一種成功與失敗，失敗時斷言沒有呼叫 `writeTexts`、版面失敗時也沒有呼叫 `duplicateSheet`）；`GoogleSheetsWriter`（以假的 `@googleapis/sheets` 回應測 `RAW`、範圍跳脫、`duplicateSheet` 請求內容與 15 秒逾時）；`ServerResultService`（假的 `RealtimeClient` 與 `ApiClient`）。版面檢查直接使用 003 真正的 `GuidedNotesParser`，只把 `SpreadsheetReader` 換成假物件（003 的 `gridBuilder` 測試工具）。
  - 整合（Vitest + Fastify `inject()`、`socket.io-client`）：`app.requireTeacher` 擋住寫回，並把寫回路由加進 002 的老師專用路由清單測試；`result:*` 依連線組別過濾；200 個連線在一題結束後 1 秒內拿到結果（SC-005）。
  - 端對端（Playwright）：老師與學生分頁看到本題結果、全部結果，確認視窗文字（沿用 005 的 E2E 環境，Google 以替身取代）。
  - 真正連線 Google Sheets 的寫回只做人工驗證（[quickstart.md](quickstart.md)），紀錄寫入 `manual-verification.md`（原則 VIII）。
- **Rationale**: 自動化測試不連真實的 Google（原則 VIII）；寫回的每個失敗分支都能在沒有網路時重現。
