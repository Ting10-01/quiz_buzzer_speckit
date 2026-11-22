---

description: "001 畫面與流程原型的實作任務"
---

# Tasks: 畫面與流程原型

**Input**: `specs/001-ui-prototype/` 的 spec.md、plan.md、research.md、data-model.md、contracts/、quickstart.md

**藍圖**: [`diagrams/001-component.puml`](../../diagrams/001-component.puml)、[`diagrams/001-class.puml`](../../diagrams/001-class.puml)、[`diagrams/001-sequence.puml`](../../diagrams/001-sequence.puml)、[`diagrams/001-screen-flow.puml`](../../diagrams/001-screen-flow.puml)。檔案位置依 plan「Project Structure」與 research RD-10；新增圖中沒有的組件、類別或方法前，先依原則 II 修改 spec 與圖表。

**Tests**: 必做。constitution 原則 VIII 要求每個 User Story 至少一個正常案例與一個邊界案例的自動化測試，並留下人工驗證紀錄。測試先寫，確認失敗後再實作。

**Organization**: 依 spec 的 User Story 分 Phase。模擬實作（M1–M9）是所有頁面的共同依賴，放在 Phase 2；各 Story 的 Phase 只做頁面、共用元件與測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行執行（不同檔案，且不依賴尚未完成的任務）
- **[Story]**: 所屬 User Story（US1–US5）
- 程式碼註解與命名一律使用英文（原則 IX）；UI 文字使用 spec 中的中文原文

## 共通實作規則（每個頁面任務都適用）

- 頁面只透過 `useServiceRegistry()` 取得介面，不得引用 `services/mock/`（原則 III，由 ESLint 強制）。
- 頁面不自行產生或推導結果資料、活動階段（FR-003、原則 V），只呈現介面回傳或推播的快照。
- 介面 Promise 以 `UnexpectedError` reject 時：停留在原頁面、不改變已輸入的內容，在該頁的 `ErrorArea` 顯示 `message`；由確認視窗中的按鈕引起時先關閉視窗。該頁下一次介面呼叫成功或切換頁面時清除（FR-009）。
- 回傳 `ValidationError` 時：停留在原頁面，在 `field` 對應的欄位旁顯示 `message`（FR-008）。
- 訂閱（`onPhaseChange`、`onActivityChange`、`onSubmissionsChange`、`onJudgement`）在元件卸載時呼叫回傳的 `Unsubscribe`。
- 版面參考 `docs/design/dark/` 對應的設計稿，並移除 spec「相對於設計稿的調整」列出的元素（SC-004）。設計稿的 inline style 整理成同名的 `*.module.css`。

## 已解決的文件衝突

產生任務時發現下列衝突，經使用者決定後處理：C-1、C-2（2026-11-21）修改 `contracts/service-interfaces.md`；C-3、C-4（2026-11-22）見表。

| 編號 | 衝突 | 決定 | 影響的任務 |
| --- | --- | --- | --- |
| C-1 | contract 的 `getCurrentActivity()` 列出「T-Lobby 載入時」呼叫；但時序圖第 2 段的 T-Lobby 使用 `createActivity` 回傳的 `Activity`，且 data-model 規定 `getCurrentActivity` 只反映首頁與學生端的 `viewerPhaseIndex` | 修改 contract：T-Lobby 不呼叫 `getCurrentActivity()`，使用 `createActivity`、`updateSettings` 回傳的 `Activity`，之後由 `onActivityChange` 更新 | T059、T065 |
| C-2 | FR-057 要求 S-QuestionDone 顯示題目進度，但 contract 的 `getAllResults()` 呼叫頁面沒有列 S-QuestionDone | 修改 contract：S-QuestionDone 呼叫 `getAllResults()`。學生頁面呼叫結果介面時只取得可公開的內容，公開範圍由 006 決定，在伺服器端過濾；頁面不自行過濾，001 的模擬實作不過濾 | T083、T089 |
| C-3 | data-model 的 `MockSession` 欄位表把 `teacherActivity`、`viewerPhaseIndex` 的寫入者只列為 MockActivityService；但 M4、M6 與時序圖第 3 段要求 MockSubmissionService 在接受時結束老師端的題目、推進學生端的階段 | 修改 data-model：寫入者補上 MockSubmissionService（`judge(ACCEPTED)`、`simulateJudgement(ACCEPTED)`），兩條模擬狀態的說明一併補上 | T113、T114、T124–T126 |
| C-4 | FR-032 規定按鈕是否可用依送出介面回傳的結果呈現，但 `Submission` 沒有「可判定」欄位 | 不改類別圖：依修訂後的 FR-032（spec commit `spec(001): align ui flow with feature split`），`SubmissionTable` 只讓 `rank` 最小的 `PENDING` 列可按；規則已由 feature-split 3.2 定案，變更須先改 spec（原則 II），不屬於 005 的擴充點 | T068、T073 |

---

## Phase 1: Setup（專案初始化）

**Purpose**: 建立 npm workspaces、前端工具鏈與樣式基礎。完成後 `npm run typecheck`、`npm run lint`、`npm test` 可在空專案上執行。

- [X] T001 建立 repo 根目錄 `package.json`（`"private": true`、`"workspaces": ["shared", "frontend"]`，scripts：`dev`、`typecheck`、`lint`、`test`、`test:e2e` 轉呼叫 `frontend` workspace，`typecheck` 同時檢查 `shared`）與 `.nvmrc`（內容 `24`）
- [X] T002 [P] 建立 `shared/package.json`（名稱 `@quiz-buzzer/shared`，`exports` 指向 `src/`）與 `shared/tsconfig.json`（TypeScript 5，`strict: true`）
- [X] T003 建立 `frontend/package.json` 與 `frontend/tsconfig.json`（`strict: true`，相依 `@quiz-buzzer/shared`）；dependencies：`react`、`react-dom`、`@fontsource/inter`、`@fontsource/noto-sans-tc`；devDependencies：`vite`、`@vitejs/plugin-react`、`typescript`、`vitest`、`jsdom`、`@testing-library/react`、`@testing-library/user-event`、`@testing-library/jest-dom`、`@playwright/test`、`eslint`、`typescript-eslint`、`eslint-plugin-react-hooks`。不加入路由或狀態管理套件（research RD-11、原則 XI）
- [X] T004 建立 `frontend/vite.config.ts`：React plugin；Vitest 設定 `environment: 'jsdom'`、`include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx']`、`setupFiles: ['tests/setup.ts']`
- [X] T005 [P] 建立 `frontend/tests/setup.ts`，載入 `@testing-library/jest-dom/vitest`
- [X] T006 [P] 建立 `frontend/playwright.config.ts`：`testDir: 'tests/e2e'`、只用 Chromium、`webServer` 執行 `npm run dev` 並等待 Vite 網址
- [X] T007 [P] 建立 `frontend/eslint.config.js`：typescript-eslint 建議規則、react-hooks 規則；對 `src/**` 設定 `no-restricted-imports` 禁止引用 `**/services/mock/**`，只有 `src/services/createServiceRegistry.ts` 例外（原則 III）
- [X] T008 [P] 建立 `frontend/index.html`（`lang="zh-Hant"`，掛載點 `#root`；不得引用 Google Fonts 或其他外部字型網址，字型由 T035 從本機套件載入，research「字型」、原則 VIII）
- [X] T009 [P] 建立 `frontend/src/styles/tokens.css`：把 `docs/design/dark/*.html` 中 `:root` 的深色主題 CSS 變數原樣搬入；不得加入 `data-theme`、`prefers-color-scheme` 或淺色變數（research RD-09）。建立 `frontend/src/styles/global.css`：body 背景與字型（`Inter, "Noto Sans TC", system-ui`）
- [ ] T010 [P] 建立 `specs/001-ui-prototype/manual-verification.md` 樣板：表格欄位為「日期、驗證者、情境（quickstart Q1–Q12）、耗時、結果、問題」；「耗時」供 SC-005（10 秒內）與 SC-006（5 分鐘內）判定
- [ ] T011 執行 `npm install`，確認 `npm run typecheck`、`npm run lint` 沒有錯誤

**Checkpoint**: 工具鏈可用。

---

## Phase 2: Foundational（所有 Story 的共同依賴）

**Purpose**: 實體、介面、ServiceRegistry、全部模擬實作（M1–M9）、AppRouter 骨架與跨頁共用元件（AppHeader、ErrorArea、ConfirmDialog、MockModeBadge、MockControlBar）。

**⚠️ CRITICAL**: 本 Phase 完成前不得開始任何 User Story。

### 型別與介面

- [ ] T012 [P] 在 `shared/src/entities.ts` 依 data-model 第 1 節定義所有實體，欄位名稱與型別逐字照抄：`Role`（`TEACHER`、`STUDENT`）、`TeacherAccount`（`name: string`、`email: string`）、`SignInFailure`（`CANCELLED`、`NOT_TEACHER`）、`SignInResult`（`ok: boolean`、`account?: TeacherAccount`、`failure?: SignInFailure`）、`Spreadsheet`（`id: string`、`title: string`、`editable: boolean`、`worksheets: string[]`、`selectedWorksheet: string`）、`QuestionType`（`SINGLE`、`GROUP`）、`Question`（`number: number`、`type: QuestionType`、`text?: string`、`subQuestions: SubQuestion[]`）、`SubQuestion`（`index: number`、`blankCell: string`）、`ImportSuccess`（`spreadsheet`、`headerRow: number`、`headerColumns: string[]`、`questions: Question[]`）、`ImportError`（`code: string`、`reason: string`、`foundHeaders: string[]`、`acceptedHeaders: string[]`、`fixSteps: string[]`）、`ActivityPhase`（`NO_ACTIVITY`、`PREPARING`、`OPEN`、`QUESTION_ENDED`、`FINISHED`）、`ActivitySettings`（只有 `groupCount: number`，不得有名稱欄位，FR-023）、`Activity`（`groupCount: number`、`phase: ActivityPhase`、`currentQuestion?: number`、`spreadsheet`、`questions`、`groups: Group[]`，不得有名稱欄位）、`Group`（`number: number`、`memberCount: number`）、`Judgement`（`PENDING`、`ACCEPTED`、`REJECTED`、`UNJUDGED`）、`Submission`（`questionNumber`、`groupNumber`、`answers: string[]`、`rank`、`elapsedMs`、`judgement`）、`QuestionResult`（`questionNumber`、`winner?: Submission`、`submissionCount: number`、`submissions: Submission[]`、`behindFirstMs: number[]`，與 `submissions` 同順序）、`WriteBackResult`（`ok: boolean`、`cellCount: number`、`failureReason?: string`）、`ValidationError`（`field: string`、`message: string`）、`UnexpectedError`（`message: string`）。enum 以 `as const` 物件加同名型別實作；實體不帶驗證規則（data-model「規則與說明」）
- [ ] T013 [P] 在 `shared/src/guards.ts` 實作型別判斷函式 `isValidationError`、`isImportError`、`isImportSuccess`、`isUnexpectedError`，並在 `frontend/tests/unit/guards.test.ts` 測試每個函式對正反兩種輸入的結果
- [ ] T014 在 `frontend/src/services/interfaces.ts` 依類別圖 Service Interfaces 宣告 `Unsubscribe`（`() => void`）、`AuthService`、`GuidedNotesService`、`ActivityService`（9 個方法，`leaveGroup()` 不帶參數）、`SubmissionService`（`submitAnswer(questionNumber, answers)` 不帶組別；`onJudgement(listener)` 不帶組別）、`ResultService`，以及 mock only 的 `PhaseMockControl`、`JudgementMockControl`、`ValidationMockControl`、`UnexpectedErrorMockControl`、`MockChoicePrompt`、`ChoiceRequest`（`title: string`、`options: ChoiceOption[]`）、`ChoiceOption`（`id: string`、`label: string`）。簽章逐字依 `diagrams/001-class.puml`
- [ ] T015 在 `frontend/src/services/ServiceRegistry.ts` 定義 `ServiceRegistry` 型別：`auth`、`guidedNotes`、`activity`、`submission`、`result` 必有；`phaseControl?`、`judgementControl?`、`activityValidationControl?`、`submissionValidationControl?`、`unexpectedErrorControl?`、`choicePrompt?`；`isMockMode(): boolean`（data-model 第 2 節）
- [ ] T016 [P] 在 `frontend/src/services/ServiceRegistryContext.tsx` 建立 React context、`ServiceRegistryProvider` 與 `useServiceRegistry()`（沒有 provider 時丟出錯誤）

### 模擬實作的測試（先寫，確認失敗）

- [ ] T017 [P] `frontend/tests/unit/MockSession.test.ts`：`requestChoice` 經 `onRequest` 通知 `ChoiceRequest`，`answer(id)` 讓 Promise 以 id 完成、`answer(null)` 以 `null` 完成；`onRequest` 回傳的 `Unsubscribe` 生效；`failNextCall()` 後 `consumeUnexpectedError()` 第一次回傳 true、第二次 false（邊界）
- [ ] T018 [P] `frontend/tests/unit/MockAuthService.test.ts`（M1、M9）：選「模擬老師帳號」回傳 `ok: true` 與 `MockFixtures.teacherAccount`；「模擬非老師帳號」回傳 `failure: NOT_TEACHER`；「取消」回傳 `failure: CANCELLED`；成功後 `getCurrentAccount()` 回傳該帳號、之前回傳 `null`；`failNextCall()` 後 `signInWithGoogle()` 以「模擬：連不上伺服器」reject 且不發出選擇請求，下一次恢復正常
- [ ] T019 [P] `frontend/tests/unit/MockGuidedNotesService.test.ts`（M2）：選擇器列出三份學習單；選「題組＋單題範本」後 `readWorksheet` 回傳 4 題（2 題 `GROUP`）、6 個填空格、`editable: true`，並寫入 `MockSession.lastImport`；「單題範本」回傳 6 題 `SINGLE`、6 個填空格、`editable: false`；「表頭錯誤範例」第一次回傳 `ImportError`，對同一份再呼叫 `readWorksheet` 回傳「題組＋單題範本」的辨識結果；關閉選擇器回傳 `null`（邊界）
- [ ] T020 [P] `frontend/tests/unit/MockActivityService.test.ts`（M3、M7）：`createActivity`、`updateSettings` 回傳 `PREPARING` 且 `groupCount` 等於輸入、各組人數取自 `MockFixtures.groupMembers`（至少一組 0 人）、題目取自 `lastImport`（沒有時取 `MockFixtures.activity`）；`failNextValidation()` 後下一次回傳 `ValidationError`（`field: 'groupCount'`、`message: '模擬：驗證失敗'`），再下一次成功；`openQuestion(n)` → `OPEN`、`currentQuestion: n`；`endQuestion(n)` 非最後一題 → `QUESTION_ENDED`、最後一題 → `FINISHED`；`getCurrentActivity()` 初始為 `null`，`advancePhase()` 依 M7 序列 `NO_ACTIVITY → PREPARING → OPEN(1) → QUESTION_ENDED(1) → … → QUESTION_ENDED(4) → FINISHED` 前進並通知 `onPhaseChange` 的 listener；`FINISHED` 後再推進不變（邊界）；`joinGroup(n)` 設定 `MockSession.joinedGroup`、`leaveGroup()` 清除；`onActivityChange` 接受訂閱但不通知
- [ ] T021 [P] `frontend/tests/unit/MockSubmissionService.test.ts`（M4、M5、M6）：`listSubmissions(q)` 非最後一題回傳 ≥ 2 筆、依 `rank` 排序、全部 `PENDING`，最後一題回傳空陣列（邊界）；`judge(q, group, ACCEPTED/REJECTED)` 更新該筆並回傳整個列表，且任何 `PENDING` 都可判定；`submitAnswer(q, answers)` 以 `joinedGroup` 建立 `PENDING` 的 `Submission`；`failNextValidation()` 後下一次回傳 `ValidationError`（`field: 'answers.0'`、`message: '模擬：驗證失敗'`）；`simulateJudgement(ACCEPTED/REJECTED)` 更新 `joinedGroup` 最近一筆送出並通知 `onJudgement`；被拒絕後再 `submitAnswer` 產生新的一筆 `PENDING`；`onSubmissionsChange` 接受訂閱但不通知
- [ ] T022 [P] `frontend/tests/unit/MockResultService.test.ts`（M8）：`lastImport` 為「題組＋單題範本」時 `writeBack()` 回傳 `ok: true` 與 `cellCount: 6`；為「單題範本」時回傳 `ok: false`、`failureReason: '沒有編輯權限，無法寫回'`（邊界）；`getQuestionResult(q)` 的 `winner` 為該題第一筆 `ACCEPTED`、沒有時為 `undefined`，`submissionCount` 等於送出數；`behindFirstMs` 與 `submissions` 同順序，為各筆 `elapsedMs` 減去 `rank` 1 的 `elapsedMs`（第一名為 0；D23 由 006 決定，001 以最早送出為基準），沒有送出時為空陣列（邊界）；`getAllResults()` 依題號回傳每題結果
- [ ] T023 [P] `frontend/tests/unit/createServiceRegistry.test.ts`：預設綁定時 `isMockMode()` 為 true，六個模擬控制欄位都存在，且 `unexpectedErrorControl`、`choicePrompt` 是同一個 `MockSession`；同一次呼叫建立的模擬服務共用同一個 `MockSession`，兩次呼叫互不影響（每個分頁一份）

### 模擬實作

- [ ] T024 在 `frontend/src/services/mock/MockFixtures.ts` 定義 data-model 第 3 節的固定資料：`teacherAccount`、`spreadsheets`（id 與標題：「題組＋單題範本」可編輯、「單題範本」僅檢視、「表頭錯誤範例」）、`importResults`（內容沿用 `docs/design/dark/T-Import.html`、`T-ImportError.html`）、`activity`（4 題、6 組，學習單標題「計算機概論基礎 學習單」）、`groupMembers`（6 組，至少一組 0 人）、`submissionsByQuestion`（內容沿用 `docs/design/dark/T-Live.html`；第 1–3 題各 ≥ 2 筆、第 4 題 0 筆）。另匯出選擇器選項 id 常數。檔頭註解說明這是展示資料，不是預設值
- [ ] T025 在 `frontend/src/services/mock/MockSession.ts` 實作 `MockSession`（`implements MockChoicePrompt, UnexpectedErrorMockControl`）：欄位 `lastImport`、`teacherActivity`、`joinedGroup`、`viewerPhaseIndex`（初始 0）、`submissions`、`pendingValidationFailure`（`{ activity: boolean; submission: boolean }`）、`pendingUnexpectedError`；方法 `requestChoice`、`onRequest`、`answer`、`failNextCall`，以及供模擬服務使用的 `consumeUnexpectedError()`（讀取並清除，為 true 時呼叫者以 `{ message: '模擬：連不上伺服器' }` reject）（依賴 T024）
- [ ] T026 [P] 在 `frontend/src/services/mock/MockAuthService.ts` 實作 M1（依賴 T025）。`signInWithGoogle()` 先 `consumeUnexpectedError()`，再 `requestChoice({ title: '模擬帳號選擇', options: [模擬老師帳號, 模擬非老師帳號, 取消] })`
- [ ] T027 [P] 在 `frontend/src/services/mock/MockGuidedNotesService.ts` 實作 M2（依賴 T025）。`pickSpreadsheet()` 以 `requestChoice` 顯示「模擬檔案選擇器」；`readWorksheet` 依 spreadsheetId 回傳 `importResults`，成功時寫入 `lastImport`；「表頭錯誤範例」被讀過一次後再讀，回傳「題組＋單題範本」的結果
- [ ] T028 [P] 在 `frontend/src/services/mock/MockActivityService.ts` 實作 `ActivityService`、`PhaseMockControl`、`ValidationMockControl`（M3、M7；依賴 T025）。老師端狀態寫在 `teacherActivity`；首頁與學生端只依 `viewerPhaseIndex` 由 `MockFixtures.activity` 組出 `Activity`；`advancePhase()` 通知所有 `onPhaseChange` listener。除訂閱與模擬控制外，每個方法開頭呼叫 `consumeUnexpectedError()`
- [ ] T029 [P] 在 `frontend/src/services/mock/MockSubmissionService.ts` 實作 `SubmissionService`、`JudgementMockControl`、`ValidationMockControl`（M4、M5、M6；依賴 T025）。老師端列表由 `submissionsByQuestion` 初始化後存入 `MockSession.submissions`；學生端送出以 `joinedGroup` 為組別，`rank` 為本分頁該題已記錄送出數 + 1；不提供學生取得其他組別送出的方法（FR-054）
- [ ] T030 [P] 在 `frontend/src/services/mock/MockResultService.ts` 實作 M8（依賴 T025），由 `MockSession.submissions` 與 `teacherActivity`（沒有時用 `MockFixtures.activity`）組出 `QuestionResult`，並以最早送出（`rank` 1）的 `elapsedMs` 為基準計算 `behindFirstMs`（spec M4、D23）
- [ ] T031 在 `frontend/src/services/createServiceRegistry.ts` 實作組合根 `createServiceRegistry()`：建立一份 `MockSession` 與五個模擬服務，填入 `ServiceRegistry` 的所有欄位；記錄哪些介面綁定模擬實作，`isMockMode()` 依此回傳（plan「替換模擬實作的方式」）。這是唯一允許引用 `services/mock/` 的檔案（依賴 T026–T030）
- [ ] T032 執行 `npm test`，確認 T017–T023 全部通過

### 測試替身與 App 骨架

- [ ] T033 [P] 建立 `frontend/tests/helpers/createFakeRegistry.ts`：回傳所有方法為 `vi.fn()` 的 `ServiceRegistry`，可覆寫個別方法與模擬控制、可設定 `isMockMode`；另提供 `renderWithRegistry(ui, registry)` 包上 `ServiceRegistryProvider`
- [ ] T034 在 `frontend/src/app/AppRouter.tsx` 建立頁面切換骨架：以 React state 保存 `PageState`（discriminated union，一次列出 spec 頁面清單的 16 個頁面 id 與各自需要的參數，例如 `T-Import` 帶 `ImportSuccess`、`T-ImportError` 帶 `Spreadsheet` 與 `ImportError`、`T-Setup` 帶 `mode: 'create' | 'edit'`），不使用 URL 路由，重新整理一律回到 `Main`（RD-11）；提供 `navigate(page)` 給頁面；學生頁面（`S-*`）外層套上 390 px 寬、水平置中的欄位；畫面固定位置渲染 `MockModeBadge` 並傳入目前頁面 id。尚未實作的頁面在各 Story 加入 switch
- [ ] T035 在 `frontend/src/main.tsx` 建立 registry（`createServiceRegistry()`）、包上 `ServiceRegistryProvider`、渲染 `AppRouter`，並載入 `tokens.css`、`global.css` 與 `@fontsource/inter`、`@fontsource/noto-sans-tc`（只載入頁面用到的字重）

### 共用元件（先寫測試）

- [ ] T036 [P] `frontend/tests/component/sharedComponents.test.tsx`：`AppHeader` 老師版有「搶答板」且點擊呼叫 `onHome`，學生版沒有回首頁連結並顯示組別（FR-007）；`ErrorArea` 有訊息時顯示、沒有時不佔內容；`ConfirmDialog` 顯示標題、內容與按鈕，點按鈕呼叫對應 callback
- [ ] T037 [P] `frontend/tests/component/MockControlBar.test.tsx`：依 FR-061 驗證每個頁面 id 出現的控制——「模擬：推進到下一個階段」只在 Main、S-Join、S-Wait、S-Answer、S-Submitted、S-QuestionDone；「模擬：接受」「模擬：不接受」只在 S-Submitted 的等待判定狀態；「模擬：驗證失敗」只在 T-Setup（呼叫 `activityValidationControl`）與 S-Answer（呼叫 `submissionValidationControl`）；「模擬：非預期錯誤」只在 T-Login、T-Pick、T-Import、T-ImportError、T-Setup、T-Lobby、T-Live、T-QuestionEnd、T-Results、S-Join、S-Wait、S-Answer；對應控制欄位為 `undefined` 時不顯示（邊界）；`choicePrompt` 發出請求時以 `ConfirmDialog` 列出選項，點選項呼叫 `answer(id)`，關閉呼叫 `answer(null)`。`MockModeBadge`：`isMockMode()` 為 true 時顯示「模擬模式」，為 false 時標示與控制列都不渲染（FR-005、SC-003）
- [ ] T038 [P] 在 `frontend/src/components/AppHeader.tsx`（與 `AppHeader.module.css`）實作頁首：`variant: 'teacher' | 'student'`；老師版左側「搶答板」呼叫 `onHome`（只切換頁面，不呼叫介面）並可顯示帳號；學生版顯示組別、不提供回首頁連結
- [ ] T039 [P] 在 `frontend/src/components/ErrorArea.tsx`（與 `.module.css`）實作共通錯誤訊息區：prop `message?: string`，`role="alert"`
- [ ] T040 [P] 在 `frontend/src/components/ConfirmDialog.tsx`（與 `.module.css`）實作確認視窗：`open`、`title`、`children`、`actions: { label, onClick, variant? }[]`、`onClose`
- [ ] T041 在 `frontend/src/components/MockControlBar.tsx`（與 `.module.css`）實作模擬控制列：prop `page`（頁面 id）與 `awaitingJudgement: boolean`；從 `useServiceRegistry()` 讀取模擬控制，依 contracts/mock-controls.md 的表格只顯示目前頁面可用且存在的控制；訂閱 `choicePrompt.onRequest`，以 `ConfirmDialog` 顯示模擬帳號選擇與模擬檔案選擇器（依賴 T040）
- [ ] T042 在 `frontend/src/components/MockModeBadge.tsx`（與 `.module.css`）實作「模擬模式」標示：`isMockMode()` 為 false 時回傳 `null`；為 true 時固定位置顯示標示，旁邊渲染 `MockControlBar`（依賴 T041）
- [ ] T043 執行 `npm test`、`npm run typecheck`、`npm run lint`，確認 T036、T037 通過

**Checkpoint**: 模擬實作與共用元件完成，各 Story 可開始。

---

## Phase 3: User Story 1 - 選擇身分進入對應入口 (Priority: P1) 🎯 MVP

**Goal**: Main、T-Login、T-Pick（顯示帳號與取消）、S-Join（顯示組別或「目前沒有活動」）。涵蓋 R1、FR-007、FR-010–FR-013、FR-020、FR-050（顯示部分）。

**Independent Test**: 從首頁分別進入選組頁與登入頁；登入頁兩種模擬帳號選擇分別成功進入挑選學習單頁、或停留並顯示「已取消登入」（quickstart Q1、Q2）。

### Tests for User Story 1

- [ ] T044 [P] [US1] `frontend/tests/component/HomePage.test.tsx`：點「我是老師」→ `T-Login`、「我是學生」→ `S-Join`，兩者都不呼叫任何介面方法（US1 AC-1、AC-2）；`getCurrentActivity()` 回傳 `null` 時顯示「目前沒有活動」，回傳活動時顯示階段、題數、組數且不出現活動名稱（FR-010）；`onPhaseChange` 通知後更新顯示（H2）
- [ ] T045 [P] [US1] `frontend/tests/component/TeacherLoginPage.test.tsx`：頁面只有「用 Google 登入」一個登入選項（FR-012）；`ok: true` → `T-Pick`；`CANCELLED` 顯示「已取消登入」、`NOT_TEACHER` 顯示「此帳號不是老師帳號」並停留（邊界，US1 AC-4、AC-5）；reject `UnexpectedError` 時 `ErrorArea` 顯示訊息且不切換，下一次成功時清除（FR-009）
- [ ] T046 [P] [US1] `frontend/tests/component/PickPage.test.tsx`（顯示部分）：載入時呼叫 `getCurrentAccount()` 並顯示名稱與電子郵件（FR-020、US1 AC-3）；「取消」→ `Main` 且不呼叫介面
- [ ] T047 [P] [US1] `frontend/tests/component/JoinPage.test.tsx`（顯示部分）：`null` 時顯示「目前沒有活動，請等老師建立活動」且不列出組別（FR-050，邊界）；有活動時依 `groupCount` 列出各組與已加入人數；`onPhaseChange` 通知 `PREPARING` 後從沒有活動切換為列出組別（S3）
- [ ] T048 [P] [US1] `frontend/tests/e2e/us1-entry.spec.ts`：以 Playwright 走 quickstart Q1、Q2（含模擬帳號選擇的三個選項），每頁都看得到「模擬模式」

### Implementation for User Story 1

- [ ] T049 [P] [US1] 在 `frontend/src/components/GroupGrid.tsx`（與 `.module.css`）實作組別格：props `groups: Group[]`、`selected?: number`、`onSelect?: (n) => void`；顯示「第 n 組」與已加入人數；沒有 `onSelect` 時只顯示
- [ ] T050 [P] [US1] 在 `frontend/src/pages/HomePage.tsx`（與 `.module.css`）實作 Main：「我是老師」「我是學生」兩個選項；載入時 `getCurrentActivity()`，並訂閱 `onPhaseChange` 更新活動資訊（階段、題數、組數）；不顯示活動名稱與設計稿中的規則說明文字、限時（SC-004）
- [ ] T051 [P] [US1] 在 `frontend/src/pages/teacher/TeacherLoginPage.tsx`（與 `.module.css`）實作 T-Login：老師版 `AppHeader`、只有「用 Google 登入」、登入失敗訊息區（依 `SignInFailure` 顯示「已取消登入」或「此帳號不是老師帳號」）、`ErrorArea`
- [ ] T052 [P] [US1] 在 `frontend/src/pages/teacher/PickPage.tsx`（與 `.module.css`）實作 T-Pick 版面：載入時 `getCurrentAccount()` 顯示帳號；「從 Google 雲端硬碟挑選」按鈕（行為於 T062 完成）、「取消」→ `Main`；`ErrorArea`；不出現「連結 Google 帳號」「解除連結」（SC-004）
- [ ] T053 [P] [US1] 在 `frontend/src/pages/student/JoinPage.tsx`（與 `.module.css`）實作 S-Join 顯示：學生版 `AppHeader`（尚無組別）、載入時 `getCurrentActivity()`、訂閱 `onPhaseChange`；沒有活動時顯示「目前沒有活動，請等老師建立活動」；有活動時以 `GroupGrid` 列出組別；`ErrorArea`
- [ ] T054 [US1] 在 `frontend/src/app/AppRouter.tsx` 接上 `Main`、`T-Login`、`T-Pick`、`S-Join`，老師頁首「搶答板」導向 `Main`
- [ ] T055 [US1] 在 Phase 3.5、3.6 完成後執行 `npm test`、`npm run test:e2e`，確認 T044–T048、T104–T106、T117–T119 通過；依 quickstart Q1、Q2、Q11、Q14（T-Login、S-Join 部分）人工驗證，結果寫入 `specs/001-ui-prototype/manual-verification.md`

**Checkpoint**: US1 可獨立展示（MVP）。

---

## Phase 3.5: 規格修訂（2026-11-21）

**Purpose**: 套用 2026-11-21 的兩項 spec 修訂（commit `spec(001): revise spec for analyze and teacher sign-in`）：

- **捨棄「此帳號不是老師帳號」**：Google 帳號無法判斷是否為老師，以 Google 登入的人即為老師（FR-013、M1、D1；US1 AC-5 刪除）。T012、T018、T026、T045、T048 中關於 `NOT_TEACHER` 與「模擬非老師帳號」的內容由本 Phase 取代。
- **模擬控制的「已設定」提示**：點「模擬：驗證失敗」「模擬：非預期錯誤」後，控制列立即顯示提示，數秒後或切換頁面時消失（FR-061、US5 AC-11）。補充 T037、T041。

本 Phase 在 Phase 4 之前完成；T055 的人工驗證依修訂後的 quickstart Q2 執行。

### Tests（先改，確認失敗）

- [ ] T104 [P] 修改 `frontend/tests/unit/MockAuthService.test.ts`（M1）：模擬帳號選擇只有「模擬老師帳號」「取消」兩個選項；刪除 `NOT_TEACHER` 的案例；「取消」與關閉選擇器都回傳 `failure: CANCELLED`（邊界）
- [ ] T105 [P] 修改 `frontend/tests/component/TeacherLoginPage.test.tsx`（FR-013）：刪除 `NOT_TEACHER` 的案例；`CANCELLED` 顯示「已取消登入」並停留（邊界）
- [ ] T106 [P] 修改 `frontend/tests/e2e/us1-entry.spec.ts`：quickstart Q2 只走「取消」與「模擬老師帳號」兩個選項
- [ ] T107 [P] 擴充 `frontend/tests/component/MockControlBar.test.tsx`（FR-061、US5 AC-11）：點「模擬：驗證失敗」後顯示「已設定：下一次送出會回傳驗證錯誤」，點「模擬：非預期錯誤」後顯示「已設定：下一次介面呼叫會回傳非預期錯誤」；以 fake timers 斷言數秒後提示消失；`page` 改變時提示立即消失（邊界）；其他控制（推進、接受、不接受）不顯示提示

### Implementation

- [ ] T108 在 `shared/src/entities.ts` 的 `SignInFailure` 移除 `NOT_TEACHER`，只保留 `CANCELLED`（data-model 第 1 節、類別圖）
- [ ] T109 在 `frontend/src/services/mock/MockFixtures.ts` 移除 `ACCOUNT_CHOICE.NON_TEACHER`，並在 `MockAuthService.ts` 只提供「模擬老師帳號」「取消」兩個選項（M1；依賴 T108）
- [ ] T110 在 `frontend/src/pages/teacher/TeacherLoginPage.tsx` 的失敗訊息只對應 `CANCELLED`（「已取消登入」）（FR-013；依賴 T108）
- [ ] T111 在 `frontend/src/components/MockControlBar.tsx`（與 `.module.css`）加入已設定提示：點驗證失敗或非預期錯誤控制後顯示對應文字，數秒後或 `page` 改變時清除；提示只確認點擊，不追蹤錯誤是否已被消耗（contracts/mock-controls.md）
- [ ] T112 執行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run test:e2e`，確認 T104–T107 通過，且其他測試沒有退步

**Checkpoint**: 實作與修訂後的 spec 一致，接著完成 T055 的人工驗證。

---

## Phase 3.6: 規格修訂（2026-11-22）

**Purpose**: 套用 Phase 3 完成後的兩個 spec commit（`spec(001): align ui flow with feature split`、`spec(001): sync plan and tasks with feature split revisions`）中影響已完成程式碼的部分：

- **返回首頁與瀏覽器上一頁**：T-Login、S-Join 新增「返回首頁」（FR-007、US1 AC-6）；瀏覽器上一頁等同不呼叫介面的返回類按鈕，沒有這類按鈕的頁面停留，開啟的視窗只被關閉（FR-014、US1 AC-7、research RD-11）。
- **判定與送出規則**：只有最早一筆待判定的答案可判定；接受時本題結束（最後一題時活動結束），`judge` 改回傳 `JudgeOutcome`（FR-032、FR-032a、M4）；每組每題只送出一次、被拒絕後不能再送出、新增同組組員送出（FR-056、FR-056a、M5）；「模擬：接受」同時推進學生端階段（M6）；最後一題不經過「本題已結束」（M7）。
- **加入組別的目的頁**：新增 `getGroupSubmission`（S4、S8–S10、research RD-14）。
- **模擬資料**：沒有送出的題目從最後一題改為第 3 題（M4）。

T012、T014、T015、T020、T021、T023、T024、T025、T028、T029、T031、T037、T041、T045、T047、T048 中與上述衝突的內容由本 Phase 取代。本 Phase 在 Phase 3.5 之後、Phase 4 之前完成。

### Tests（先改，確認失敗）

- [ ] T113 [P] 修改 `frontend/tests/unit/MockSubmissionService.test.ts`（M4–M6，見 C-3）：`listSubmissions(q)` 第 3 題回傳空陣列（邊界），其他題 ≥ 2 筆；只有 `rank` 最小的 `PENDING` 可判定，對其他列呼叫 `judge` 時丟出一般的 `Error`（程式錯誤，頁面不會觸發；不使用 `UnexpectedError`，FR-009 的模擬錯誤只有 M9 一種）；`judge(q, group, REJECTED)` 回傳的 `JudgeOutcome.activity.phase` 仍為 `OPEN`，下一筆成為最早的 `PENDING`；`judge(q, group, ACCEPTED)` 回傳 `QUESTION_ENDED`（最後一題為 `FINISHED`）並寫入 `MockSession.teacherActivity`；`getGroupSubmission(q)` 加入後、送出前回傳 `null`，`submitAnswer` 後回傳本組這一題的送出；`simulateTeammateSubmission()` 以固定的模擬答案建立本組這一題的 `PENDING` 送出並通知 `onGroupSubmitted`；本組這一題已有送出後再呼叫 `submitAnswer` 時丟出一般的 `Error`（M5 每組每題只送出一次，頁面不會觸發，邊界）；`simulateJudgement(ACCEPTED)` 通知 `onJudgement` 且讓學生端階段推進一次，`simulateJudgement(REJECTED)` 不改變階段（邊界）；刪除「被拒絕後再送出產生新的一筆」的案例
- [ ] T114 [P] 修改 `frontend/tests/unit/MockActivityService.test.ts`（M6、M7，見 C-3）：`advancePhase()` 序列為 `… → OPEN(4) → FINISHED`，最後一題不經過 `QUESTION_ENDED`；`MockSession` 觸發的階段推進（M6 的接受）同樣通知 `onPhaseChange` listener；`FINISHED` 後再推進不變（邊界）
- [ ] T115 [P] 修改 `frontend/tests/unit/createServiceRegistry.test.ts`：七個模擬控制欄位都存在，新增 `teammateControl` 且與 `submission` 為同一個模擬實作
- [ ] T116 [P] 擴充 `frontend/tests/component/MockControlBar.test.tsx`（FR-061、US5 AC-7）：「模擬：同組組員送出」只在 `S-Answer` 出現，點擊呼叫 `teammateControl.simulateTeammateSubmission()`；`teammateControl` 為 `undefined` 時不顯示（邊界）
- [ ] T117 [P] 擴充 `frontend/tests/component/TeacherLoginPage.test.tsx` 與 `frontend/tests/component/JoinPage.test.tsx`（FR-007、US1 AC-6）：兩頁都有「返回首頁」，點擊 → `Main`，且不呼叫任何介面方法；S-Join 沒有活動時也有「返回首頁」（邊界，H4）
- [ ] T118 [P] 新增 `frontend/tests/component/AppRouter.history.test.tsx`（FR-014、US1 AC-7）：每次切換頁面都 `pushState` 一筆不改網址的紀錄；在 `T-Login`、`S-Join` 觸發 `popstate` → `Main`；在 `T-Pick` → `Main`（「取消」）；在 `Main` 觸發 `popstate` 停留且再補一筆紀錄（邊界）；模擬帳號選擇（`ConfirmDialog`）開啟時觸發 `popstate` 只關閉選擇器並呼叫 `choicePrompt.answer(null)`，頁面不切換（邊界）
- [ ] T119 [P] 擴充 `frontend/tests/e2e/us1-entry.spec.ts`：quickstart Q14 中 T-Login、S-Join 的部分（「返回首頁」與 `page.goBack()` 都回到首頁；模擬選擇器開啟時 `goBack()` 只關閉選擇器）

### Implementation

- [ ] T120 在 `shared/src/entities.ts` 新增 `JudgeOutcome`（`submissions: Submission[]`、`activity: Activity`）（data-model 第 1 節、類別圖）
- [ ] T121 在 `frontend/src/services/interfaces.ts` 依類別圖修改 `SubmissionService`：`judge(questionNumber, groupNumber, judgement): Promise<JudgeOutcome>`；新增 `getGroupSubmission(questionNumber: number): Promise<Submission | null>` 與 `onGroupSubmitted(listener: (submission: Submission) => void): Unsubscribe`（兩者都不帶組別，原則 VI）；新增 mock only 的 `TeammateMockControl`（`simulateTeammateSubmission(): Promise<Submission>`）（依賴 T120）
- [ ] T122 在 `frontend/src/services/ServiceRegistry.ts` 新增 `teammateControl?: TeammateMockControl`（data-model 第 2 節；依賴 T121）
- [ ] T123 在 `frontend/src/services/mock/MockFixtures.ts` 把沒有送出的題目從第 4 題改為第 3 題，第 1、2、4 題各 ≥ 2 筆（M4；兩份可辨識的學習單都要調整）；新增同組組員的模擬答案（每題一組，答案數等於該題小題數，M5）
- [ ] T124 在 `frontend/src/services/mock/MockSession.ts` 新增只供模擬服務使用的學生端階段推進管道：`setViewerPhaseAdvancer(fn)`（由 MockActivityService 註冊）與 `advanceViewerPhase()`（由 MockSubmissionService 在模擬接受時呼叫），讓 M6 的推進與 `advancePhase()` 走同一段程式並通知 `onPhaseChange`（見 C-3；時序圖第 3 段）
- [ ] T125 在 `frontend/src/services/mock/MockActivityService.ts` 依 M7 修改學生端序列，最後一題由 `OPEN` 直接到 `FINISHED`；在建構時向 `MockSession` 註冊 `setViewerPhaseAdvancer`（依賴 T124）
- [ ] T126 在 `frontend/src/services/mock/MockSubmissionService.ts` 依 M4–M6 修改：`judge` 只接受最早一筆 `PENDING`，回傳 `JudgeOutcome`，`ACCEPTED` 時把 `MockSession.teacherActivity` 設為 `QUESTION_ENDED`（最後一題為 `FINISHED`）（見 C-3）；實作 `getGroupSubmission`、`onGroupSubmitted`、`simulateTeammateSubmission`（`implements TeammateMockControl`）；`simulateJudgement(ACCEPTED)` 呼叫 `MockSession.advanceViewerPhase()`；每組每題只記錄一筆送出（依賴 T121、T123、T124）
- [ ] T127 在 `frontend/src/services/createServiceRegistry.ts` 把 MockSubmissionService 綁定到 `teammateControl`（依賴 T122、T126）
- [ ] T128 在 `frontend/src/components/MockControlBar.tsx` 新增「模擬：同組組員送出」控制，只在 `S-Answer` 且 `teammateControl` 存在時顯示（contracts/mock-controls.md；依賴 T122）
- [ ] T129 [P] 在 `frontend/src/pages/teacher/TeacherLoginPage.tsx` 新增「返回首頁」按鈕 → `Main`，不呼叫介面（FR-007）
- [ ] T130 [P] 在 `frontend/src/pages/student/JoinPage.tsx` 新增「返回首頁」按鈕 → `Main`，有活動與沒有活動兩種狀態都顯示，不呼叫介面（FR-007、H4）
- [ ] T131 在 `frontend/src/components/ConfirmDialog.tsx` 匯出 `closeTopDialog(): boolean`：開啟中的 `ConfirmDialog` 以堆疊記錄，呼叫時對最上層執行其 `onClose`（等同取消類按鈕）並回傳 true，沒有開啟的視窗時回傳 false（FR-014）
- [ ] T132 在 `frontend/src/app/AppRouter.tsx` 實作 FR-014（research RD-11）：每次切換頁面以 `history.pushState` 加入一筆不改網址的紀錄；監聽 `popstate`，先呼叫 `closeTopDialog()`，為 true 時補回一筆紀錄並停止；否則依「返回類按鈕對照」切換（`T-Login`、`S-Join` → `Main`，`T-Pick` → `Main`，`T-Import` → `T-Pick`，`T-Setup` 建立模式 → `T-Import`，修改模式 → `T-Lobby`）；其他頁面補回一筆紀錄並停留。對照集中在 AppRouter 一處，後續 Story 接上新頁面時只在此表加入（依賴 T131）
- [ ] T134 [P] 把 `specs/001-ui-prototype/manual-verification.md` 樣板的情境範圍由 Q1–Q12 改為 Q1–Q14（說明文字與表頭；T010 已完成，quickstart 新增 Q13、Q14）
- [ ] T133 執行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run test:e2e`，確認 T113–T119 通過，且其他測試沒有退步

**Checkpoint**: 已完成的實作與 2026-11-22 的 spec 一致，接著完成 T055 的人工驗證。

---

## Phase 4: User Story 2 - 老師完成活動準備 (Priority: P1)

**Goal**: T-Pick 挑選、T-Import、T-ImportError、T-Setup（建立／修改模式）、T-Lobby。涵蓋 R2、R2.1、R2.2、E1、R3、FR-020–FR-025、FR-008。

**Independent Test**: 從 T-Pick 挑選三份模擬學習單，經 T-ImportError「重新讀取」到 T-Import，確認後在 T-Setup 調整組數、觸發驗證失敗、建立活動進入 T-Lobby，再「修改設定」來回（quickstart Q3、Q4）。

### Tests for User Story 2

- [ ] T056 [P] [US2] 擴充 `frontend/tests/component/PickPage.test.tsx`：`pickSpreadsheet()` 回傳 `null` 時停留且不呼叫 `readWorksheet`（邊界，US2 AC-5）；回傳學習單後以 `selectedWorksheet` 呼叫 `readWorksheet`，`ImportSuccess` → `T-Import`、`ImportError` → `T-ImportError`
- [ ] T057 [P] [US2] `frontend/tests/component/ImportPage.test.tsx`：T-Import 顯示 FR-021 全部項目（標題、可編輯／僅檢視、工作表分頁、表頭列與欄、預覽、題數、題組數、填空格數、每題類型與填空格位置）；切換工作表呼叫 `readWorksheet` 並依結果切換（T4、T5）；「重新挑選」取消時停留；「取消」→ `T-Pick`；「確認匯入，下一步」→ `T-Setup`（`create`）且不呼叫介面；T-ImportError 顯示錯誤原因、目前表頭、認得的寫法、修正方式（FR-022），「重新讀取」成功 → `T-Import`、仍失敗 → 停留（邊界，T8）；非預期錯誤顯示於 `ErrorArea`
- [ ] T058 [P] [US2] `frontend/tests/component/SetupPage.test.tsx`：沒有活動名稱欄位（FR-023）；「+」「−」各改變組數 1 並更新組別清單，不呼叫介面、不切換頁面（US2 AC-7）；建立模式按鈕為「上一步」「建立活動」，修改模式為「取消」「儲存設定」（FR-024）；`createActivity` 回傳 `Activity` → `T-Lobby`；回傳 `ValidationError` 時停留並在組數欄位旁顯示 `message`（邊界，FR-008）；修改模式「取消」→ `T-Lobby`、「儲存設定」成功 → `T-Lobby`、`updateSettings` 回傳 `ValidationError` 時停留並在組數欄位旁顯示 `message`（邊界，US2 AC-9）；非預期錯誤時組數維持輸入值
- [ ] T059 [P] [US2] `frontend/tests/component/ConsolePage.lobby.test.tsx`：T-Lobby 以傳入的 `Activity` 顯示各組已加入人數、尚未有人加入的組別、題目清單（題號與類型）（FR-025）；訂閱 `onActivityChange`，通知後以快照取代人數；「修改設定」→ `T-Setup`（`edit`）。不呼叫 `getCurrentActivity()`
- [ ] T060 [P] [US2] `frontend/tests/e2e/us2-preparation.spec.ts`：走 quickstart Q3、Q4（三份學習單、重新讀取、關閉選擇器、驗證失敗後再建立、修改設定來回）；以及 Q14 中 T-Pick、T-Import、T-Setup 的上一頁（分別等同「取消」「取消」「上一步／取消」），T-Lobby 按上一頁停留（FR-014）

### Implementation for User Story 2

- [ ] T061 [P] [US2] 在 `frontend/src/components/SheetPreview.tsx`（與 `.module.css`）實作學習單預覽：只依 `ImportSuccess` 呈現表頭列、每題的題號、題目敘述與 `subQuestions[].blankCell`，並標示填空格；不呈現辨識結果以外的儲存格內容（FR-021）；另支援傳入「填空格 → 內容」以供 T-Results 的寫回預覽使用
- [ ] T062 [US2] 在 `frontend/src/pages/teacher/PickPage.tsx` 完成「從 Google 雲端硬碟挑選」：`pickSpreadsheet()` → `readWorksheet(id, selectedWorksheet)` → 依 `isImportError` 導向 `T-Import` 或 `T-ImportError`；`null` 時停留
- [ ] T063 [US2] 在 `frontend/src/pages/teacher/ImportPage.tsx`（與 `.module.css`）實作 T-Import 與 T-ImportError 兩種顯示（prop 決定）：T-Import 依 FR-021 顯示並使用 `SheetPreview`，按鈕「工作表分頁」「重新挑選」「取消」「確認匯入，下一步」；T-ImportError 依 FR-022 顯示，按鈕「重新挑選」「重新讀取」；挑選與讀取的導向規則同 T062；`ErrorArea`
- [ ] T064 [US2] 在 `frontend/src/pages/teacher/SetupPage.tsx`（與 `.module.css`）實作 T-Setup：組數欄位（「−」「+」只改頁面上的輸入值，組數範圍不在 001 限制，D4）、組別清單、這一輪的摘要（題數、題組題號、組數、成功規則說明與學生加入方式說明的文字位置，文字依 feature-split 3.2 撰寫，不沿用設計稿的規則說明）；建立模式「上一步」→ `T-Import`、「建立活動」→ `createActivity({ groupCount })`；修改模式「取消」→ `T-Lobby`、「儲存設定」→ `updateSettings`；`ValidationError` 顯示在組數欄位旁；不得有活動名稱、公平模式、每題限時、學生加入網址與「複製網址」（SC-004）；`ErrorArea`。依組件圖，SetupPage 不依賴 `GroupGrid`
- [ ] T065 [US2] 在 `frontend/src/pages/teacher/ConsolePage.tsx`（與 `.module.css`）建立 ConsolePage，先實作 T-Lobby 檢視：以 AppRouter 傳入的 `Activity`（`createActivity`／`updateSettings` 的回傳值，見 C-1）顯示 FR-025 項目，用 `GroupGrid` 顯示各組人數；訂閱 `onActivityChange`；「修改設定」→ `T-Setup`（`edit`）；「開放第 1 題」按鈕（行為於 T074 完成）；`ErrorArea`；不顯示連線分頁數、離線狀態、限時（SC-004）
- [ ] T066 [US2] 在 `frontend/src/app/AppRouter.tsx` 接上 `T-Import`、`T-ImportError`、`T-Setup`、`T-Lobby`
- [ ] T067 [US2] 執行 `npm test`、`npm run test:e2e`，確認 T056–T060 通過；依 quickstart Q3、Q4 人工驗證並記錄於 `manual-verification.md`

**Checkpoint**: US1、US2 都可獨立運作。

---

## Phase 5: User Story 3 - 老師主持搶答與判定 (Priority: P1)

**Goal**: T-Live、T-EndConfirm、T-QuestionEnd、T-Results、T-WriteBack。涵蓋 R3、R4、R5、R5.1、R10、E4、FR-030–FR-034、FR-040–FR-042。

**Goal 補充**: 接受後本題自動結束（FR-032a）；只有最早一筆待判定的答案可判定（FR-032）。

**Independent Test**: 從 T-Lobby 依序開放每一題；先「不接受」最早一筆、再「接受」下一筆，本題自動結束；第 3 題沒有送出時以「結束這一題」結束；最後進入結果頁，以兩份學習單分別完成寫回成功與失敗（quickstart Q5、Q6）。

### Tests for User Story 3

- [ ] T068 [P] [US3] `frontend/tests/component/ConsolePage.live.test.tsx`：「開放第 1 題」呼叫 `openQuestion(1)` 後顯示 T-Live，呼叫 `listSubmissions(1)` 並訂閱 `onSubmissionsChange(1, …)`；顯示 FR-030 項目；答案列表依 `rank` 排列，每列有順位、組別、各小題答案、經過時間、判定狀態與「接受」「不接受」（FR-031）；只有 `rank` 最小的 `PENDING` 列按鈕可用（FR-032、US3 AC-2，見 C-4）；點「不接受」呼叫 `judge(q, group, REJECTED)`，回傳 `activity.phase` 為 `OPEN` 時停留並以 `submissions` 取代列表，該列顯示「不接受」、下一筆變成可用（US3 AC-4）；點「接受」回傳 `QUESTION_ENDED` → T-QuestionEnd 並呼叫 `getQuestionResult(q)`、`getAllResults()`，回傳 `FINISHED` → `T-Results`（FR-032a、US3 AC-3，最後一題為邊界）；沒有送出時答案列表為空並列出全部未送出組別（邊界，US3 AC-5）；每一列都不接受後，所有「接受」「不接受」都不可用，只剩「結束這一題」（spec 頁面清單 T-Live「全部不接受」，邊界）；`onSubmissionsChange` 通知後以快照取代列表；`judge` reject 時停留並在 `ErrorArea` 顯示
- [ ] T069 [P] [US3] `frontend/tests/component/ConsolePage.endQuestion.test.tsx`：「結束這一題」開啟確認視窗，列出本題已送出組數與還沒送出的組別，最後一題時另外說明會進入結果頁（FR-033）；「繼續作答」關閉視窗、資料不變（T14）；「結束並公布結果」呼叫 `endQuestion(n)`，`QUESTION_ENDED` → T-QuestionEnd 並呼叫 `getQuestionResult(n)`、`getAllResults()`；`FINISHED` → `T-Results`；`endQuestion` reject 時先關閉視窗再在 `ErrorArea` 顯示（FR-009）；確認視窗開啟時觸發 `popstate` 只關閉視窗（FR-014）；T-QuestionEnd 顯示搶答成功組別與答案，或「沒有組別搶答成功」「沒有組別送出」（邊界）、本題送出組數、題目進度、各組搶到題數，以及「開放第 n+1 題」（FR-034）
- [ ] T070 [P] [US3] `frontend/tests/component/TeacherResultsPage.test.tsx`：載入時 `getAllResults()` 並顯示 FR-040 項目（每題成功組別與答案、送出組數、每題所有送出組別的答案、順位與判定、各送出比第一名慢的秒數、各組搶到題數、寫回預覽）；比第一名慢的秒數取自 `behindFirstMs`（以與 `elapsedMs` 不一致的假資料斷言頁面顯示的是 `behindFirstMs`，不自行計算，FR-003）；頁面不出現結束時間與總耗時（spec「相對於設計稿的調整」）；「寫回 Google Sheets」開啟 T-WriteBack，列出目標試算表、工作表、格數、題數與影響範圍說明（FR-041）；「取消」關閉且不呼叫 `writeBack`（US3 AC-13）；確認視窗開啟時觸發 `popstate` 只關閉 T-WriteBack，不呼叫 `writeBack`（FR-014，邊界）；「寫回」成功顯示格數、失敗顯示原因（邊界，FR-042）；沒有匯出 CSV、備份工作表、開新一輪、舊答案還原、結束時間（SC-004）
- [ ] T071 [P] [US3] `frontend/tests/e2e/us3-hosting.spec.ts`：走 quickstart Q5、Q6（只有最早一筆可判定；不接受後輪到下一筆；接受後進入本題已結束，最後一題接受後直接進入結果頁；第 3 題沒有送出時以「結束這一題」結束並顯示「沒有組別送出」；兩份學習單的寫回成功與失敗）

### Implementation for User Story 3

- [ ] T072 [P] [US3] 在 `frontend/src/components/QuestionProgress.tsx`（與 `.module.css`）實作題目進度：props `questions: Question[]`、`results: QuestionResult[]`、`currentQuestion?: number`；每題顯示搶答成功組別或狀態，另可顯示各組搶到的題數
- [ ] T073 [P] [US3] 在 `frontend/src/components/SubmissionTable.tsx`（與 `.module.css`）實作答案列表：props `submissions: Submission[]`、`onJudge?: (group, judgement) => void`；依 `rank` 顯示順位、組別、`answers`、經過時間、判定狀態（待判定／已接受／不接受）；`onJudge` 存在時只有 `rank` 最小的 `PENDING` 列「接受」「不接受」可用（M4，見 C-4）
- [ ] T074 [US3] 在 `frontend/src/pages/teacher/ConsolePage.tsx` 實作 T-Lobby「開放第 1 題」與 T-Live 檢視：`openQuestion(n)` → `listSubmissions(n)`、`onSubmissionsChange(n, …)`、`getAllResults()`（題目進度）；顯示 FR-030；以 `SubmissionTable` 列出答案；`judge` 回傳 `JudgeOutcome` 後以 `submissions` 更新列表，並依 `activity.phase` 切換：`OPEN` 留在 T-Live、`QUESTION_ENDED` → T-QuestionEnd、`FINISHED` → `navigate` 到 `T-Results`（FR-032a）；不出現剩餘時間、連線分頁（SC-004）
- [ ] T075 [US3] 在 `frontend/src/pages/teacher/ConsolePage.tsx` 實作 T-EndConfirm（以 `ConfirmDialog`，內容只列本題已送出組數與還沒送出的組別，FR-033）與 T-QuestionEnd：依 T069 的規則；T-QuestionEnd 顯示本題送出組數，以 `QuestionProgress` 顯示進度，「開放第 n+1 題」呼叫 `openQuestion(n+1)` 回到 T-Live；最後一題結束 → `navigate` 到 `T-Results`
- [ ] T076 [US3] 在 `frontend/src/pages/teacher/TeacherResultsPage.tsx`（與 `.module.css`）實作 T-Results 與 T-WriteBack：載入 `getAllResults()`，顯示每題所有送出組別的答案、順位與判定（FR-040）；比第一名慢的秒數只把 `behindFirstMs` 換算成秒顯示，不由 `elapsedMs` 自行計算（FR-003）；不顯示結束時間與總耗時（SC-004）；以 `SheetPreview` 顯示寫回預覽；「寫回 Google Sheets」開啟 `ConfirmDialog`；「寫回」關閉視窗後呼叫 `writeBack()` 並顯示寫回結果（尚未寫回／成功／失敗）；`ErrorArea`
- [ ] T077 [US3] 在 `frontend/src/app/AppRouter.tsx` 接上 `T-Live`、`T-QuestionEnd`、`T-Results`
- [ ] T078 [US3] 執行 `npm test`、`npm run test:e2e`，確認 T068–T071 通過；依 quickstart Q5、Q6 人工驗證並記錄於 `manual-verification.md`

**Checkpoint**: 老師端流程完整。

---

## Phase 6: User Story 4 - 學生以組別作答 (Priority: P1)

**Goal**: S-Join 選組與加入（依階段與本組狀態決定目的頁）、S-Wait、S-Answer、S-Submitted（等待判定／不接受）、S-QuestionDone、S-Results。涵蓋 R6–R9、E1、E4、FR-050–FR-058、FR-056a。

**Independent Test**: 學生加入組別，以模擬控制推進到作答，分別走「送出 → 接受 → 本題結果」「送出 → 不接受 → 停在等待判定」「同組組員送出 → 等待判定」三條路徑，最後推進到全部結果；並在不同階段加入組別（quickstart Q7、Q8、Q13）。

### Tests for User Story 4

- [ ] T079 [P] [US4] 擴充 `frontend/tests/component/JoinPage.test.tsx`：未選組別時底部按鈕不可用（邊界，US4 AC-2）；點選組別後標示已選、按鈕變為「加入第 n 組」（AC-1）；點擊呼叫 `joinGroup(n)` 後依 `phase` 切換（RD-14）：`PREPARING` → `S-Wait`；`QUESTION_ENDED` → `S-QuestionDone`（S8）；`FINISHED` → `S-Results`（S9）；`OPEN` → 呼叫 `getGroupSubmission(q)`，`null` → `S-Answer`（S4），`PENDING` → `S-Submitted` 等待判定、`REJECTED` → `S-Submitted` 不接受（S10、FR-056a，以假 registry 驗證的邊界）；帶入先前選擇的組別時預先標示已選（AC-4）
- [ ] T080 [P] [US4] `frontend/tests/component/StudentPlayPage.wait.test.tsx`：S-Wait 顯示組別、階段「準備中」與說明文字位置（FR-051）；沒有「返回首頁」（FR-007）；「選錯組別？重新選擇」呼叫 `leaveGroup()`（不帶參數）→ `S-Join` 並保留原組別為已選；`onPhaseChange` 通知 `OPEN` → S-Answer；觸發 `popstate` 時停留（FR-014，邊界）
- [ ] T081 [P] [US4] `frontend/tests/component/StudentPlayPage.answer.test.tsx`：題組時每個小題一個答案欄、只有一個「整組送出」與一個送出提示區（FR-052、FR-053）；送出呼叫 `submitAnswer(q, answers)`（不帶組別）→ S-Submitted 顯示送出的答案與「等待老師判定」（US4 AC-6）；訂閱 `onGroupSubmitted`，通知後 → S-Submitted 顯示組員送出的答案（S7、FR-056a、US4 AC-12）；`ValidationError` 時停留並在第一個答案欄旁顯示（邊界，US4 AC-10）；非預期錯誤時答案欄內容不變；`onPhaseChange` 通知 `QUESTION_ENDED` → S-QuestionDone 並呼叫 `getQuestionResult(q)`、`FINISHED` → `S-Results`
- [ ] T082 [P] [US4] `frontend/tests/component/StudentPlayPage.judgement.test.tsx`：S-Submitted 訂閱 `onJudgement`；`REJECTED` 時停留並顯示「老師沒有接受本組的答案」與本組送出的答案，頁面上沒有「整組送出」或任何答案欄（FR-056、US4 AC-8，邊界）；`ACCEPTED` 時頁面本身不切換，隨後 `onPhaseChange` 通知 `QUESTION_ENDED` → S-QuestionDone、`FINISHED` → `S-Results`（FR-055、US4 AC-7）；不接受狀態下 `onPhaseChange` 推進同樣切換（US4 AC-9）；頁面不出現「已接受」狀態；`MockModeBadge` 收到的 `awaitingJudgement` 只在等待判定狀態為 true
- [ ] T083 [P] [US4] `frontend/tests/component/StudentPlayPage.questionDone.test.tsx` 與 `frontend/tests/component/StudentResultsPage.test.tsx`：S-QuestionDone 顯示本題成功組別與答案，或「沒有組別搶答成功」「沒有組別送出」（邊界，spec Edge Cases）、本題送出組數、本組送出的答案（若有）、題目進度（呼叫 `getAllResults()`，見 C-2）；頁面只呈現回傳內容，不自行過濾其他組別的資料（FR-057）；`onPhaseChange` 通知 `OPEN` → S-Answer；S-Results 顯示本組搶到的題數，以及每一題所有送出組別的答案、順位與判定，頁面上沒有任何按鈕（FR-058）；本組搶到 0 題時顯示 0（邊界，S9）
- [ ] T084 [P] [US4] `frontend/tests/e2e/us4-student.spec.ts`：走 quickstart Q7、Q8、Q13；並驗證 SC-007——S-Answer 與 S-Submitted 上不出現其他組別的組號、答案或送出狀態（FR-054）

### Implementation for User Story 4

- [ ] T085 [US4] 在 `frontend/src/pages/student/JoinPage.tsx` 完成選組與加入：`GroupGrid` 可選、底部按鈕「加入第 n 組」（未選時不可用）、`joinGroup(n)` 後依 research RD-14 導向（`PREPARING` → `S-Wait`；`OPEN` → `getGroupSubmission(q)`，`null` → `S-Answer`、有送出 → `S-Submitted` 並帶入該送出；`QUESTION_ENDED` → `S-QuestionDone`；`FINISHED` → `S-Results`）；接受 AppRouter 傳入的 `previousGroup` 預先選取
- [ ] T086 [US4] 在 `frontend/src/pages/student/StudentPlayPage.tsx`（與 `.module.css`）建立 StudentPlayPage，實作 S-Wait：學生版 `AppHeader` 顯示組別；顯示階段與說明文字位置（不沿用設計稿的規則說明與限時，SC-004）；「選錯組別？重新選擇」；訂閱 `onPhaseChange` 依「階段推動的切換」表切換內部狀態；`ErrorArea`
- [ ] T087 [US4] 在 `frontend/src/pages/student/StudentPlayPage.tsx` 實作 S-Answer：顯示組別、題號／總題數、題型、題目敘述（若有）、每小題一個答案欄、送出提示區、「整組送出」（001 一律可用）；`ValidationError` 顯示在第一個答案欄旁；訂閱 `onGroupSubmitted`，通知後切換到 S-Submitted 並顯示組員送出的答案（FR-056a）。沒有「被拒絕」狀態；頁面不得出現其他組別的作答狀況（FR-054）
- [ ] T088 [US4] 在 `frontend/src/pages/student/StudentPlayPage.tsx` 實作 S-Submitted（等待判定／不接受）：顯示本組送出的答案（本人或組員送出）；初始狀態依傳入送出的 `judgement`（`PENDING` 為等待判定、`REJECTED` 為不接受，S10）；訂閱 `onJudgement`，`REJECTED` 時改為不接受狀態並顯示「老師沒有接受本組的答案」，不提供任何再次送出的方式（FR-056）；`ACCEPTED` 時不自行切換，由 `onPhaseChange` 推動（FR-055）；把 `awaitingJudgement` 回報給 AppRouter 以傳給 `MockModeBadge`
- [ ] T089 [US4] 在 `frontend/src/pages/student/StudentPlayPage.tsx` 實作 S-QuestionDone：`getQuestionResult(q)` 與 `getAllResults()`（見 C-2；只呈現回傳內容，不自行過濾），顯示 FR-057 項目並以 `QuestionProgress` 顯示進度；`onPhaseChange` 通知 `OPEN` → S-Answer；S-Answer、S-Submitted 收到 `FINISHED` 時 → `navigate` 到 `S-Results`（最後一題不經過本頁）
- [ ] T090 [P] [US4] 在 `frontend/src/pages/student/StudentResultsPage.tsx`（與 `.module.css`）實作 S-Results：`getAllResults()`，顯示本組搶到的題數，以及每一題所有送出組別的答案、順位與判定（FR-058）；不提供任何按鈕，不出現「開新一輪」（SC-004）
- [ ] T091 [US4] 在 `frontend/src/app/AppRouter.tsx` 接上 `S-Wait`、`S-Answer`、`S-Submitted`（參數帶入本組送出）、`S-QuestionDone`、`S-Results`（前四者由 StudentPlayPage、最後由 StudentResultsPage 呈現），並把 StudentPlayPage 的內部狀態對應到傳給 `MockModeBadge` 的頁面 id；這些頁面在 FR-014 的對照中都屬於「停留」
- [ ] T092 [US4] 執行 `npm test`、`npm run test:e2e`，確認 T079–T084 通過；依 quickstart Q7、Q8、Q13 人工驗證並記錄於 `manual-verification.md`

**Checkpoint**: 老師端與學生端流程都完整。

---

## Phase 7: User Story 5 - 模擬模式可展示所有流程 (Priority: P2)

**Goal**: 驗證只用模擬實作就能走過畫面流程圖的每個狀態與每條箭頭、每頁都有「模擬模式」標示、模擬控制只出現在 FR-061 指定的頁面，以及每個有介面呼叫的頁面都能顯示非預期錯誤。涵蓋 FR-004–FR-006、FR-009、FR-060、FR-061、SC-001–SC-004。

**Independent Test**: 依 `diagrams/001-screen-flow.puml` 逐一走過每條箭頭（quickstart Q9、Q10、Q12）。

### Tests for User Story 5

- [ ] T093 [P] [US5] `frontend/tests/e2e/us5-screen-flow.spec.ts`：以 test 名稱標註畫面流程圖的每條箭頭（H1–H4、T1–T15、S1–S9 與圖上有文字的箭頭；S10 依 SC-002 除外，改由 T079 的元件測試涵蓋），逐條觸發並斷言到達的頁面（SC-001、SC-002）；在 T-ImportError、T-Live、T-QuestionEnd、T-Results、S-Answer、S-Submitted、S-QuestionDone、S-Results 各執行一次 `page.goBack()` 並斷言停留在原頁，`page.reload()` 後回到 Main（FR-014）；每次到達新頁面都斷言「模擬模式」標示可見（SC-003）
- [ ] T094 [P] [US5] `frontend/tests/e2e/us5-mock-controls.spec.ts`：在每個頁面斷言模擬控制列只出現 FR-061 指定的控制，「模擬：同組組員送出」只在 S-Answer（US5 AC-6、AC-7）；「模擬：接受」進入本題結果頁（最後一題為全部結果頁）、「模擬：不接受」停在等待判定頁（AC-5）；「模擬：驗證失敗」只影響下一次送出（AC-8）；學生在 S-Wait 推進後到 S-Answer（AC-4）；`FINISHED` 後再推進不變（邊界）
- [ ] T095 [P] [US5] `frontend/tests/e2e/us5-unexpected-error.spec.ts`：對 FR-061 列出的 12 個頁面（T-Login、T-Pick、T-Import、T-ImportError、T-Setup、T-Lobby、T-Live、T-QuestionEnd、T-Results、S-Join、S-Wait、S-Answer）各點「模擬：非預期錯誤」再點一個會呼叫介面的按鈕，斷言停留原頁、`ErrorArea` 顯示「模擬：連不上伺服器」、已輸入內容不變；T-Live 的「結束並公布結果」與 T-Results 的「寫回」先關閉確認視窗；再點一次成功並清除訊息（US5 AC-9、AC-10，quickstart Q12）
- [ ] T096 [P] [US5] `frontend/tests/e2e/us5-removed-elements.spec.ts`：走過所有頁面，斷言 spec「相對於設計稿的調整」列出的文字一個都不出現：「公平模式」「匯出 CSV」「限時」「剩餘時間」「時間到」「清掉舊答案」「備份」「開新一輪」「連結 Google 帳號」「解除連結」「複製網址」「連線分頁」「離線」、活動結束時間與總耗時（「結束 ·」「共 」後接時間）與活動名稱（SC-004）
- [ ] T097 [P] [US5] `frontend/tests/component/AppRouter.test.tsx`：以 `isMockMode: false` 且沒有模擬控制的假 registry 渲染 `AppRouter`，斷言「模擬模式」標示與控制列出現 0 次（SC-003、FR-005）；學生頁面套上置中欄（spec Assumptions）

### Implementation for User Story 5

- [ ] T098 [US5] 執行 T093–T097；只修正測試找出的頁面切換或控制顯示缺漏，修正範圍限於 Phase 2–6 已建立的檔案，不新增 spec 沒有的行為
- [ ] T099 [US5] 依 quickstart Q9、Q10、Q12 人工驗證並記錄於 `manual-verification.md`

**Checkpoint**: 所有 User Story 完成。

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T100 [P] 確認 ESLint 規則有效：暫時在任一頁面加入 `import ... from '../services/mock/MockFixtures'`，`npm run lint` 應報錯，確認後移除（原則 III）
- [ ] T101 [P] 檢查 `frontend/src/`、`shared/src/` 中的註解與命名皆為英文、同一介面元素沒有重複實作（原則 IX）
- [ ] T102 依 `quickstart.md` 從乾淨環境執行 `npm install`、`npx playwright install chromium`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run test:e2e`，回報每個指令與結果（原則 VIII）
- [ ] T103 確認 `manual-verification.md` 已涵蓋 quickstart Q1–Q14 且每個 User Story 至少一筆紀錄

完成後進入 CLAUDE.md 第 2 節步驟 7（圖表一致性驗證，產出 `diagram-verification.md`），不在本任務清單中。

---

## 需求與任務對照

| 需求 | 任務 |
| --- | --- |
| FR-001 頁面清單 | T034、T050–T053、T063–T065、T074–T076、T086–T090、T093 |
| FR-002 按鈕與目的頁 | T044–T047、T056–T059、T068–T070、T079–T083、T093 |
| FR-003 經介面呼叫 | T014–T016、T031、T007、T100 |
| FR-004 模擬實作 | T017–T031 |
| FR-005 模擬模式標示 | T037、T042、T093、T097 |
| FR-006 階段推動的切換 | T020、T028、T047、T080–T083、T093 |
| FR-007 搶答板與返回首頁 | T036、T038、T054、T117、T129、T130 |
| FR-008 驗證錯誤顯示 | T058、T064、T081、T087、T094 |
| FR-009 共通錯誤訊息區 | T017、T036、T039、T045、T057、T058、T069、T081、T095 |
| FR-014 瀏覽器上一頁 | T060、T069、T080、T118、T119、T131、T132 |
| FR-010–FR-013 | T044、T045、T050、T051、T105、T110 |
| FR-020 | T046、T052、T056、T062 |
| FR-021、FR-022 | T057、T061、T063 |
| FR-023、FR-024 | T058、T064 |
| FR-025 | T059、T065 |
| FR-030–FR-034、FR-032a | T068、T069、T071–T075、T113、T126 |
| FR-040–FR-042 | T070、T076 |
| FR-050 | T047、T053、T079、T085 |
| FR-051 | T080、T086 |
| FR-052、FR-053 | T081、T087 |
| FR-054 | T029、T084、T087 |
| FR-055、FR-056 | T082、T088、T113、T124、T126 |
| FR-056a | T079、T081、T085、T087、T088、T113、T121、T126 |
| FR-057 | T083、T089 |
| FR-058 | T083、T090 |
| FR-060（M1–M9） | M1 T018/T026、T104/T109、M2 T019/T027、M3 T020/T028、M4–M6 T021/T029、T113/T123/T126、M7 T020/T028、T114/T125、M8 T022/T030、M9 T017/T025 |
| FR-061 | T037、T041、T094、T107、T111、T116、T128 |
| SC-001、SC-002 | T093、T095 |
| SC-003 | T037、T093、T097 |
| SC-004 | T096 |
| SC-005、SC-006 | T055、T092（人工驗證計時）、T134 |
| SC-007 | T084 |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴
- **Foundational (Phase 2)**: 依賴 Phase 1；阻擋所有 Story
- **US1 (Phase 3)**: 依賴 Phase 2
- **規格修訂 (Phase 3.5、3.6)**: 依賴 Phase 3；依序執行（3.5 → 3.6），修改 Phase 2、3 已建立的檔案；完成後才做 T055 與 Phase 4
- **US2 (Phase 4)**: 依賴 Phase 2；延續 US1 的 `PickPage.tsx`（T062 修改 T052 的檔案）
- **US3 (Phase 5)**: 依賴 Phase 2；延續 US2 的 `ConsolePage.tsx`（T074 修改 T065 的檔案）
- **US4 (Phase 6)**: 依賴 Phase 2；延續 US1 的 `JoinPage.tsx`；使用 US3 的 `QuestionProgress`（T072）
- **US5 (Phase 7)**: 依賴 US1–US4 全部完成（驗證整張畫面流程圖）
- **Polish (Phase 8)**: 依賴所有 Story

所有 Story 都會修改 `AppRouter.tsx`，因此 Story 之間依序執行（P1 依 US1 → US2 → US3 → US4，最後 US5）。CLAUDE.md 規定 implement 一次只執行一個 Phase。

### Within Each User Story

- 測試先寫並確認失敗，再實作
- 共用元件 → 頁面 → AppRouter 接線 → 執行測試與人工驗證
- 同一檔案的任務依序執行（例如 T074 → T075，T086 → T087 → T088 → T089）

### Parallel Opportunities

- Phase 1：T002、T005–T010
- Phase 2：T012、T013；T017–T023（全部測試）；T026–T030（五個模擬服務，在 T025 之後）；T033、T036–T040
- US1：T044–T048 測試；T049–T053 實作（五個不同檔案）
- US2：T056–T060 測試；T061 可與其他實作平行
- US3：T068–T071 測試；T072、T073
- US4：T079–T084 測試；T090 可與 StudentPlayPage 任務平行
- US5：T093–T097

## Parallel Example: User Story 1

```text
# 測試一起寫：
T044 HomePage.test.tsx
T045 TeacherLoginPage.test.tsx
T046 PickPage.test.tsx
T047 JoinPage.test.tsx
T048 us1-entry.spec.ts

# 實作一起做（不同檔案）：
T049 GroupGrid.tsx
T050 HomePage.tsx
T051 TeacherLoginPage.tsx
T052 PickPage.tsx
T053 JoinPage.tsx
```

## Parallel Example: Foundational

```text
# 五個模擬服務在 MockSession（T025）完成後平行實作：
T026 MockAuthService.ts
T027 MockGuidedNotesService.ts
T028 MockActivityService.ts
T029 MockSubmissionService.ts
T030 MockResultService.ts
```

---

## Implementation Strategy

### MVP First（只做 User Story 1）

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1
4. **停下驗證**：首頁、登入、選組頁可獨立展示，回報測試結果

### Incremental Delivery

每個 Phase 完成後停下、回報測試指令與結果、經人工審查才進入下一個 Phase（CLAUDE.md 第 2 節步驟 6、原則 X）：

1. Setup + Foundational → 模擬實作與共用元件就緒
2. US1 → 身分選擇入口（MVP）
3. US2 → 老師完成活動準備
4. US3 → 老師主持與寫回
5. US4 → 學生作答
6. US5 → 整張畫面流程圖與模擬模式驗證
7. Polish → 全部測試與人工驗證紀錄
