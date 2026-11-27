---
description: "Task list for 006 結果與寫回"
---

# Tasks: 結果與寫回

**Input**: Design documents from `specs/006-results-export/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/results-api.md、quickstart.md；001～005 已完成（`buildApp`、`app.requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`app.io`、`ApiClient` 來自 002；`ImportStore`、`SpreadsheetReader`、`GuidedNotesParser` 來自 003；`ActivityStore`、`GroupMembership`、`RealtimeClient` 來自 004；`SubmissionStore` 來自 005）

**Tests**: 原則 VIII 要求每個 User Story 至少一個正常與一個邊界案例的自動化測試。測試先寫、先確認失敗，再實作。自動化測試不連真實的 Google（research RD-11）。

**Organization**: 依 User Story 分 Phase：US1（P1 一題結束後公布）、US2（P1 全部結果）、US3（P1 寫回）、US4（P1 寫回失敗不改動學習單）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story

---

## Phase 1: Setup

**Purpose**: 006 的測試替身

- [X] T001 [P] 建立 `server/tests/helpers/FakeSpreadsheetWriter.ts`：實作 `SpreadsheetWriter`，記錄 `duplicateSheet`、`writeTexts` 的呼叫順序與參數；可設定任一方法丟出指定的錯誤（Google 401／403／404／500、逾時）
- [X] T002 [P] 建立 `server/tests/helpers/resultFakes.ts`：004 `ActivityStore`、`GroupMembership`，005 `SubmissionStore`（`list`、`winner`），003 `ImportStore`（`latest()` 與 `latestMarkers()`，題組小題帶「（1）」等標記）、`SpreadsheetReader`（`app.spreadsheetReader` 的替身，經 `buildApp` 的 `deps.spreadsheetReader` 注入；以 003 的 `server/tests/helpers/gridBuilder.ts` 產生 `SheetGrid`；可設定丟出 `SheetsReadError` 或 Google 401）的替身；`ActivityState` 含 `endedAt`；提供「4 題、6 組、第 2 題已結束、第 3 題搶答中」與「4 題已全部結束（含沒有送出、有 `UNJUDGED` 的題目，最後一題由老師接受而直接進入 `FINISHED`）」兩份固定資料，題目內容與 001 `MockFixtures` 的「題組＋單題範本」相同（4 題，其中 2 題為題組；伺服器測試不引用前端檔案）

---

## Phase 2: Foundational

**Purpose**: 所有 User Story 共用的型別

**⚠️ CRITICAL**: 這個 Phase 完成前不開始 User Story

- [X] T003 建立 `server/src/results/SpreadsheetWriter.ts`：`CellText`（`cell`、`text`）與 `SpreadsheetWriter` 介面（`duplicateSheet(spreadsheetId, sheetId, newTitle)`、`writeTexts`），依 data-model 第 4 節與類別圖

**Checkpoint**: 型別就緒

---

## Phase 3: User Story 1 - 一題結束後公布該題結果 (Priority: P1) 🎯 MVP

**Goal**: 一題結束後老師與學生拿到該題結果；題目結束前任何人都拿不到；活動結束前學生只多拿到本組的送出

**Independent Test**: 以替身建立「第 2 題已結束、第 3 題進行中」，用不同組別的連線呼叫 `result:question`

### Tests for User Story 1 ⚠️

- [X] T004 [P] [US1] `server/tests/unit/results/ResultQuery.question.test.ts`：已結束的題目回傳成功組別、各小題答案與 `submissionCount`（AC-01）；第 5 組只多拿到本組的送出、看不到其他沒有成功的組別，回傳的 `winner` 與本組送出 `rank` 為 0、`behindFirstMs` 與 `submissions` 同長度且都是 0（AC-02、REQ-RES-03）；有送出但沒有成功組別、沒有送出兩種情況（AC-03、AC-04）；`endedAt` 沒有該題時丟 `QUESTION_NOT_ENDED`（AC-05、REQ-RES-02）；`viewerGroup` 為 `null` 時 `submissions` 為空（AC-06）；沒有活動 → `NO_ACTIVITY`、題號 0、5、`1.5` → `QUESTION_NOT_FOUND`（REQ-RES-06）；活動結束後 `winner`、`submissions` 分別等於 005 替身的 `winner(n)`、`list(n)`（REQ-RES-05）
- [X] T005 [P] [US1] `server/tests/integration/results/resultSocketHandlers.test.ts`：以 `socket.io-client` 連上 `buildApp` 建立的測試伺服器（`app.io`），`result:question` 的 ack 格式依 contracts；組別取自 `GroupMembership.groupOf(socket)`，payload 夾帶 `groupNumber` 也不影響結果（AC-06）；未結束的題目 ack `{ ok: false, code: "QUESTION_NOT_ENDED", message: "這一題還沒結束，結果尚未公布" }`（AC-05）
- [X] T006 [P] [US1] `server/tests/integration/results/resultLoad.test.ts`：200 個連線在題目結束後同時 emit `result:question`，全部在 1 秒內收到 ack（SC-005）
- [X] T007 [P] [US1] `frontend/tests/unit/ServerResultService.test.ts`（getQuestionResult 部分）：以假的 `RealtimeClient` 斷言呼叫 `emitWithAck("result:question", { questionNumber })`；ack 成功回傳 `QuestionResult`；ack `ok: false` → reject `UnexpectedError(message)`；`emitWithAck` reject 時原樣往上丟

### Implementation for User Story 1

- [X] T008 [US1] 實作 `server/src/results/ResultQuery.ts` 的 `ResultQueryError`、`ResultQueryErrorCode`、`questionResult`、`isEnded`、`visible`，依 data-model 第 3 節與 research RD-02、RD-03
- [X] T009 [US1] 實作 `server/src/results/resultSocketHandlers.ts` 的 `registerResultHandlers`（`result:question`），並在 002 的 `buildApp` 以 `registerResultHandlers(app.io, query, membership)` 註冊（004 的 `createActivityModule()` 之後），依 T008
- [X] T010 [US1] 實作 `frontend/src/services/ServerResultService.ts` 的建構子（`realtime: RealtimeClient`、`api: ApiClient`）與 `getQuestionResult`，依 research RD-10 與 contracts

**Checkpoint**: 一題結束後的結果可由伺服器取得，公布範圍正確

---

## Phase 4: User Story 2 - 整輪結束後檢視全部結果 (Priority: P1)

**Goal**: 活動結束後所有人看到每一題所有送出；活動進行中只回已結束的題目

**Independent Test**: 以替身建立已結束的活動，`result:all` 的內容與 005 替身的送出完全一致

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] `server/tests/unit/results/ResultQuery.all.test.ts`：`FINISHED` 時每題所有送出依 `rank` 排序，學生、老師、未加入組別的連線拿到相同內容（AC-07、AC-08、REQ-RES-04）；結束時待判定的送出為 `UNJUDGED` 且不是 `winner`（AC-09）；`behindFirstMs` 以順位 1 的 `elapsedMs` 為基準，`elapsedMs` 3200、5000、5000 且第 2 名被接受時為 `[0, 1800, 1800]`，沒有送出時為 `[]`（AC-30、REQ-RES-21）；最後一題沒有 `endedAt` 但 `phase` 為 `FINISHED` 時仍算已結束；活動進行中只回第 1、2 題，每題只含呼叫者本組的送出且 `rank`、`behindFirstMs` 為 0（AC-10）；窮舉「題目未結束／已結束 × 活動未結束／已結束 × 6 組與 `null`」，未結束的題目送出出現 0 次、活動結束前他組未成功的送出出現 0 次（SC-006）
- [X] T012 [P] [US2] 在 `server/tests/integration/results/resultSocketHandlers.test.ts` 加入 `result:all`：ack 格式、只含已結束的題目、沒有活動 → `NO_ACTIVITY`
- [X] T013 [P] [US2] 在 `frontend/tests/unit/ServerResultService.test.ts` 加入 `getAllResults`：成功、`ok: false`、逾時

### Implementation for User Story 2

- [X] T014 [US2] 在 `server/src/results/ResultQuery.ts` 實作 `allResults` 與 `behindFirstMs` 的計算，在 `resultSocketHandlers.ts` 註冊 `result:all`，依 data-model 第 3 節與 research RD-12
- [X] T015 [US2] 在 `frontend/src/services/ServerResultService.ts` 實作 `getAllResults`

**Checkpoint**: 全部結果可由伺服器取得，內容與 005 一致

---

## Phase 5: User Story 3 - 把答案寫回原本的 Google Sheets 學習單 (Priority: P1)

**Goal**: 活動結束後老師寫回：版面檢查 → 備份 → 一次 `RAW` 寫入有成功組別的填空格

**Independent Test**: 以 `FakeSpreadsheetWriter` 與 003 替身跑一次寫回，檢查呼叫順序與寫入內容；真正寫回以 quickstart 情境 6～9 人工驗證

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] `server/tests/unit/results/cellText.test.ts`：`composeCellText("（1）", "CPU") === "（1）CPU"`、標記為空時只回答案（AC-13、REQ-RES-08）；`backupName` 依本機時間產生 `原名-備份-YYYYMMDD-HHmm`，重名依序加 `-2`、`-3`（AC-17、REQ-RES-13）
- [X] T017 [P] [US3] `server/tests/unit/results/WriteBackService.success.test.ts`：呼叫順序為 `SpreadsheetReader.load` → `GuidedNotesParser.parse`（003 真正的 parser）→ `duplicateSheet`（`sheetId` 為該工作表的 `SheetGrid.sheetId`）→ `writeTexts`，`writeTexts` 只呼叫一次；`ImportStore.save` 沒有被呼叫（AC-12、REQ-RES-12、13、14）；寫入的儲存格恰好是有成功組別題目的每個小題 `blankCell`，沒有其他儲存格（AC-14、AC-15、REQ-RES-07、09、10）；題組小題的文字為「`latestMarkers()[blankCell]` ＋答案」，沒有標記的格子只寫答案（AC-13）；所有題目都沒有成功組別 → 不呼叫 `load`、`duplicateSheet`、`writeTexts`，回 `{ ok: true, cellCount: 0 }`（AC-18）；連續寫回兩次，兩次 `writeTexts` 的內容相同、`duplicateSheet` 各一次（AC-19、REQ-RES-18）；`cellCount` 等於寫入格數（REQ-RES-20）
- [X] T018 [P] [US3] `server/tests/unit/results/GoogleSheetsWriter.test.ts`（以假的 `@googleapis/sheets` 回應）：`writeTexts` 只送一次 `spreadsheets.values.batchUpdate`，`valueInputOption` 為 `RAW`，「=1+1」原樣送出（AC-16、REQ-RES-11）；範圍為 `'<工作表>'!<cell>`，名稱中的 `'` 變成 `''`；`duplicateSheet` 送出一個 `duplicateSheet` 請求（`sourceSheetId`、`newSheetName`）；每個請求設定 15 秒逾時；每次呼叫都向 `app.googleClients.authorizedClient()` 取授權
- [X] T019 [P] [US3] `server/tests/integration/results/resultsRoutes.test.ts`（Fastify `inject()`）：帶有效老師憑證 `POST /api/results/write-back` → `200` 與 `WriteBackResult`；`WriteBackService` 丟出 `WriteBackFailure` 時回 `200` 與 `{ ok: false, cellCount: 0, failureReason }`，只有 `GOOGLE_AUTH_EXPIRED` 回 `401` 與 `ErrorBody { code, message }`（以假的 `WriteBackService`）
- [X] T020 [P] [US3] 在 `frontend/tests/unit/ServerResultService.test.ts` 加入 `writeBack`：以假的 `ApiClient` 斷言呼叫 `request("POST", "/api/results/write-back")`；成功原樣回傳 body

### Implementation for User Story 3

- [X] T021 [P] [US3] 實作 `server/src/results/cellText.ts`（`composeCellText`、`backupName`），依 data-model 第 4 節
- [X] T022 [P] [US3] 實作 `server/src/results/GoogleSheetsWriter.ts`，依 research RD-05、RD-06 與 data-model 第 4 節，依 T003
- [X] T023 [US3] 實作 `server/src/results/WriteBackService.ts` 的寫回步驟 1～8 的成功路徑與 `planCells`、`firstLayoutMismatch`，依 T008、T014、T021
- [X] T024 [US3] 實作 `server/src/results/resultsRoutes.ts`（`preHandler: requireTeacher`），`WriteBackFailure` 依 data-model 第 4 節轉成 `200 WriteBackResult(ok=false)` 或 `401 ErrorBody`；在 002 的 `buildApp` 以 `GoogleSheetsWriter`（`app.googleClients`）、003、004、005 的實例建立 `WriteBackService`，以 `app.register(resultsRoutes, { writeBack })` 註冊，依 T022、T023
- [X] T025 [US3] 在 `frontend/src/services/ServerResultService.ts` 實作 `writeBack`，依 contracts

**Checkpoint**: 寫回的成功路徑可用替身完整跑過

---

## Phase 6: User Story 4 - 寫回失敗時學習單不被改動 (Priority: P1)

**Goal**: 每一種失敗都不寫入任何填空格，並回傳 spec「寫回失敗原因」表的訊息

**Independent Test**: 以替身逐一觸發每種失敗，斷言回傳的 `failureReason` 與呼叫紀錄

### Tests for User Story 4 ⚠️

- [X] T026 [P] [US4] `server/tests/unit/results/WriteBackService.failure.test.ts`：每種情況的 `failureReason` 與 spec「寫回失敗原因」表逐字相同，且沒有呼叫 `writeTexts`（SC-007、REQ-RES-14）：
  - 活動未結束、沒有活動 → `NOT_FINISHED`，不呼叫 `read`（AC-20、REQ-RES-16）
  - `ImportStore.latest()` 為 `null` 或試算表、工作表與活動不同 → `IMPORT_CHANGED`（AC-29、REQ-RES-17）
  - 第 3 題 `blankCell` 改變、題號清單改變、`parse` 回 `ImportError` → `LAYOUT_CHANGED` 並帶正確題號，不呼叫 `duplicateSheet`（AC-21、REQ-RES-12）；`load` 的結果沒有活動使用的工作表 → `SHEET_NOT_FOUND`
  - `load` 回傳 `editable: false` → `NO_EDIT_PERMISSION`，不呼叫 `duplicateSheet`（AC-22）
  - research RD-07 對應表的每一格（`READ`：`TeacherNotSignedInError`、`SheetsReadError` 的 `AUTH_EXPIRED`、`NO_ACCESS`、`UNAVAILABLE`；`BACKUP`／`WRITE`：401／403／404／逾時／500）（AC-23～AC-26）；`duplicateSheet` 失敗時不呼叫 `writeTexts`（REQ-RES-13）
  - 第一個寫回尚未完成時第二個 → `IN_PROGRESS`，`duplicateSheet` 只被呼叫一次；任何失敗後 `inProgress` 恢復為 false，可再寫回（AC-28、REQ-RES-18）
- [X] T027 [P] [US4] 在 `server/tests/integration/results/resultsRoutes.test.ts` 加入：沒有 `Authorization`、憑證錯誤、舊的老師憑證（重新登入後作廢）→ `401 UNAUTHORIZED`，`WriteBackService.writeBack` 沒有被呼叫（AC-27、REQ-RES-15）；並把 `POST /api/results/write-back` 加入 002 `server/tests/integration/requireTeacher.test.ts` 的老師專用路由清單（002 T043）
- [X] T028 [P] [US4] 在 `frontend/tests/unit/ServerResultService.test.ts` 加入：`200` 且 `ok: false` → 原樣回傳；`ApiError` `401 GOOGLE_AUTH_EXPIRED` → `{ ok: false, cellCount: 0, failureReason: message }`；`401 UNAUTHORIZED` → `{ ok: false, cellCount: 0, failureReason: "老師登入已失效，請回首頁重新登入。沒有寫入任何格子。" }`；`NETWORK` 與 500 → 原樣 reject `ApiError`

### Implementation for User Story 4

- [X] T029 [US4] 在 `server/src/results/WriteBackService.ts` 實作 `WriteBackFailure`、`WriteBackErrorCode`、`WriteBackStep`、`mapGoogleError`、步驟 1～5 的檢查與 `inProgress`；每次寫回以 pino 記錄結果代碼與 `cellCount`（不記錄老師憑證與 Google token），依 research RD-07、RD-08
- [X] T030 [US4] 在 `frontend/src/services/ServerResultService.ts` 把兩種 401 的 `ApiError` 轉成 `WriteBackResult`，其他原樣往上丟，依 contracts

**Checkpoint**: 每種寫回失敗都不改動學習單

---

## Phase 7: Polish & Cross-Cutting

- [X] T031 在 `frontend/src/services/createServiceRegistry.ts` 把 `result` 綁定改為 `ServerResultService`（傳入 004 的 `RealtimeClient` 與 002 的 `ApiClient`），並更新 001 的 `ServiceRegistry` 單元測試：`result` 不再是模擬實作，`MockResultService` 只留給測試
- [X] T036 依 T031，讓 001 的 E2E 跟上「沒有任何模擬實作」（001 FR-005、FR-061，比照 005 T041、T043）：`us5-walk.ts` 等的「模擬模式」標示檢查改為確認不顯示；`us5-mock-controls.spec.ts` 每一頁都沒有模擬控制列；`us5-unexpected-error.spec.ts` 拿掉「模擬：非預期錯誤」的案例，保留連不上伺服器的案例；恢復 005 T043 因結果仍是模擬實作而 skip 的 `us3-hosting` 兩個案例、`us4-student` Q7、`us5-screen-flow` 的案例，改由測試伺服器判定與推進；005 `submission.spec.ts` 檢查學生沒收到他組答案時，排除題目結束後 006 公布的本題結果（006 AC-01 公布成功組別的答案）
- [X] T032 `frontend/tests/e2e/results.spec.ts`（Playwright，沿用 005 的多分頁 E2E 環境，Google 以替身取代）：第 2 題結束時老師分頁與第 5 組分頁顯示成功組別與答案、第 5 組分頁顯示本組送出的答案、收到的本組送出判定為「不接受」且沒有其他組的答案，題目進度只含已結束的題目（AC-01、AC-02、AC-10、SC-006）；活動結束後學生全部結果頁顯示每題所有送出與本組搶到的題數（AC-07）、老師結果頁顯示每題所有送出與比第一名慢的秒數（AC-08、AC-30）；T-WriteBack 的說明文字為「這些填空格原本的內容會被覆蓋。」且沒有「備份」（AC-11、REQ-RES-19，依 T035）；寫回成功與失敗的顯示（REQ-RES-20）
- [ ] T033 依 [quickstart.md](quickstart.md) 的 16 個情境做人工驗證，紀錄寫入 `specs/006-results-export/manual-verification.md`（SC-001～SC-004、SC-008、AC-12～AC-17、AC-21～AC-26 的真實 Google 行為）
- [X] T034 圖表一致性驗證：比對程式碼與 `diagrams/006-*.puml` 的組件、類別、方法與呼叫順序，結果寫入 `specs/006-results-export/diagram-verification.md`（原則 I）
- [X] T035 確認 001 `TeacherResultsPage` 的 T-WriteBack 說明文字為「這些填空格原本的內容會被覆蓋。」且沒有「備份」（2026-11-27 決定）；不是時只改這段文字（001 FR-041 規定說明文字依 006 的寫回規則撰寫，不改頁面的欄位、按鈕與切換）（AC-11、REQ-RES-19）

---

## Dependencies & Execution Order

- Phase 1、2 → Phase 3（US1）→ Phase 4（US2）→ Phase 5（US3）→ Phase 6（US4）→ Phase 7。
- US2 依 US1 的 `ResultQuery`；US3 的 `WriteBackService` 依 US2 的 `allResults`；US4 在 US3 的 `WriteBackService` 上加入失敗處理。
- 每個 Phase 內，標 [P] 的測試可同時撰寫；實作依任務中「依 Txxx」的順序。
- T031 放在最後：四個 Story 都完成後才換綁定，避免頁面在中途拿到未完成的 `writeBack`。
- T036 依 T031（換綁後 001 的 E2E 才需要改）；T032 依 T036（同一個 E2E 測試伺服器與 `expectOn`）。

## 需求追溯

| 需求 | 驗收 | 任務 |
| --- | --- | --- |
| REQ-RES-01 | AC-01、AC-03、AC-04 | T004、T005、T008、T009、T010、T032 |
| REQ-RES-02 | AC-05 | T004、T005、T008、T009 |
| REQ-RES-03 | AC-02、AC-06、SC-006 | T004、T005、T008、T032 |
| REQ-RES-04 | AC-07、AC-08、AC-10 | T011、T012、T014、T015、T032 |
| REQ-RES-21 | AC-30 | T011、T014、T032 |
| REQ-RES-05 | AC-09 | T004、T011、T008 |
| REQ-RES-06 | AC-05 | T004、T012、T008、T014 |
| REQ-RES-07 | AC-12、SC-001 | T017、T023、T024、T033 |
| REQ-RES-08 | AC-13 | T016、T017、T021 |
| REQ-RES-09 | AC-14、AC-18 | T017、T023 |
| REQ-RES-10 | AC-15、SC-002、SC-003 | T017、T023、T033 |
| REQ-RES-11 | AC-16 | T018、T022 |
| REQ-RES-12 | AC-21 | T026、T023、T029 |
| REQ-RES-13 | AC-12、AC-17、SC-008 | T016、T017、T026、T021、T022、T033 |
| REQ-RES-14 | AC-25、AC-26、SC-007 | T017、T018、T026、T029 |
| REQ-RES-15 | AC-27 | T027、T024 |
| REQ-RES-16 | AC-20 | T026、T029 |
| REQ-RES-17 | AC-29 | T026、T029 |
| REQ-RES-18 | AC-19、AC-28 | T017、T026、T029 |
| REQ-RES-19 | AC-11 | T035、T032 |
| REQ-RES-20 | AC-12、AC-22 | T017、T020、T025、T028、T030、T032 |

| 成功準則 | 任務 |
| --- | --- |
| SC-001～SC-003 | T033 |
| SC-004 | T033 |
| SC-005 | T006 |
| SC-006 | T011、T032 |
| SC-007 | T026、T033 |
| SC-008 | T017、T033 |

其他驗收（AC-22～AC-24 的真實 Google 行為）：T026（替身）、T033（人工）。

001 的 E2E 跟上換綁（001 FR-005、FR-061）：T036。
