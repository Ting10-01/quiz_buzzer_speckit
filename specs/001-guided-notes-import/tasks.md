---
description: "Task list for 001 Guided Notes 匯入"
---

# Tasks: Guided Notes 匯入

**Input**: Design documents from `specs/001-guided-notes-import/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: constitution 原則 VIII 要求每個 User Story 至少有一個正常與一個邊界案例的自動化測試，所以每個 Story 都包含測試任務；測試先寫、先確認失敗，再實作。

**Organization**: 依 User Story 分 Phase。Phase 1、2 是三個子功能共用的骨架（docs/work-split.md「第 0 步」），由兩人一起完成；002、003 的 tasks 直接引用，不重複列出。

**負責人**：依 `docs/work-split.md`，Google 授權相關任務標示「負責：B」，其餘 001 任務由 A 負責。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1、US2、US3）
- 路徑以 repo 根目錄為準；`server/` 指 `packages/server/`，`web/` 指 `packages/web/`，`shared/` 指 `packages/shared/`

---

## Phase 1: Setup（共用骨架，兩人一起）

**Purpose**: monorepo 與三個套件的起點

- [ ] T001 建立 npm workspaces：根目錄 `package.json`，workspaces 為 `packages/shared`、`packages/server`、`packages/web`；scripts `dev`（以 `concurrently` 同時啟動 server 與 web）、`build`、`test`、`test:load`（轉呼叫 `-w packages/server`）
- [ ] T002 建立 `tsconfig.base.json`（`strict: true`、`target ES2023`、`moduleResolution bundler`）與三個套件的 `tsconfig.json`；以 project references 讓 `web` 只能引用 `shared`，引用 `server` 時編譯失敗
- [ ] T003 [P] 建立 `shared/package.json` 與 `shared/src/index.ts`（只匯出型別與 fixtures，不含任何伺服器邏輯）
- [ ] T004 [P] 建立 `server/package.json`（Express 5、Socket.IO 4、`google-auth-library`、`@googleapis/sheets`、`@googleapis/drive`、`tsx`、Vitest、supertest）與 `server/vitest.config.ts`
- [ ] T005 [P] 建立 `web/package.json`（React 19、Vite、Tailwind CSS 4、`socket.io-client`、Vitest、React Testing Library、jsdom）、`web/vite.config.ts`（`/api` 與 `/socket.io` proxy 到 `http://localhost:3000`）
- [ ] T006 [P] 更新 `.gitignore`（`node_modules/`、`dist/`、`data/`、`.taste-skill/`；`credentials/` 已存在），新增 `.env.example`，只列 `PORT`、`DATA_DIR`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID` 的名稱，不含任何值
- [ ] T007 [P] 從 `docs/design/` 的 `:root` 變數建立 `web/src/styles/tokens.css`（深色與淺色兩組，`data-theme` 切換），在 `web/src/main.tsx` 引入

---

## Phase 2: Foundational（共用基礎，兩人一起）

**Purpose**: 共用型別、範例資料、交界的空實作與掛載點；完成後兩人可以平行開發

**⚠️ CRITICAL**: 這個 Phase 完成並合併前，不開始任何 User Story

- [ ] T008 依 `contracts/question-set.md` 建立 `shared/src/guided-notes.ts`（`GuidedNotesSource`、`CellRef`、`ColumnMapping`、`AnswerSlot`、`Question`、`QuestionSet`、`QuestionKind`）
- [ ] T009 [P] 依 002 `data-model.md` 與 `contracts/socket-events.md` 建立 `shared/src/activity.ts`、`shared/src/socket-events.ts`；依 003 `data-model.md` 建立 `shared/src/results.ts`
- [ ] T010 [P] 建立 `shared/fixtures/question-set-single.json`（單題範本 6 題）、`question-set-group.json`（題組範本 4 題、2 個題組）、`ended-activity-results.json`（一場已結束活動的 `QuestionResult[]`）；內容依 `docs/templates/` 兩份範本
- [ ] T011 建立 `server/src/index.ts`：建立 Express 與 Socket.IO，掛上 `http/importRoutes.ts`、`http/googleRoutes.ts`、`http/sessionRoutes.ts`、`http/resultsRoutes.ts` 與 `session/SessionGateway.ts` 的空殼；正式環境提供 `web` 的建置檔
- [ ] T012 [P] 建立 `server/src/http/errors.ts`：統一錯誤格式 `{ error: { code, message, cell?, questionNumber? } }` 與對應 HTTP 狀態碼
- [ ] T013 [P] 建立交界的空實作：`server/src/store/QuestionSetStore.ts` 的 `current()` 先回傳 `shared/fixtures` 的範例；`server/src/results/ResultsService.ts` 的 `onActivityCreated`／`onQuestionClosed`／`onActivityEnded` 先不做事；`server/src/google/GoogleAuthService.ts` 先回傳 `UNAVAILABLE`
- [ ] T014 [P] 建立 `server/src/http/requireTeacher.ts`：驗證 `Authorization: Bearer` 老師憑證的 middleware（憑證的發行由 002 tasks 的 T010 完成；骨架先接受測試用憑證）
- [ ] T015 [P] 建立 `web/src/App.tsx` 路由，列出所有頁面的空元件：`pages/HomePage.tsx`、`pages/teacher/{ImportPage,SetupPage,LobbyPage,ConsolePage,ResultsPage,RecoverPage}.tsx`、`pages/student/{JoinPage,AnswerPage,ResultsPage}.tsx`
- [ ] T016 [P] 建立 `web/src/lib/api.ts`：`fetch` 包裝，自動帶該分頁 `sessionStorage` 中的老師憑證（002 research R6），把錯誤格式轉成可顯示的訊息
- [ ] T017 [P] 依 `docs/design/` 的 `Main` 實作 `web/src/pages/HomePage.tsx`（選擇老師或學生）：選老師時呼叫 002 的 `POST /api/teacher/session`，把老師憑證存在該分頁的 `sessionStorage`；已有老師時顯示 002 回傳的 `TEACHER_ACTIVE` 說明，只能以學生加入（002 AC-34）

**Checkpoint**: 骨架合併後，A 與 B 依 `docs/work-split.md` 的檔案歸屬分頭開發

---

## Phase 3: User Story 1 - 從自己的 Google Sheets 匯入單題式學習單 (Priority: P1) 🎯 MVP

**Goal**: 老師連結 Google 帳號、用檔案選擇器挑選試算表、選工作表、預覽並確認匯入單題式學習單

**Independent Test**: 挑選單題範本的副本，預覽出 6 題（題號 1–6），確認後 `GET /api/import/current` 回傳該題目清單

### Tests for User Story 1 ⚠️（先寫、先確認失敗）

- [ ] T018 [P] [US1] 建立 `server/tests/helpers/FakeSheet.ts`：以二維陣列與合併範圍建立假的 `Sheet`，供所有解析測試使用
- [ ] T019 [P] [US1] `server/tests/unit/import/HeaderLocator.test.ts`：找到同時含「題號／編號／題次」與「作答／答案／回答」的第一列；去除前後空白（含全形空白）後完全相等才算；「學生作答」不算；表頭為合併儲存格時取最左欄；「題目／問題／題幹」可有可無
- [ ] T020 [P] [US1] `server/tests/unit/import/QuestionScanner.single.test.ts`：題號接受數字 `1`、`1.0` 與文字 `"1"`；非正整數列略過；單題的 `slotId` 為 `"3"`、`label` 為 `""`；有題目欄時讀出 `questionText`，沒有則為 `null`；作答欄跨欄合併時取左上角
- [ ] T021 [P] [US1] `server/tests/unit/import/GuidedNotesParser.test.ts`：單題範本 → 6 題（AC-01）；表頭移到第 7 列、題號移到 D 欄、題與題之間空兩列仍正確（AC-03）；沒有題目欄照常匯入（AC-04）；T022 的 3 份變形試算表全部正確辨識，不需修改程式（SC-002）
- [ ] T022 [P] [US1] 建立 `server/tests/fixtures/sheets/single.json`、`group.json`（依 Sheets API v4 `spreadsheets.get` 回應格式，內容依兩份範本）與 3 份變形：`variant-shifted.json`（表頭在第 7 列、題號在 D 欄、作答在 I 欄）、`variant-gaps.json`（題與題之間空兩列、表頭上方多一段說明文字）、`variant-synonyms.json`（表頭為「編號／題幹／答案」、題目欄在作答欄右邊）（SC-002），並寫 `server/tests/unit/spreadsheet/GoogleSheet.test.ts`：`merges` 的 GridRange（0 起算、結尾不含）轉成 1 起算的 `RowRange`；`valueAt` 回傳 `effectiveValue` 的數字
- [ ] T023 [P] [US1] `server/tests/unit/google/GoogleAuthService.test.ts`（負責：B）：`state` 一次性、10 分鐘過期、錯誤的 `state` 不保存任何東西（AC-06）；同意後存檔且檔案權限為 0600；`unlink()` 先撤銷再刪檔；`status()` 依情況回 `UNLINKED`／`LINKED`／`EXPIRED`；整個流程的 log 不含 token（SC-006）
- [ ] T024 [P] [US1] `server/tests/integration/googleRoutes.test.ts`（負責：B）：缺少任一 Google 環境變數時 `/status` 回 `UNAVAILABLE`、`/picker-session` 回 `503 GOOGLE_UNAVAILABLE`；`/callback` 同意時 302 到 `/teacher/import?google=linked`，拒絕時到 `?google=denied`；沒有老師憑證回 401
- [ ] T025 [P] [US1] `server/tests/integration/importRoutes.test.ts`：以假的 `SpreadsheetReader` 測 `/sheets`、`/preview`、`/confirm`、`/cancel`、`/current` 的成功流程；沒有老師憑證或使用學生的身分回 401（REQ-IMP-15）；確認後 `/current` 回傳題目清單與來源（AC-02）；活動 phase 不是 `WAITING` 時一律 `409 IMPORT_LOCKED`（REQ-IMP-15）；多個工作表時 `defaultSheetId` 為第一個找得到表頭的工作表（AC-07）
- [ ] T026 [P] [US1] `web/src/pages/teacher/ImportPage.test.tsx`：沒有老師身分的分頁進入匯入頁時導回首頁（REQ-IMP-15）；有老師身分但未連結 Google 時顯示「連結 Google 帳號」（AC-05）；`?google=denied` 時顯示尚未授權（AC-06）；已連結時顯示帳號 email 與「解除連結」

### Implementation for User Story 1

- [ ] T027 [P] [US1] 建立 `server/src/spreadsheet/types.ts`：`SpreadsheetReader`（`info(spreadsheetId)`、`open(spreadsheetId, sheetId)`）、`Sheet`（`id`、`name`、`maxRow`、`maxCol`、`textAt`、`valueAt`、`mergedRangeAt`）、`RowRange`、`SpreadsheetInfo`（`title`、`sheets`、`defaultSheetId`、`canEdit`）、`SheetInfo`
- [ ] T028 [P] [US1] 建立 `server/src/import/types.ts`：`ImportPreview`（`source`、`mapping`、`questionSet`、`warnings`）、`PendingImport`、`ImportWarning`（`code: 'OLD_ANSWER' | 'READ_ONLY'`）、`ImportError`（`code`、`message`、`cell`、`expectedHeaders`）與 `ImportErrorCode`（`NOT_LINKED`、`AUTH_EXPIRED`、`NO_ACCESS`、`NETWORK_ERROR`、`NO_HEADER`、`NO_QUESTIONS`、`INVALID_NUMBERING`、`TOO_MANY_QUESTIONS`）
- [ ] T029 [P] [US1] 實作 `server/src/import/HeaderLocator.ts`（research R5）
- [ ] T030 [US1] 實作 `server/src/import/QuestionScanner.ts` 的單題路徑：逐列讀題號、作答欄、題目欄（research R6、R7），依 T027
- [ ] T031 [US1] 實作 `server/src/import/GuidedNotesParser.ts`：`parse(sheet)` 回傳 `ImportPreview`，找不到表頭時丟出 `NO_HEADER`；`validateNumbering` 檢查不重複、由上到下嚴格遞增、可跳號、1–200 題（REQ-IMP-06），依 T029、T030
- [ ] T032 [US1] 實作 `server/src/spreadsheet/GoogleSheetsReader.ts`：`info` 用 `spreadsheets.get`（`fields=properties.title,sheets.properties(sheetId,title)`）與 Drive `files.get`（`capabilities/canEdit`）；`open` 用 `includeGridData` 並轉成 `GoogleSheet`；每次請求逾時 15 秒；錯誤對應 401→`AUTH_EXPIRED`、403／404→`NO_ACCESS`、逾時→`NETWORK_ERROR`（research R4）
- [ ] T033 [P] [US1] 實作 `server/src/google/TokenStore.ts`（負責：B）：`TokenStore` 介面與 `LocalTokenStore`（`credentials/google-token.json`，權限 0600，`clear()` 刪檔）
- [ ] T034 [US1] 實作 `server/src/google/GoogleAuthService.ts`（負責：B）：`OAuth2Client`，範圍只有 `drive.file` 與 `openid email`，`access_type=offline`、`prompt=consent`；`authUrl`、`handleCallback`（驗證一次性 `state`）、`status`、`unlink`（撤銷後刪檔）、`pickerSession`（`accessToken`、`appId`、`apiKey`）、`authorizedClient`（refresh 失敗時狀態變為 `EXPIRED`）；任何 token 不寫入 log（research R2、R3），依 T033
- [ ] T035 [US1] 實作 `server/src/http/googleRoutes.ts`（負責：B）：`GET /status`、`POST /connect`、`GET /callback`、`POST /unlink`、`GET /picker-session`，依 `contracts/google-auth-http.md`，依 T034
- [ ] T036 [US1] 實作 `server/src/import/ImportService.ts`：`listSheets(spreadsheetId)`、`preview(spreadsheetId, sheetId?)`、`confirm()`、`cancel()`；同一時間最多一份 `PendingImport`；`confirm` 寫入 `QuestionSetStore`，依 T031、T032
- [ ] T037 [US1] 把 `server/src/store/QuestionSetStore.ts` 從範例資料換成真正的 `save(questionSet)`／`current()`（唯讀）
- [ ] T038 [US1] 實作 `server/src/http/importRoutes.ts`：`POST /sheets`、`POST /preview`、`POST /confirm`、`POST /cancel`、`GET /current`，依 `contracts/import-http.md`，套用 `requireTeacher` 與 `IMPORT_LOCKED` 檢查，依 T036
- [ ] T039 [P] [US1] 實作 `web/src/lib/googlePicker.ts`（負責：B）：載入 `https://apis.google.com/js/api.js`，以 `PickerBuilder` 開啟選擇器（`ViewId.SPREADSHEETS`、`setOAuthToken`、`setDeveloperKey`、`setAppId`），回傳 `spreadsheetId` 或 `cancel`
- [ ] T040 [P] [US1] 建立 `web/src/components/GoogleAccountBadge.tsx`（已連結帳號、解除連結）、`web/src/components/SheetPreview.tsx`（試算表格線、表頭與填空格標示）、`web/src/components/QuestionSummary.tsx`（題數、題組數、填空格與題目列表）
- [ ] T041 [US1] 實作 `web/src/pages/teacher/ImportPage.tsx` 的四種狀態：Google 未設定、未連結（設計稿 T0）、已連結並挑選（呼叫 T039）、預覽與工作表選擇（設計稿 T1）；確認後前往設定頁，依 T038、T039、T040

**Checkpoint**: 單題範本可以從 Google 匯入並確認；US1 的測試全部通過

---

## Phase 4: User Story 2 - 匯入含題組的學習單 (Priority: P2)

**Goal**: 依題號儲存格的合併範圍辨識題組與小題

**Independent Test**: 匯入題組範本的副本，預覽「共 4 題，其中 2 個題組」，第 1、2 題各有小題（1）（2）

### Tests for User Story 2 ⚠️

- [ ] T042 [P] [US2] `server/tests/unit/import/QuestionScanner.group.test.ts`：題號跨 2 列合併 → 題組 2 小題（AC-08）；跨 3 列 → 3 小題（AC-10）；填空格的「（1）」「(1)」記為標籤並視為空（AC-09）；單題填空格有「（1）」仍為單題（AC-11）；作答欄被合併進上一列的那一列不算小題；題組 0 個小題時報錯；`slotId` 為 `"1-1"`、`"1-2"`
- [ ] T043 [P] [US2] 在 `server/tests/unit/import/GuidedNotesParser.test.ts` 加入題組範本 fixture（`group.json`）的完整解析測試（SC-001）

### Implementation for User Story 2

- [ ] T044 [US2] 在 `server/src/import/QuestionScanner.ts` 實作題組判斷：題號儲存格位於跨多列的合併範圍內 → `GROUP`，範圍內每一列的作答欄儲存格為一個小題（REQ-IMP-08）
- [ ] T045 [US2] 在 `server/src/import/QuestionScanner.ts` 實作 `splitMarker`：開頭的全形「（n）」或半形「(n)」記為 `marker`；沒有標記的小題依序給予「（1）（2）…」標籤（REQ-IMP-09）
- [ ] T046 [US2] 在 `web/src/components/SheetPreview.tsx`、`QuestionSummary.tsx` 顯示題組（合併的題號格、「題組 · n 小題」標籤）

**Checkpoint**: 單題與題組範本都能正確匯入

---

## Phase 5: User Story 3 - 連線、權限或格式有問題時清楚處理 (Priority: P2)

**Goal**: 每一種失敗都有原因與修正方式；找不到表頭時拒絕匯入並列出可用的表頭寫法；失敗不影響既有題目清單

**Independent Test**: 依 quickstart 情境 7–14，各種錯誤與警告都得到正確處理，既有題目清單不變

### Tests for User Story 3 ⚠️

- [ ] T047 [P] [US3] `server/tests/unit/import/QuestionScanner.warnings.test.ts`：填空格「（2）堆疊」產生 `OLD_ANSWER` 警告並附儲存格（AC-17）；只有空白或底線 `_`、`＿` 不算舊答案
- [ ] T048 [P] [US3] `server/tests/unit/import/GuidedNotesParser.errors.test.ts`：題號重複或沒有遞增 → `INVALID_NUMBERING` 並附題號與列（AC-16）；題號 1、2、4 → 3 題（AC-20）；表頭以下沒有題號 → `NO_QUESTIONS`；201 題 → `TOO_MANY_QUESTIONS`；「編號／答案」自動辨識並回傳 `matchedHeaders`（AC-19）
- [ ] T049 [P] [US3] `server/tests/unit/import/NoHeader.test.ts`：表頭寫「No.／學生填寫」→ `NO_HEADER`，`expectedHeaders` 列出題號欄、作答欄、題目欄各接受的寫法，`message` 說明修正方式；`/preview` 回 `422`，既有題目清單不變（AC-15、REQ-IMP-05）
- [ ] T050 [P] [US3] `server/tests/integration/importRoutes.errors.test.ts`：`canEdit=false` 時預覽附 `READ_ONLY` 警告但仍可確認（AC-13）；Reader 逾時 → `504 NETWORK_ERROR`（AC-14）；授權失效 → `401 AUTH_EXPIRED`；已確認一份題目後，新的預覽失敗或 `cancel` 時 `/current` 不變（AC-18）
- [ ] T051 [P] [US3] `web/src/pages/teacher/ImportPage.errors.test.tsx`：關閉選擇器不改變頁面（AC-12）；`AUTH_EXPIRED` 時顯示重新連結；錯誤卡片顯示原因與修正方式

### Implementation for User Story 3

- [ ] T052 [US3] 在 `server/src/import/QuestionScanner.ts` 實作舊答案判斷與 `OLD_ANSWER` 警告（research R6）
- [ ] T053 [US3] 在 `server/src/import/ImportService.ts` 加入 `READ_ONLY` 警告（`SpreadsheetInfo.canEdit === false`），並在 `server/src/import/GuidedNotesParser.ts` 找不到表頭時丟出附 `expectedHeaders` 的 `NO_HEADER`（`contracts/import-http.md`）
- [ ] T054 [US3] 在 `server/src/import/GuidedNotesParser.ts` 為每種 `ImportErrorCode` 撰寫中文訊息：說明原因、所在列與修正方式（原則 VII）
- [ ] T055 [P] [US3] 建立 `web/src/components/WarningCard.tsx` 與 `web/src/components/ErrorCard.tsx`（設計稿 T1-錯誤：列出可用的表頭寫法與修正方式）
- [ ] T056 [US3] 在 `web/src/pages/teacher/ImportPage.tsx` 接上警告、錯誤（含 `NO_HEADER`）與重新連結流程，依 T053、T055

**Checkpoint**: 001 全部 User Story 完成

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T057 [P] 在 `README.md` 新增「Google 連線設定」：建立 Google Cloud 專案、啟用 Sheets／Drive／Picker API、建立 OAuth 用戶端與限制過的 API 金鑰、加入測試使用者、填寫 `.env`（只寫步驟與變數名稱，不含任何值）
- [ ] T058 [P] 在 `server/tests/integration/noSecrets.test.ts` 掃描 repo 已追蹤的檔案與測試期間的 log，確認沒有 refresh token、用戶端密鑰或 `credentials/` 內容（SC-006）
- [ ] T059 量測 200 題 fixture 從 `/preview` 到回應的時間，確認不含網路時遠低於 5 秒（SC-004）；結果記在 `specs/001-guided-notes-import/manual-verification.md`
- [ ] T060 依 `quickstart.md` 的 17 個情境進行人工驗證，結果記到 `specs/001-guided-notes-import/manual-verification.md`（原則 VIII）
- [ ] T061 圖表一致性驗證：依 `plan.md` 的「藍圖對照」逐項比對程式中的元件、類別、方法與呼叫順序，結果寫到 `specs/001-guided-notes-import/diagram-verification.md`（原則 I、CLAUDE.md 步驟 7）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）** → **Foundational（Phase 2）**：骨架合併前不開始任何 User Story
- **US1（Phase 3）**：依賴 Phase 2；Google 授權（T023、T024、T033–T035、T039，負責 B）與解析（T018–T022、T027–T031，負責 A）可平行，T036 起接上
- **US2（Phase 4）**、**US3（Phase 5）**：依賴 US1 的 `QuestionScanner`、`GuidedNotesParser`、`ImportService`；兩者之間互不依賴
- **Polish（Phase 6）**：所有 Story 完成後

### Within Each User Story

- 測試先寫並確認失敗 → 型別 → 解析／服務 → 路由 → 頁面
- 每個任務完成就 commit（CONTRIBUTING 2.4：測試任務用 `test`，實作任務用 `feat`）

### Parallel Opportunities

- Phase 1：T003–T007 可平行
- Phase 2：T009、T010、T012–T017 可平行
- US1：T018–T026 的測試可同時寫；T027、T028、T029、T033、T039、T040 可平行

## Parallel Example: User Story 1

```text
A：T018、T019、T020、T021、T022 → T027、T028、T029 → T030 → T031 → T032 → T036 → T038
B：T023、T024 → T033 → T034 → T035；T039
A：T040 → T041（接上 B 的 T035、T039）
```

## Implementation Strategy

### MVP First（User Story 1）

1. 完成 Phase 1、2（兩人一起）
2. 完成 US1：可以從 Google 匯入單題式學習單
3. **停下來驗證**：跑 US1 測試與 quickstart 情境 1–3

### Incremental Delivery

1. US1 → 匯入單題
2. US2 → 題組
3. US3 → 錯誤、權限、找不到表頭
4. Polish → README 設定步驟、機密掃描、人工驗證、圖表一致性驗證

## 需求追溯（REQ → Tasks）

| 需求 | 任務 |
| --- | --- |
| REQ-IMP-01 檔案選擇器挑選、直接連線 | T032、T036、T039、T041 |
| REQ-IMP-02 Google 授權、最小範圍、憑證不外洩 | T006、T023、T024、T033、T034、T035、T040、T057、T058 |
| REQ-IMP-03 多個工作表與預設工作表 | T025、T032、T036、T041 |
| REQ-IMP-04 執行期找表頭 | T019、T029 |
| REQ-IMP-05 找不到表頭時報錯 | T049、T053、T054、T055、T056 |
| REQ-IMP-06 題號規則與題數 | T020、T021、T031、T048 |
| REQ-IMP-07 題目敘述可有可無 | T020、T021、T030 |
| REQ-IMP-08 題組 | T042、T044 |
| REQ-IMP-09 小題標記、舊答案、無法寫回警告 | T042、T045、T047、T050、T052、T053 |
| REQ-IMP-10 記錄填空格位置 | T020、T022、T030 |
| REQ-IMP-11 拒絕匯入的錯誤 | T048、T050、T054 |
| REQ-IMP-12 預覽內容 | T025、T040、T041、T046 |
| REQ-IMP-13 保存題目清單與來源 | T025、T036、T037 |
| REQ-IMP-14 失敗不影響既有清單 | T050 |
| REQ-IMP-15 只有老師身分、搶答開始後鎖定 | T014、T017、T025、T026、T038 |
