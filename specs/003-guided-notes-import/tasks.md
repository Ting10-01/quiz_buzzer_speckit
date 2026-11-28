---
description: "Task list for 003 匯入學習單"
---

# Tasks: 匯入學習單

**Input**: Design documents from `specs/003-guided-notes-import/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；001（頁面、介面、實體）與 002（`buildApp`、`app.requireTeacher`、`app.googleClients`、`isGoogleAuthExpired`、`TeacherNotSignedInError`、`ErrorBody`、`GET /api/auth/picker-token`、前端 `ApiClient`；見 `specs/002-teacher-login/contracts/server-extension.md`）已完成

**Tests**: constitution 原則 VIII 要求每個 User Story 至少一個正常與一個邊界案例的自動化測試，所以每個 Story 都有測試任務；測試先寫、先確認失敗，再實作。測試不連網（Google 以 `vi.mock` 或假物件取代）。

**Organization**: 依 User Story 分 Phase。US1、US2 都是 P1，US1 先做（單題是題組的基礎）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1、US2、US3）
- 路徑以 repo 根目錄為準；`gn/` 指 `server/src/guided-notes/`，`gnt/` 指 `server/tests/guided-notes/`

---

## Phase 1: Setup

- [x] T001 確認 `shared/src/entities.ts` 的 `Spreadsheet`、`Question`、`SubQuestion`（只有 `index`、`blankCell`）、`ImportSuccess`、`ImportError` 與 `shared/src/guards.ts` 的 `isImportError` 和 001 data-model 一致；003 不修改這兩個檔案（小題標記只存在伺服器，REQ-IMP-09）
- [X] T002 [P] 在 `server/package.json` 加入 `@googleapis/sheets`、`@googleapis/drive`，執行 `npm install`

---

## Phase 2: Foundational

**Purpose**: 所有 Story 共用的資料結構；完成前不開始任何 Story

- [X] T003 [P] 建立 `gn/SpreadsheetReader.ts`：`SpreadsheetReader` 介面（`load(spreadsheetId): Promise<LoadedSpreadsheet>`）、`LoadedSpreadsheet`（`id`、`title`、`editable`、`sheets: SheetGrid[]`）、`SheetsReadError`（`kind: 'NO_ACCESS' | 'UNAVAILABLE' | 'AUTH_EXPIRED'`）
- [X] T004 [P] 建立 `gn/SheetGrid.ts`：`SheetGrid`（`sheetId`、`name`、`rowCount`、`colCount`、`text(row, col)` 用 `formattedValue`、`number(row, col)` 用 `effectiveValue.numberValue`、`mergeAt(row, col): CellRange | null`）與 `CellRange`；以 `SheetGrid.fromApi(sheet)` 由 `spreadsheets.get` 的一個 `sheets[]` 建立，GridRange（0 起算、結尾不含）轉成「從 1 起算、含結尾」；另提供 `toA1(row, col)` 與 `textA1(a1)`
- [X] T005 [P] 建立 `gn/ImportStore.ts`：`BlankMarkers` 型別、`save(result, markers)` 以 `structuredClone` 一起存入、`latest(): Readonly<ImportSuccess> | null`、`latestMarkers(): BlankMarkers | null`（contracts/import-store.md）
- [X] T006 [P] 建立 `gn/importErrors.ts`：`noHeader`、`noQuestions`、`invalidNumbering`、`tooManyQuestions`、`noBlank`、`noAccess`、`noWorksheet`，`reason` 與 `fixSteps` 依 contracts/guided-notes-http.md 的範例；只有 `noHeader` 的 `foundHeaders`、`acceptedHeaders` 有值，`acceptedHeaders` 為 `["題號欄：題號、編號、題次", "作答欄：作答、答案、回答", "題目欄（可以沒有）：題目、問題、題幹"]`
- [X] T007 [P] 建立 `gnt/helpers/gridBuilder.ts`：以二維字串陣列（數字以 number 表示）與 A1 合併範圍（例如 `"B5:B6"`）產生 `spreadsheets.get` 回應格式的 sheet 物件與 `SheetGrid`
- [X] T008 [P] 撰寫 `gnt/SheetGrid.test.ts`：合併範圍轉換、`number()` 讀數字與文字題號的差別、`toA1`
- [X] T009 [P] 撰寫 `gnt/ImportStore.test.ts`：初始 `latest()`、`latestMarkers()` 都為 `null`；`save` 後兩者取得相同內容；再次 `save` 兩者一起取代；修改存入前的物件不影響 `latest()`、`latestMarkers()`

**Checkpoint**: 基礎型別與測試輔助完成

---

## Phase 3: User Story 1 - 從自己的 Google 試算表匯入單題學習單 (Priority: P1) 🎯 MVP

**Goal**: 挑選 → 讀取 → 解析單題學習單 → 顯示在 T-Import，並存入 `ImportStore`

**Independent Test**: 以單題範本 fixture 與假 `SpreadsheetReader` 走完 `describe`、`read`，`ImportStore.latest()` 為 6 題；人工以真實 Google 試算表走 quickstart #1

### Tests for User Story 1 ⚠️（先寫、先確認失敗）

- [X] T010 [P] [US1] 建立 `gnt/fixtures/single.json`（依 `docs/templates/guided-notes-single.xlsx`：B2:H2 標題、第 4 列表頭「題號」「題目」「作答」、G4:H4 合併、題號 1–6 在 B5、B7…B15，C:F、G:H 合併）與 SC-002 的 3 份變形：`variant-shifted.json`（表頭第 7 列、題號 D 欄、作答 I 欄）、`variant-gaps.json`（表頭上方一段說明、題與題之間空兩列）、`variant-synonyms.json`（表頭「編號」「題幹」「答案」，題目欄在作答欄右邊），以及 `multi-sheet.json`（「說明」沒有表頭、「學習單」為單題範本）
- [X] T011 [P] [US1] 撰寫 `gnt/HeaderLocator.test.ts`：第一個同時有題號欄與作答欄表頭的列；三組同義詞都認得（AC-08）；去除前後空白與全形空白後完全相等才算，「學生作答」不算；表頭合併時取最左欄；題目欄可以沒有；`currentHeaderTexts` 跳過只有 1 個非空白儲存格的標題列
- [X] T012 [P] [US1] 撰寫 `gnt/QuestionScanner.test.ts`（單題）：題號接受數字 1、1.0、文字「1」與全形「１」；0、負數、1.5、文字列略過；作答欄 G5:H5 合併時填空格為 `G5`；單題只有 1 個小題、`index` 為 1；有題目欄時 `text` 為該列文字、沒有題目欄時沒有 `text`（AC-04）
- [X] T013 [US1] 撰寫 `gnt/GuidedNotesParser.test.ts`（成功）：單題範本 → 6 題、填空格 G5、G7…G15、`headerRow` 4、`headerColumns` `["B","C","G"]`（AC-01、REQ-IMP-16）；沒有題目欄時 `headerColumns` 只有兩欄；3 份變形全部正確（AC-03、SC-002）；題號 1、2、4 → 3 題（AC-09）；`questions` 依題號遞增，依 T010
- [X] T014 [P] [US1] 撰寫 `gnt/GoogleSheetsReader.test.ts`（`vi.mock` 取代 `@googleapis/sheets`、`@googleapis/drive`）：`spreadsheets.get` 帶 `includeGridData=true` 與 research R1 的 `fields`；`files.get` 只取 `capabilities/canEdit`；工作表依 `index` 排序；`authorizedClient()` 的結果傳給兩個 API
- [X] T015 [P] [US1] 撰寫 `gnt/GuidedNotesImporter.test.ts`（成功）：`describe` 的 `selectedWorksheet` 是第一個有表頭的工作表、都沒有時為第一個（AC-05）；`describe` 不改變 `ImportStore`；`read` 成功時 `ImportStore.latest()` 等於回傳值、`latestMarkers()` 為同一次的標記（AC-02、AC-12）；讀另一個工作表時取代（AC-06）；`canEdit=false` 時 `editable` 為 false、仍成功（AC-07）
- [X] T016 [P] [US1] 撰寫 `gnt/guidedNotesRoutes.test.ts`（成功）：以 002 的 `buildApp` + Fastify `inject()`、`deps.spreadsheetReader` 注入假 `SpreadsheetReader`、002 的測試用老師憑證，`GET /api/guided-notes/spreadsheets/:id` 回 200 `Spreadsheet`、`POST /api/guided-notes/read` 回 200 `ImportSuccess`；`spreadsheetId` 不符 `^[A-Za-z0-9_-]{10,200}$`、`worksheet` 空字串或超過 100 字、多餘欄位 → `400 BAD_REQUEST`（`ErrorBody` `{ code, message }`）
- [x] T017 [P] [US1] 撰寫 `frontend/tests/unit/HttpGuidedNotesService.test.ts`（成功）：假的 `GooglePickerLauncher` 回傳 id 時呼叫 `GET /api/guided-notes/spreadsheets/:id` 並回傳 `Spreadsheet`；`readWorksheet` 200 時把內容原樣回傳（`ImportSuccess`）；所有請求都經過假的 `ApiClient.request(method, path, body?)`，路徑與 body 符合 contracts/guided-notes-http.md
- [X] T018 [US1] 在 `gnt/GoogleSheetsReader.test.ts` 確認 `load()` 只呼叫 `spreadsheets.get` 與 `files.get`，沒有呼叫任何寫入方法（`batchUpdate`、`values.update` 等）；在 `gnt/GuidedNotesImporter.test.ts` 確認 `describe`、`read` 對假 `SpreadsheetReader` 只呼叫 `load()`（AC-10、REQ-IMP-17）

### Implementation for User Story 1

- [X] T019 [P] [US1] 實作 `gn/HeaderLocator.ts`：`NUMBER_HEADERS`、`ANSWER_HEADERS`、`QUESTION_HEADERS`、`locate(grid)`、`currentHeaderTexts(grid)`（research R3）
- [X] T020 [US1] 實作 `gn/QuestionScanner.ts` 單題路徑：逐列讀題號、跳過合併範圍的非第一列、填空格取合併左上角並轉 A1、題目欄文字（research R4），回傳 `ScannedQuestion[]`
- [X] T021 [US1] 實作 `gn/GuidedNotesParser.ts`：`parse(grid, spreadsheet)` 組出 `ImportSuccess`（`headerRow`、依「題號欄、題目欄（有才列）、作答欄」順序的 `headerColumns`、`questions`），依 T019、T020
- [X] T022 [P] [US1] 實作 `gn/GoogleSheetsReader.ts`：以 `GoogleClientProvider.authorizedClient()` 同時送出 `spreadsheets.get` 與 `files.get`，轉成 `LoadedSpreadsheet`（research R1）
- [X] T023 [US1] 實作 `gn/GuidedNotesImporter.ts`：`describe`（預設工作表，research R6）與 `read`（找工作表 → `parse` → 成功時 `ImportStore.save(result, parser.markersOf(grid, result))`），依 T005、T021
- [X] T024 [US1] 實作 `gn/guidedNotesRoutes.ts`：兩支 API、JSON schema 驗證、掛 `requireTeacher`，回應依 contracts/guided-notes-http.md，依 T023
- [X] T025 [US1] 在 002 的 `server/src/app.ts` `buildApp(config, deps)` 建立一個 `ImportStore` 與 `deps.spreadsheetReader ?? new GoogleSheetsReader(app.googleClients)`，以 `app.decorate` 提供為 `app.importStore`、`app.spreadsheetReader`，再 `app.register(guidedNotesRoutes)`；`deps` 型別加上可省略的 `spreadsheetReader`（research R8、contracts/import-store.md）
- [x] T026 [P] [US1] 實作 `frontend/src/services/google/GooglePickerLauncher.ts`：經 `ApiClient.request('GET', '/api/auth/picker-token')` 取得 `{ accessToken, apiKey, appId }`，動態載入 `https://apis.google.com/js/api.js`、`gapi.load('picker')`，以 `DocsView(ViewId.SPREADSHEETS)` 加 `setMimeTypes('application/vnd.google-apps.spreadsheet')`、`setOAuthToken`、`setDeveloperKey`、`setAppId` 開啟；`picked` 回傳 `docs[0].id`，`cancel` 回傳 `null`；腳本載入失敗或 15 秒內沒載入完成時丟出 `UnexpectedError`「無法載入 Google 檔案選擇器，請確認網路連線」（research R2、AC-25）
- [x] T027 [US1] 實作 `frontend/src/services/http/HttpGuidedNotesService.ts`：以 002 的 `ApiClient.request` 實作 `pickSpreadsheet`、`readWorksheet`（200 的內容原樣回傳；錯誤由 `ApiClient` 以 `ApiError` reject，不另外轉換），依 T026
- [x] T028 [US1] 修改 `frontend/src/services/createServiceRegistry.ts`：`guidedNotes` 綁定 `HttpGuidedNotesService`；`auth` 已是真正的實作時移除 `choicePrompt`；不修改任何頁面或介面

**Checkpoint**: 單題範本可以從真實 Google 試算表匯入，US1 測試全部通過

---

## Phase 4: User Story 2 - 匯入含題組的學習單 (Priority: P1)

**Goal**: 依題號儲存格的合併範圍辨識題組、小題、標記與題組敘述

**Independent Test**: 題組範本 fixture 解析出 4 題、2 個題組，第 1 題小題 G5、G6，標記（1）（2）

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] 建立 `gnt/fixtures/group.json`（依 `docs/templates/guided-notes-group.xlsx`：B5:B6、B8:B9 合併，G5、G6、G8、G9 為「（1）」「（2）」，C5:F5 等合併）
- [X] T030 [P] [US2] 在 `gnt/QuestionScanner.test.ts` 加入題組案例：題號跨 2 列 → `GROUP` 2 小題（AC-11）；跨 3 列 → 3 小題（AC-13）；單題填空格有「（1）」仍為 `SINGLE`（AC-14）；`QuestionScanner.extractMarker` 對「（1）」「(1)」「（1)」原樣回傳，「（2）堆疊」回傳「（2）」，沒有標記時回傳 `""`（AC-12）；題組 `text` 每行為「標記＋題目欄文字」，標記空白時用「（n）」，沒有文字的列不列（AC-15）；題組中作答欄被合併進上一列的那一列不算小題
- [X] T031 [US2] 在 `gnt/GuidedNotesParser.test.ts` 加入題組範本：4 題、2 題組、6 個填空格 G5、G6、G8、G9、G11、G13（AC-11、SC-001）；`markersOf` 回傳 G5、G8→「（1）」，G6、G9→「（2）」，G11、G13→`""`，每個 `blankCell` 恰好一筆；`parse` 回傳的 `SubQuestion` 只有 `index`、`blankCell`（AC-12），依 T029

### Implementation for User Story 2

- [X] T032 [US2] 在 `gn/QuestionScanner.ts` 實作題組判斷：題號儲存格合併範圍跨多列 → `GROUP`，範圍內每列一個候選小題，`index` 依列序（REQ-IMP-08）
- [X] T033 [US2] 在 `gn/QuestionScanner.ts` 實作 `extractMarker`（`^\s*([（(]\s*\d+\s*[)）])`）與題組 `text` 組合，在 `gn/GuidedNotesParser.ts` 實作 `markersOf(grid, result)`（REQ-IMP-07、REQ-IMP-09）

**Checkpoint**: 單題與題組範本都能正確匯入

---

## Phase 5: User Story 3 - 學習單有問題或連線失敗時清楚處理 (Priority: P2)

**Goal**: 7 種 `ImportError` 與非預期錯誤都正確回傳；任何失敗都不改變 `ImportStore`

**Independent Test**: 依序以錯誤 fixture、假 `SpreadsheetReader` 的各種錯誤與假網路失敗測試，`ImportStore.latest()` 都保持前一次的結果

### Tests for User Story 3 ⚠️

- [X] T034 [P] [US3] 在 `gnt/GuidedNotesParser.test.ts` 加入錯誤案例：表頭「No.」「內容」「學生填寫」→ `NO_HEADER`，`foundHeaders` 為這三個文字、`acceptedHeaders` 三條、`fixSteps` 至少一條（AC-17）；表頭以下沒有題號 → `NO_QUESTIONS`（AC-20）；題號重複、題號 3 在 2 上方 → `INVALID_NUMBERING`，`reason` 含兩題的題號與列（AC-19）；以 gridBuilder 產生 201 題 → `TOO_MANY_QUESTIONS`，200 題成功（AC-21）；作答欄被合併進上一題 → `NO_BLANK`，`reason` 含題號與列（AC-22）
- [X] T035 [P] [US3] 撰寫 `gnt/importErrors.test.ts`：7 個函式的 `code` 正確、`reason` 非空、`fixSteps` 至少一條；非 `NO_HEADER` 的 `foundHeaders`、`acceptedHeaders` 為 `[]`（SC-003）
- [X] T036 [P] [US3] 在 `gnt/GoogleSheetsReader.test.ts` 加入錯誤對應：403、404 → `SheetsReadError('NO_ACCESS')`；逾時 15 秒、網路錯誤、5xx → `SheetsReadError('UNAVAILABLE')`（以假計時器驗證逾時）；002 的 `isGoogleAuthExpired(error)` 為 true → `SheetsReadError('AUTH_EXPIRED')`；`authorizedClient()` 丟出的 `TeacherNotSignedInError` 照原樣往上丟
- [X] T037 [P] [US3] 在 `gnt/GuidedNotesImporter.test.ts` 加入：先成功一次，之後每一種 `ImportError`、`SheetsReadError`、`describe` 都不改變 `latest()`（AC-18、SC-005）；`read` 遇到 `NO_ACCESS` → `ImportError` `NO_ACCESS`（AC-23）；工作表名稱不存在 → `NO_WORKSHEET`（AC-24）；`SheetsReadError`（`UNAVAILABLE`、`AUTH_EXPIRED`）與 `TeacherNotSignedInError` 照原樣丟出
- [X] T038 [P] [US3] 在 `gnt/guidedNotesRoutes.test.ts` 加入：`read` 回 `ImportError` 時為 200 且內容完整（含 `foundHeaders`、`fixSteps`）；`describe` 遇到 `NO_ACCESS` 時 `403 NO_ACCESS`；`UNAVAILABLE` 時 `502 GOOGLE_UNAVAILABLE`；`AUTH_EXPIRED` 時 `401 GOOGLE_AUTH_EXPIRED`；`TeacherNotSignedInError` 時 `401 NOT_SIGNED_IN`；錯誤內容都是 `ErrorBody` `{ code, message }`（AC-25）；並把兩支路由加入 002 `server/tests/integration/requireTeacher.test.ts` 的「老師專用路由清單」（002 T043），以沒有憑證、作廢憑證驗證 `401 UNAUTHORIZED`，且假 `SpreadsheetReader.load` 沒有被呼叫（AC-26）
- [x] T039 [P] [US3] 在 `frontend/tests/unit/HttpGuidedNotesService.test.ts` 加入：Picker 取消時回傳 `null` 且沒有呼叫 `ApiClient`（AC-16）；`readWorksheet` 收到 200 的 `ImportError` 時原樣回傳；假 `ApiClient` reject `ApiError` 時（401、403、502、連不上伺服器）原樣往上 reject，`message` 不變（AC-25、AC-26）；Picker reject `UnexpectedError` 時往上 reject

### Implementation for User Story 3

- [X] T040 [US3] 在 `gn/GuidedNotesParser.ts` 接上錯誤：找不到表頭 → `importErrors.noHeader(worksheet, HeaderLocator.currentHeaderTexts(grid))`；0 題、超過 200 題、題號重複或不遞增依 research R5；`gn/QuestionScanner.ts` 一題沒有獨立填空格 → `noBlank`
- [X] T041 [US3] 在 `gn/GoogleSheetsReader.ts` 加入 15 秒逾時與 research R1 的錯誤對應（含以 002 的 `isGoogleAuthExpired` 判斷 `AUTH_EXPIRED`）
- [X] T042 [US3] 在 `gn/GuidedNotesImporter.ts` 加入 `NO_WORKSHEET` 與 `read` 時 `NO_ACCESS` → `ImportError`；其他 `SheetsReadError` 與 `TeacherNotSignedInError` 往上丟；確認所有失敗路徑都不呼叫 `ImportStore.save`
- [X] T043 [US3] 在 `gn/guidedNotesRoutes.ts` 加入錯誤對應，回應為 002 的 `ErrorBody`：`403 NO_ACCESS`（只有 `describe`）、`502 GOOGLE_UNAVAILABLE`、`401 GOOGLE_AUTH_EXPIRED`、`401 NOT_SIGNED_IN`（contracts/guided-notes-http.md）
- [x] T044 [US3] 確認 `frontend/src/services/http/HttpGuidedNotesService.ts` 不攔截 `ApiClient` 的 `ApiError`、`GooglePickerLauncher` 的 `UnexpectedError`，直接往上 reject（research R7）；`GooglePickerLauncher` 的腳本載入逾時與失敗訊息依 research R2

**Checkpoint**: 全部 User Story 完成

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T045 [P] 在 `gn/GuidedNotesImporter.ts` 以 002 的 pino logger 記錄每次讀取的 `spreadsheetId`、工作表、題數或 `code`；在 `gnt/GuidedNotesImporter.test.ts` 確認 log 不含儲存格內容與任何 `Authorization` 值（原則 VI）；不另設 logger（002 的 `loggerOptions`）
- [X] T046 [P] 在 `gnt/GuidedNotesParser.test.ts` 加入 200 題（含題組）的解析在 1 秒內完成，作為 SC-004 伺服器端的下限檢查
- [x] T047 執行 `npm run typecheck`、`npm test -w server -- guided-notes`、`npm test -w frontend -- HttpGuidedNotesService`，回報指令與結果（原則 VIII）
- [x] T048 依 quickstart.md 的 15 個人工情境以真實 Google 試算表驗證（含 SC-004 計時、SC-006 斷網），結果寫入 `specs/003-guided-notes-import/manual-verification.md`
- [x] T049 圖表一致性驗證：依 plan「藍圖對照」逐一比對程式中的組件、類別、方法與 003 三張圖（含時序圖的呼叫順序），結果寫入 `specs/003-guided-notes-import/diagram-verification.md`

---

## Fix: 題組的答案寫在小題標記右邊的格子（#34）

**Goal**: 作答欄那格只有標記、右邊同在作答表頭範圍內有另一格時，填空格是右邊那格，標記記為不在填空格內（REQ-IMP-09、REQ-IMP-10、AC-11、AC-12、AC-12a、AC-12b）

- [X] T050 [P] 測試：`gnt/QuestionScanner.test.ts`、`gnt/GuidedNotesParser.test.ts` 中題組範本的填空格改為 H5、H6、H8、H9（G11、G13 不變），`markersOf` 為 `{ marker: '（1）', inBlankCell: false }` 等；新增以 `gridBuilder` 建的版面：作答表頭只有一欄、標記在填空格內 → 填空格是標記那格、`inBlankCell: true`；右邊那格已有文字 → 仍是右邊那格；標記格還有其他文字 → 是標記那格；右邊那格屬於從上一列開始的合併 → 是標記那格；`HeaderLocator.locate` 回傳作答表頭合併的 `answerLastCol`
- [ ] T051 實作：`HeaderMatch.answerLastCol`；`QuestionScanner.scan` 依 REQ-IMP-10 選右邊那格並在 `ScannedQuestion.markers` 記下 `BlankMarker`；`GuidedNotesParser.markersOf` 改用掃描結果；`BlankMarkers` 的值改為 `BlankMarker`，依 T050 與 data-model、contracts/import-store.md
- [ ] T052 人工驗證 quickstart #2：匯入題組範本，第 1、2 題的填空格為 H5、H6、H8、H9，記到 `manual-verification.md`

---

## 需求追溯

| 需求 | AC | 任務 |
| --- | --- | --- |
| REQ-IMP-01 | AC-01、AC-16 | T017、T026、T027、T039 |
| REQ-IMP-02 | AC-26 | T016、T024、T038 |
| REQ-IMP-03 | AC-05、AC-06 | T010、T014、T015、T023 |
| REQ-IMP-04 | AC-03、AC-08、AC-17 | T011、T013、T019 |
| REQ-IMP-05 | AC-17 | T006、T034、T040 |
| REQ-IMP-06 | AC-01、AC-09、AC-19–21 | T012、T013、T020、T021、T034、T040 |
| REQ-IMP-07 | AC-04、AC-15 | T012、T020、T030、T033 |
| REQ-IMP-08 | AC-11、AC-13、AC-14 | T030、T031、T032 |
| REQ-IMP-09 | AC-12、AC-12a | T001、T005、T009、T023、T030、T031、T033、T050、T051 |
| REQ-IMP-10 | AC-01、AC-11、AC-12b、AC-22 | T004、T012、T020、T034、T040、T050、T051、T052 |
| REQ-IMP-11 | AC-07 | T014、T015、T022 |
| REQ-IMP-12 | AC-19–24 | T006、T034、T035、T037、T040、T042 |
| REQ-IMP-13 | AC-25、AC-26 | T026、T036、T038、T039、T041、T043、T044 |
| REQ-IMP-14 | AC-16、AC-18、AC-25 | T037、T039、T042 |
| REQ-IMP-15 | AC-02、AC-06、AC-18 | T005、T009、T015、T023、T025 |
| REQ-IMP-16 | AC-01、AC-11 | T013、T021 |
| REQ-IMP-17 | AC-10 | T018 |
| SC-001 | — | T013、T031、T048 |
| SC-002 | — | T010、T013、T048 |
| SC-003 | — | T035 |
| SC-004 | — | T046、T048 |
| SC-005 | — | T037、T048 |
| SC-006 | — | T036、T041、T048 |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：T001 必須先確認，否則停下來
- **Foundational（Phase 2）**：依 Setup；完成前不開始任何 Story
- **US1（Phase 3）**：依 Foundational
- **US2（Phase 4）**：依 US1 的 `QuestionScanner`、`GuidedNotesParser`（T020、T021）
- **US3（Phase 5）**：依 US1；可與 US2 平行，但都會修改 `QuestionScanner.ts`、`GuidedNotesParser.ts`，同一時間只由一人修改
- **Polish（Phase 6）**：依所有 Story

### Within Each User Story

- 測試先寫、先確認失敗
- `HeaderLocator`、`QuestionScanner` → `GuidedNotesParser` → `GuidedNotesImporter` → `guidedNotesRoutes` → 002 的 `buildApp` 註冊
- `GooglePickerLauncher` → `HttpGuidedNotesService` → `createServiceRegistry`

### Parallel Opportunities

- Phase 2 的 T003–T009 都可平行
- US1 的測試 T010–T012、T014–T017 可平行（T018 修改 T014、T015 的檔案，排在其後）；T019、T022、T026 可平行
- US3 的測試 T034–T039 可平行

## Parallel Example: User Story 1

```text
Task: "T011 撰寫 server/tests/guided-notes/HeaderLocator.test.ts"
Task: "T012 撰寫 server/tests/guided-notes/QuestionScanner.test.ts"
Task: "T014 撰寫 server/tests/guided-notes/GoogleSheetsReader.test.ts"
Task: "T017 撰寫 frontend/tests/unit/HttpGuidedNotesService.test.ts"
```

## Implementation Strategy

### MVP First

1. Phase 1、2
2. Phase 3（US1）：單題範本可從真實 Google 試算表匯入
3. 停下來驗證 quickstart #1、#3、#4

### Incremental Delivery

1. US1 → 單題範本與變形
2. US2 → 題組範本
3. US3 → 錯誤與連線失敗
4. Polish → 人工驗證與圖表一致性驗證

依 CLAUDE.md，implement 一次只執行一個 Phase，完成後停下並回報測試結果。
