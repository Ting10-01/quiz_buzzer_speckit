---
description: "Task list for 003 搶答結果與匯出"
---

# Tasks: 搶答結果與匯出

**Input**: Design documents from `specs/003-results-export/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；共用骨架見 `specs/001-guided-notes-import/tasks.md` Phase 1、2（T001–T017），Google 授權與讀取見 001 tasks 的 T027、T032–T034

**Tests**: constitution 原則 VIII 要求每個 User Story 至少有一個正常與一個邊界案例的自動化測試；測試先寫、先確認失敗，再實作。自動化測試不需網路與憑證（research R8）。

**Organization**: 依 User Story 分 Phase：US1（P1 檢視結果）、US2（P1 寫回 Google Sheets）、US3（P2 CSV）。

**負責人**：依 `docs/work-split.md`，003 全部由 A 負責。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1、US2、US3）
- `server/` 指 `packages/server/`，`web/` 指 `packages/web/`，`shared/` 指 `packages/shared/`

---

## Phase 1: Setup（003 專屬）

**Purpose**: 共用骨架完成後，003 額外需要的測試工具

- [ ] T001 [P] 建立 `server/tests/helpers/FakeSpreadsheetWriter.ts`：記錄 `duplicateSheet` 與 `writeTexts` 的呼叫，可設定讓任一個呼叫失敗；搭配 001 的 `server/tests/helpers/FakeSheet.ts`
- [ ] T002 [P] 建立 `server/tests/helpers/tmpDataDir.ts`：每個測試使用獨立的暫存 `DATA_DIR`，結束後刪除

---

## Phase 2: Foundational（活動紀錄與結果服務）

**Purpose**: 每題結束存檔、重開還原；三個 User Story 都依賴這些

**⚠️ CRITICAL**: 這個 Phase 完成前不開始 003 的 User Story

- [ ] T003 建立 `server/src/record/types.ts`：`ActivityRecord`（`version: 2`、`activityId`、`questionSet`（含學習單來源與填空格位置）、`groups`、`startedAt`（ISO 8601）、`ended`、`writtenBack`、`csvExported`、`questions`）與 `QuestionRecord`（`questionNumber`、`openedAt`、`closedAt`、`closeReason`、`submissions`（依 `seq`）、`result`），依 `data-model.md` 與 `contracts/record-file.md`
- [ ] T004 [P] `server/tests/unit/record/ActivityRecordStore.test.ts`：`create`、`appendQuestion`、`markEnded`、`markWrittenBack`、`markCsvExported` 都以「寫 `<檔名>.tmp` → `rename`」完成；多次呼叫依呼叫順序完成；`loadLatest` 取 `startedAt` 最新的檔；`version` 不認得（含舊版 `1`）或格式不符的檔略過並記一行警告；檔案內容不含老師憑證、`participantId` 與 Google 授權資料
- [ ] T005 實作 `server/src/record/ActivityRecordStore.ts`：檔名 `<DATA_DIR>/activity-<startedAt>-<activityId>.json`，`DATA_DIR` 預設 `./data`；所有寫入串成一條 Promise 鏈（research R5），依 T003
- [ ] T006 [P] `server/tests/unit/results/ResultsService.persist.test.ts`：`onActivityCreated` 建立紀錄、`onQuestionClosed` 新增該題、`onActivityEnded` 標記結束；`restoreLatest` 把 `QuestionSet` 放回 `QuestionSetStore`；`ended = false` 的紀錄視為中斷，進行中那一題記為未完成（AC-16）
- [ ] T007 把骨架的空實作 `server/src/results/ResultsService.ts` 換成真正的 `onActivityCreated`、`onQuestionClosed`、`onActivityEnded`、`restoreLatest`，並在 `server/src/index.ts` 伺服器啟動時呼叫 `restoreLatest()`，依 T005

**Checkpoint**: 每題結束都存在本機，重開後可還原

---

## Phase 3: User Story 1 - 檢視搶答結果 (Priority: P1) 🎯 MVP

**Goal**: 老師與學生依角色看到結果；活動結束前學生看不到其他組的答案與順位

**Independent Test**: 用 `shared/fixtures/ended-activity-results.json` 建立一場已結束的活動，老師與學生的結果畫面內容與送出紀錄一致

### Tests for User Story 1 ⚠️

- [ ] T008 [P] [US1] `server/tests/unit/results/ResultsService.views.test.ts`：`teacherResults` 依題號排序、每題依順位排序、`winsByGroup` 沒有成功的組別為 0、帶 `writtenBack`／`csvExported`／`restored`（AC-03）；`studentResults` 在活動結束前 `rankings` 為 `[]`、`winners` 只含已結束的題目、進行中的題目不出現（AC-04）；結束後 `rankings` 含所有組別、`isOwnGroup` 標示本組、無人搶答的題目 `winnerGroupName` 為 `null`（AC-01、AC-02）
- [ ] T009 [P] [US1] `server/tests/integration/resultsRoutes.view.test.ts`：`GET /api/results/teacher` 沒有老師憑證回 401、沒有活動也沒有紀錄回 204；`GET /api/results/student` 帶無效的 `X-Participant-Id` 回 `401 NOT_JOINED`
- [ ] T010 [P] [US1] `web/src/pages/student/ResultsPage.test.tsx`：本組成功的題目與本組的順位列醒目標示；無人搶答顯示「無人搶答」；收到 phase `ENDED` 後自動載入完整結果（REQ-EXP-13）

### Implementation for User Story 1

- [ ] T011 [US1] 在 `server/src/results/ResultsService.ts` 實作 `teacherResults()` 與 `studentResults(groupId)`；過濾在伺服器端執行（REQ-EXP-03、research R7）
- [ ] T012 [US1] 實作 `server/src/http/resultsRoutes.ts` 的 `GET /teacher` 與 `GET /student`，依 `contracts/results-http.md`
- [ ] T013 [P] [US1] 建立 `web/src/components/RankingTable.tsx`（每題順位與成功組別）與 `web/src/components/WinsBar.tsx`（各組搶到的題數）
- [ ] T014 [US1] 實作 `web/src/pages/teacher/ResultsPage.tsx` 的結果區（設計稿 T6 左欄），依 T013
- [ ] T015 [US1] 實作 `web/src/pages/student/ResultsPage.tsx`（設計稿 S4），依 T013

**Checkpoint**: 結果畫面可用；每題結束的即時公布（AC-05）由 002 的 `view:student` 負責（002 tasks T038）

---

## Phase 4: User Story 2 - 把答案寫回原本的 Google Sheets 學習單 (Priority: P1)

**Goal**: 檢查版面 → 建立備份工作表 → 一次批次、純文字寫入所有填空格；任一步失敗，學習單工作表不變

**Independent Test**: 以假的 Reader／Writer 跑完整寫回流程；人工驗證時用題組範本副本完成一場活動後寫回（quickstart 情境 5–10）

### Tests for User Story 2 ⚠️

- [ ] T016 [P] [US2] `server/tests/unit/writeback/composeCellText.test.ts`：有成功組別且有標記 → 「（1）CPU」（AC-07）；有成功組別無標記 → 答案；無人搶答 → 只留標記，沒有標記則為空字串（AC-08）；中斷那一輪未完成的題目不產生 `CellText`
- [ ] T017 [P] [US2] `server/tests/unit/writeback/GuidedNotesWriter.test.ts`：版面一致時先 `duplicateSheet` 再 `writeTexts` 一次寫入所有填空格（AC-06、AC-13）；任一題的題號不在原列或題組合併列數不同 → `LAYOUT_CHANGED` 附題號，且沒有呼叫 `duplicateSheet` 與 `writeTexts`（AC-12）；`duplicateSheet` 失敗 → `BACKUP_FAILED` 且沒有呼叫 `writeTexts`（REQ-EXP-15）；備份名稱為「原工作表名-備份-YYYYMMDD-HHmm」，已存在時加「-2」「-3」；回傳的 `writtenCount`、`clearedCount` 正確
- [ ] T018 [P] [US2] `server/tests/unit/spreadsheet/GoogleSheetsWriter.test.ts`：`writeTexts` 用一次 `spreadsheets.values.batchUpdate`、`valueInputOption: 'RAW'`（「=1+1」不會變成公式，AC-11）；A1 範圍的工作表名稱由 `sheetId` 在寫入當下查出並加單引號跳脫（工作表改名也寫回同一張）；`duplicateSheet` 送出 `spreadsheets.batchUpdate` 的 `duplicateSheet` 請求；錯誤對應 401→`AUTH_EXPIRED`、403→`NO_EDIT_PERMISSION`、404→`SHEET_NOT_FOUND`、逾時 15 秒→`NETWORK_ERROR`（AC-14、AC-15）
- [ ] T019 [P] [US2] `server/tests/integration/resultsRoutes.writeback.test.ts`：活動未結束 → `409 ACTIVITY_NOT_ENDED`（AC-10）；沒有活動也沒有紀錄 → `409 NO_RESULTS`；成功時回 `writtenCount`、`clearedCount`、`backupSheetName`、`spreadsheetUrl` 並把紀錄標記為 `writtenBack`；重開還原的紀錄也能寫回（AC-16）；重複寫回兩次，寫入的內容相同（AC-15）
- [ ] T020 [P] [US2] `web/src/components/WriteBackDialog.test.tsx`：確認視窗顯示寫入格數、清除格數與備份名稱；`LAYOUT_CHANGED` 顯示對不上的題號；`AUTH_EXPIRED` 顯示重新連結；成功後顯示備份名稱與開啟試算表的連結

### Implementation for User Story 2

- [ ] T021 [P] [US2] 建立 `server/src/writeback/types.ts`：`CellText`（`cell`、`text`）、`WriteBackError`（`code`、`message`、`questionNumber: number | null`）與 `WriteBackErrorCode`（`ACTIVITY_NOT_ENDED`、`LAYOUT_CHANGED`、`NOT_LINKED`、`AUTH_EXPIRED`、`NO_EDIT_PERMISSION`、`SHEET_NOT_FOUND`、`BACKUP_FAILED`、`NETWORK_ERROR`）；`WriteBackResult` 放在 `shared/src/results.ts`
- [ ] T022 [P] [US2] 在 `server/src/spreadsheet/types.ts` 加入 `SpreadsheetWriter` 介面：`duplicateSheet(spreadsheetId, sheetId, newName): SheetInfo`、`writeTexts(spreadsheetId, cells: CellText[]): void`
- [ ] T023 [US2] 實作 `server/src/spreadsheet/GoogleSheetsWriter.ts`：沿用 001 的 `GoogleAuthService.authorizedClient()`；寫入前用 Drive `files.get`（`capabilities/canEdit`）確認可編輯（research R1、R3），依 T022
- [ ] T024 [US2] 實作 `server/src/writeback/GuidedNotesWriter.ts`：`writeBack(questionSet, results)` 依序 `verifyLayout`（用 001 的 `SpreadsheetReader.open` 重新讀取同一個 `sheetId`）→ `duplicateSheet` → 組出所有 `CellText` → 一次 `writeTexts`（research R2、R3），依 T021、T022
- [ ] T025 [US2] 在 `server/src/results/ResultsService.ts` 加入 `writeBack()`：確認活動已結束或為還原的紀錄，成功後 `markWrittenBack`，依 T024
- [ ] T026 [US2] 在 `server/src/http/resultsRoutes.ts` 加入 `POST /write-back`，錯誤碼與 HTTP 狀態依 `contracts/results-http.md`
- [ ] T027 [P] [US2] 建立 `web/src/components/WriteBackDialog.tsx`（設計稿 T7：寫入格數、清除格數、備份名稱、「建立備份並寫回」）
- [ ] T028 [US2] 在 `web/src/pages/teacher/ResultsPage.tsx` 加入「寫回 Google Sheets」按鈕、寫回預覽區（設計稿 T6 右欄）、確認視窗與成功／失敗訊息，依 T026、T027

**Checkpoint**: 寫回 Google Sheets 可運作，失敗時學習單工作表不變

---

## Phase 5: User Story 3 - 匯出活動結果 CSV (Priority: P2)

**Goal**: 下載 Excel 與 Google Sheets 都能正確開啟的 CSV

**Independent Test**: 用 fixture 匯出 CSV，欄位、筆數、排序與跳脫都正確

### Tests for User Story 3 ⚠️

- [ ] T029 [P] [US3] `server/tests/unit/csv/CsvExporter.test.ts`：開頭為 UTF-8 BOM、換行 CRLF（AC-18）；標題列為「題號,小題,組別,答案,搶答順位,送出時間,是否成功」（AC-17）；一筆題組送出有幾個小題就產生幾列；排序為題號 → 順位 → 小題；含逗號、雙引號、換行的欄位依 RFC 4180 處理；以 `=`、`+`、`-`、`@` 開頭的答案前加 `'`（AC-19）；送出時間為 `YYYY-MM-DD HH:mm:ss.SSS`；是否成功為「是」／「否」；公平模式下成功組別不是順位 1 時仍正確標示；沒有任何送出時只有標題列
- [ ] T030 [P] [US3] `server/tests/integration/resultsRoutes.csv.test.ts`：`GET /api/results/csv` 回 `text/csv; charset=utf-8` 與 `Content-Disposition: attachment; filename*=UTF-8''<試算表名稱-搶答結果.csv>`；活動未結束回 409；成功後紀錄標記為 `csvExported`

### Implementation for User Story 3

- [ ] T031 [US3] 實作 `server/src/csv/CsvExporter.ts`：`export(questionSet, results): string`，`toRows`、`escape` 為私有方法（research R4）
- [ ] T032 [US3] 在 `server/src/results/ResultsService.ts` 加入 `exportCsv(): ExportFile`（檔名「試算表名稱-搶答結果.csv」），成功後 `markCsvExported`，依 T031
- [ ] T033 [US3] 在 `server/src/http/resultsRoutes.ts` 加入 `GET /csv`
- [ ] T034 [US3] 在 `web/src/pages/teacher/ResultsPage.tsx` 加入「匯出 CSV」：以 `fetch` 帶老師憑證取得 Blob，再用 `URL.createObjectURL` 下載

**Checkpoint**: 003 全部 User Story 完成

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] 量測 200 題 fixture 的寫回流程（假 Writer）與 CSV 匯出時間，並在人工驗證時量測真實寫回 ≤ 5 秒、CSV 開始下載 ≤ 3 秒（SC-004），結果記在 `specs/003-results-export/manual-verification.md`
- [ ] T036 依 `quickstart.md` 的 12 個情境進行人工驗證，包含兩份範本與 001 的變形試算表（SC-001、SC-002、SC-003、SC-007、SC-008），結果記到 `specs/003-results-export/manual-verification.md`（原則 VIII）
- [ ] T037 圖表一致性驗證：依 `plan.md` 的「藍圖對照」逐項比對程式，結果寫到 `specs/003-results-export/diagram-verification.md`（原則 I、CLAUDE.md 步驟 7）

---

## Dependencies & Execution Order

### Phase Dependencies

- 共用骨架（001 tasks Phase 1、2）→ 003 Setup（Phase 1）→ Foundational（Phase 2）
- **US1（Phase 3）**：依賴 Phase 2
- **US2（Phase 4）**：依賴 Phase 2；`GoogleSheetsWriter`（T023）依賴 001 的 `GoogleAuthService`（001 T034，負責 B），在那之前用骨架的空實作與 `FakeSpreadsheetWriter` 開發；`verifyLayout` 依賴 001 的 `GoogleSheetsReader`（001 T032）
- **US3（Phase 5）**：依賴 Phase 2，與 US1、US2 互不依賴
- **Polish（Phase 6）**：所有 Story 完成後

### Within Each User Story

- 測試先寫並確認失敗 → 型別 → 服務 → 路由 → 頁面
- 每個任務完成就 commit（測試任務用 `test`，實作任務用 `feat`）

### Parallel Opportunities

- US1、US2、US3 在 Phase 2 完成後可交錯進行（都由 A 負責，依序做也可以）
- 每個 Story 的測試任務可同時寫；T021、T022、T027 可平行

## Parallel Example: User Story 2

```text
T016、T017、T018、T019、T020（同時寫測試）
T021、T022（型別）→ T023、T024 → T025 → T026
T027 → T028
```

## Implementation Strategy

### MVP First

1. 共用骨架 → 003 Phase 1、2
2. US1：結果畫面
3. **停下來驗證**：quickstart 情境 1–3

### Incremental Delivery

US1 → US2（寫回 Google Sheets，核心需求 R5）→ US3（CSV）→ Polish

## 需求追溯（REQ → Tasks）

| 需求 | 任務 |
| --- | --- |
| REQ-EXP-01 老師檢視完整結果 | T008、T011、T014 |
| REQ-EXP-02 學生檢視結果 | T008、T010、T011、T015 |
| REQ-EXP-03 結束前在伺服器端過濾 | T008、T009、T011 |
| REQ-EXP-04 直接寫回原試算表、先確認 | T017、T019、T020、T024、T025、T026、T027、T028 |
| REQ-EXP-05 標記＋答案 | T016、T024 |
| REQ-EXP-06 只寫填空格、不改其他儲存格 | T017、T018、T024 |
| REQ-EXP-07 無人搶答清掉舊答案 | T016、T024 |
| REQ-EXP-08 純文字寫入 | T018、T023 |
| REQ-EXP-09 寫回前檢查版面 | T017、T024 |
| REQ-EXP-10 全有或全無、可重試 | T017、T018、T019、T023 |
| REQ-EXP-11 CSV 格式 | T029、T030、T031、T032、T033、T034 |
| REQ-EXP-12 只有老師、檔名 | T009、T019、T030、T032 |
| REQ-EXP-13 結束時自動出現結果 | T010、T015 |
| REQ-EXP-14 本機紀錄與重開還原 | T004、T005、T006、T007、T019 |
| REQ-EXP-15 寫回前備份工作表 | T017、T018、T023、T024 |
