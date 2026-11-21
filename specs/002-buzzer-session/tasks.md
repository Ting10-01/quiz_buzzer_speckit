---
description: "Task list for 002 搶答活動"
---

# Tasks: 搶答活動

**Input**: Design documents from `specs/002-buzzer-session/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；共用骨架見 `specs/001-guided-notes-import/tasks.md` Phase 1、2（T001–T017）

**Tests**: constitution 原則 VIII 要求每個 User Story 至少有一個正常與一個邊界案例的自動化測試；US6 另有壓力測試（SC-006、SC-007）。測試先寫、先確認失敗，再實作。

**Organization**: 依 User Story 分 Phase，P1 的 US1、US2、US3、US6 在前，P2 的 US4、P3 的 US5 在後。

**負責人**：依 `docs/work-split.md`，002 由 B 負責；排名策略（`buzz/ranking.ts`）與壓力測試（`tests/load/`）標示「負責：A」。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1–US6）
- `server/` 指 `packages/server/`，`web/` 指 `packages/web/`，`shared/` 指 `packages/shared/`

---

## Phase 1: Setup（002 專屬）

**Purpose**: 共用骨架完成後，002 額外需要的測試工具

- [ ] T001 [P] 在 `server/package.json` 的 devDependencies 加入 `socket.io-client`（整合測試與壓力測試用）
- [ ] T002 [P] 建立 `server/tests/helpers/testServer.ts`：在隨機埠啟動伺服器，提供建立老師與學生 Socket.IO 連線、等待指定事件的輔助函式
- [ ] T003 [P] 建立 `server/tests/helpers/fakeClock.ts`：可控制的 `performance.now()` 與 Vitest 假計時器，用來測倒數與時鐘倒退

---

## Phase 2: Foundational（002 的基礎）

**Purpose**: 領域型別、排序核心與身分；所有 Story 都依賴這些

**⚠️ CRITICAL**: 這個 Phase 完成前不開始 002 的 User Story

- [ ] T004 建立 `server/src/buzz/domain.ts`：`Activity`（組數 2–20；`timeLimitSec` 為 5–600 或 `null`；`fairMode.windowSeconds` 為 1–10、預設 3；`nextSeq` 從 1 開始）、`Phase`、`QuestionPhase`、`CloseReason`、`Group`、`FairModeSetting`、`Submission`、`Command` 系列（`OpenNextQuestionCommand`、`CloseQuestionCommand`、`EndActivityCommand`、`SubmitCommand`）、`CommandResult`，依 `data-model.md`
- [ ] T005 [P] `server/tests/unit/buzz/SequenceClock.test.ts`：連續呼叫不倒退；同一毫秒回傳相同值；系統時間往回調整時仍不倒退（AC-27）
- [ ] T006 [P] 實作 `server/src/buzz/SequenceClock.ts`：`max(上次的值, performance.timeOrigin + performance.now())`（research R2）
- [ ] T007 [P] `server/tests/unit/buzz/CommandQueue.test.ts`：指令依 enqueue 順序逐一處理；處理中再 enqueue 的指令排在後面；處理函式是同步的（回傳 Promise 時測試失敗）
- [ ] T008 實作 `server/src/buzz/CommandQueue.ts`：同步逐一處理，臨界區內不得有 `await`（research R1），依 T004
- [ ] T009 [P] `server/tests/integration/sessionRoutes.test.ts`：`POST /api/teacher/session` 發出 43 字元 base64url 憑證並在終端機印出取回連結；已有有效憑證時第二個分頁回 `409 TEACHER_ACTIVE`（AC-34）；`POST /api/teacher/recover` 用正確的取回碼換到新憑證、舊憑證與取回碼同時失效、同一個取回碼第二次使用回 `400 INVALID_RECOVERY_CODE`（AC-35）；憑證與取回碼都沒有寫入檔案或 log 檔
- [ ] T010 實作 `server/src/session/TeacherCredential.ts` 與 `server/src/http/sessionRoutes.ts` 的 `POST /api/teacher/session` 與 `POST /api/teacher/recover`（`crypto.randomBytes(32)`，只存在記憶體；取回連結只印在終端機，不寫入檔案或 log，依 research R6），並把骨架的 `server/src/http/requireTeacher.ts`（001 T014）改為驗證真正的憑證
- [ ] T011 [P] 實作 `server/src/store/ActivityStore.ts`：`current()`、`replace(activity)`，同一時間只有一個活動
- [ ] T012 [P] 實作 `web/src/lib/socket.ts`：老師連線帶 `auth.teacherToken`（從該分頁的 `sessionStorage`）；並實作 `web/src/pages/teacher/RecoverPage.tsx`：從網址 `#` 之後讀出取回碼，呼叫 `POST /api/teacher/recover`，成功後存入 `sessionStorage` 並進入控制台（AC-35）；學生連線帶 `participantId`（從 `sessionStorage`）；收到 `view:*` 後呼叫 ack；斷線自動重連

**Checkpoint**: 排序核心、身分與連線工具就緒

---

## Phase 3: User Story 1 - 建立活動並逐題開放，所有人同步 (Priority: P1) 🎯 MVP

**Goal**: 老師建立活動、依題號逐題開放與結束、可設倒數；學生選組並同步看到目前的題目

**Independent Test**: 1 個老師分頁與 3 個學生分頁，老師開放第 1 題、結束、開放第 2 題，所有分頁 1 秒內同步

### Tests for User Story 1 ⚠️

- [ ] T013 [P] [US1] `server/tests/unit/buzz/ActivityService.lifecycle.test.ts`：建立活動驗證組數 2–20、秒數 5–600 或不限時、視窗 1–10（`INVALID_SETTINGS`）（AC-01）；`openNextQuestion` 只開題號最小的 `PENDING` 題、有題目 `OPEN` 時回 `QUESTION_STILL_OPEN`（AC-29）；狀態不能倒退；最後一題結束自動 `ENDED`；提前結束時未開放題目記為無人搶答（AC-30）；第 1 題開放後 `changeGroup` 回 `GROUP_LOCKED`（REQ-BUZ-04）
- [ ] T014 [P] [US1] `server/tests/unit/buzz/QuestionTimer.test.ts`：以假計時器驗證截止時把 `CloseQuestionCommand(TIMEOUT)` 放進佇列；手動結束時 `cancel()`；view 的 `remainingSec` 由伺服器計算（AC-32）
- [ ] T015 [P] [US1] `server/tests/integration/activity.test.ts`：`POST /api/activity` 成功回 201；沒有題目清單回 `409 NO_QUESTION_SET`；已有進行中活動回 `409 ACTIVITY_RUNNING`；上一輪未寫回也未匯出 CSV 時回 `409 UNEXPORTED_RESULTS`，帶 `confirmReplace` 後可取代（REQ-BUZ-20）；`GET /api/activity/public` 只回公開資訊
- [ ] T016 [P] [US1] `server/tests/integration/gateway.lifecycle.test.ts`：老師 `teacher:openNext` 後所有連線 1 秒內收到新 view（AC-03）；學生連線送 `teacher:openNext` 回 `FORBIDDEN`（AC-06）；學生重新連線帶 `participantId` 回到原組別並收到目前題目（AC-05）；題目結束與活動結束時呼叫 `ResultsService` 的三個方法，且在佇列處理完之後
- [ ] T017 [P] [US1] `web/src/pages/student/AnswerPage.wait.test.tsx`：未開放時顯示「等老師開放第 1 題」且無法作答（AC-02）；有題目敘述時顯示敘述，沒有時只顯示題號（AC-33）

### Implementation for User Story 1

- [ ] T018 [US1] 實作 `server/src/buzz/ActivityService.ts` 的 `createActivity`、`join`、`changeGroup`、`openNextQuestion`、`closeQuestion(reason)`、`endActivity`，所有狀態變更都經過 `CommandQueue`；處理完成後才呼叫 `ResultsService.onActivityCreated`／`onQuestionClosed`／`onActivityEnded`（REQ-BUZ-05、19、21），依 T008、T011
- [ ] T019 [US1] 實作 `server/src/buzz/QuestionTimer.ts`：`start(questionNumber, deadline)`、`cancel()`（research R5），依 T018
- [ ] T020 [US1] 實作 `server/src/buzz/VisibilityFilter.ts` 的基本 `teacherView`、`studentView`（`phase`、`current`、`remainingSec`、`closedResults`），依 `data-model.md`
- [ ] T021 [US1] 實作 `server/src/session/Broadcaster.ts`：`notify(activity)` 依角色送出 `view:teacher`／`view:student`，`reply(connectionId, result)`；先用簡單版本，US6 再加入 `Outbox`
- [ ] T022 [US1] 實作 `server/src/session/SessionGateway.ts`：連線時依 `auth` 判斷老師或學生；處理 `student:join`、`student:changeGroup`、`teacher:openNext`、`teacher:closeQuestion`、`teacher:endActivity`；非老師送老師事件回 `FORBIDDEN`，依 `contracts/socket-events.md`
- [ ] T023 [US1] 在 `server/src/http/sessionRoutes.ts` 加入 `POST /api/activity` 與 `GET /api/activity/public`，依 `contracts/session-http.md`
- [ ] T024 [P] [US1] 建立 `web/src/components/Countdown.tsx`：以收到的 `remainingSec` 為基準本地倒數，收到新 view 時校正
- [ ] T025 [P] [US1] 實作 `web/src/pages/teacher/SetupPage.tsx`（設計稿 T2：組數、每題秒數、公平模式）與 `web/src/pages/teacher/LobbyPage.tsx`（設計稿 T3：各組連線人數、開放第 1 題）
- [ ] T026 [P] [US1] 實作 `web/src/pages/student/JoinPage.tsx`（設計稿 S1：選組，第 1 題開放前可改選）
- [ ] T027 [US1] 實作 `web/src/pages/student/AnswerPage.tsx` 的等待與題目顯示（設計稿 S2、S3），依 T024
- [ ] T028 [US1] 實作 `web/src/pages/teacher/ConsolePage.tsx` 的開題、結束這一題、提前結束活動確認（設計稿 T4 的控制列、T5），依 T024

**Checkpoint**: 可以建立活動並逐題開放、結束，所有分頁同步

---

## Phase 4: User Story 2 - 依組別搶答並決定最快的組別 (Priority: P1)

**Goal**: 學生整組送出目前開放的題目，系統依接受順序給序號，結束時決定成功組別

**Independent Test**: 兩組幾乎同時送出同一題，只有一個成功組別，且是較早被接受的那一組

### Tests for User Story 2 ⚠️

- [ ] T029 [P] [US2] `server/tests/unit/buzz/BuzzEngine.test.ts`：接受時 `seq` 遞增、`receivedAt` 不倒退（AC-08）；同題兩組 → 不同序號、恰好一組成功（AC-09）；題組只填部分小題 → `INCOMPLETE_GROUP`（AC-10）；同組第二位成員 → `ALREADY_SUBMITTED`（AC-11）；同一 `submissionId` → `DUPLICATE` 並回傳第一次的結果、不取新序號（AC-12）；題目已結束 → `QUESTION_NOT_OPEN` 且不列入順位（AC-13）；空白答案 → `EMPTY_ANSWER`，超過 200 字 → `ANSWER_TOO_LONG`（AC-14）；指向已結束或未開放的題號 → `QUESTION_NOT_OPEN`（AC-31）
- [ ] T030 [P] [US2] `server/tests/unit/buzz/FirstArrivalPolicy.test.ts`（負責：A）：成功組別為序號最小者；沒有送出時 `winnerGroupId` 為 `null`；同一份紀錄重算結果相同（AC-28）
- [ ] T031 [P] [US2] `server/tests/integration/gateway.submit.test.ts`：兩組幾乎同時 `student:submit`，重複 100 次，每次 ack 都是 `ACCEPTED`、序號不同、恰好一個成功組別，且老師 view 的順位與搶答結果一致（SC-002）；ack 不含順位（AC-17）；結束後才到的送出回 `REJECTED`（AC-13）
- [ ] T032 [P] [US2] `web/src/pages/student/AnswerPage.submit.test.tsx`：送出後顯示「本組已送出第 n 題」與送出時間並鎖定輸入（AC-07）；網路重試沿用同一個 `submissionId`

### Implementation for User Story 2

- [ ] T033 [US2] 實作 `server/src/buzz/BuzzEngine.ts`：驗證（題目 `OPEN`、本組未送過、小題填齊、去空白後 1–200 字）→ `takeNextSeq()` → `SequenceClock.stamp()` → 寫入；`Map<submissionId, SubmitResult>` 去重（research R3），依 T004、T006
- [ ] T034 [P] [US2] 實作 `server/src/buzz/ranking.ts` 的 `RankingPolicy` 介面與 `FirstArrivalPolicy`（純函式）（負責：A）
- [ ] T035 [US2] 在 `server/src/buzz/ActivityService.ts` 加入 `submit`，並在 `closeQuestion` 時以 `RankingPolicy.resolve` 產生 `QuestionResult`，依 T033、T034
- [ ] T036 [US2] 在 `server/src/session/SessionGateway.ts` 處理 `student:submit`，以 ack 回覆 `SubmitResult`
- [ ] T037 [P] [US2] 建立 `web/src/components/QuestionCard.tsx`（題號、小題標籤、題目敘述、輸入框）與 `web/src/components/ResultCard.tsx`（成功組別與答案）
- [ ] T038 [US2] 在 `web/src/pages/student/AnswerPage.tsx` 實作整組送出（`crypto.randomUUID()`，重試沿用同一個 ID）、送出後鎖定，以及本題結束畫面（設計稿 S3b），依 T037

**Checkpoint**: 搶答核心流程可運作

---

## Phase 5: User Story 3 - 一題結束前學生看不到其他組別 (Priority: P1)

**Goal**: 資訊隔離在伺服器端執行

**Independent Test**: 一組送出後，另一組學生端收到的所有訊息都不含其他組別的作答資訊

### Tests for User Story 3 ⚠️

- [ ] T039 [P] [US3] `server/tests/unit/buzz/VisibilityFilter.student.test.ts`：`studentView` 只含 `phase`、`groupId`、`current`、`remainingSec`、本組 `ownSubmission`（沒有 `seq`）、已結束題目的 `PublicResult`；不含其他組的答案、是否已送出、數量、時間或順位（AC-15）
- [ ] T040 [P] [US3] `server/tests/integration/isolation.test.ts`：第 4 組的連線在第 2 組送出前後收到的所有 Socket.IO 訊息，序列化後搜尋不到其他組的答案、組別 ID 與序號（AC-16、SC-003）

### Implementation for User Story 3

- [ ] T041 [US3] 在 `server/src/buzz/VisibilityFilter.ts` 完成 `studentView`：只放入 `data-model.md` 列出的欄位（REQ-BUZ-16）
- [ ] T042 [US3] 在 `server/src/session/Broadcaster.ts` 確保學生連線只收到自己組別的 view，老師 view 只送到老師專用房間

**Checkpoint**: 隔離由伺服器端保證

---

## Phase 6: User Story 6 - 高併發下順位仍然正確 (Priority: P1)

**Goal**: 200 連線、1 秒 1,000 筆送出時不遺失、不給錯順位、回覆夠快，慢連線不影響別人

**Independent Test**: `npm run test:load -w packages/server` 重複 20 次全部通過

### Tests for User Story 6 ⚠️

- [ ] T043 [P] [US6] `server/tests/unit/session/Outbox.test.ts`：前一份 view 未被 ack 前只保留最新一份；送出回覆逐筆依序；某個連線不回 ack 時，其他連線照常收到（AC-26）
- [ ] T044 [P] [US6] 建立 `server/tests/load/buzz.load.ts`（負責：A）：依 `contracts/socket-events.md` 建立 1 個老師與 200 個學生連線（20 組 × 10），開題後 1 秒內送出 1,000 筆（含重複送出與同組搶同題）；檢查每筆恰好一次回覆、被接受的序號 1..N 連續不重複（AC-23）、成功組別為序號最小者且老師 view 與結果順位一致（AC-24）、回覆延遲 p95 ≤ 1 秒且最長 ≤ 2 秒（AC-25）、階段變更 1 秒內送達全部 201 個連線（SC-007）；模擬學生與伺服器在不同程序
- [ ] T045 [P] [US6] 在 `server/package.json` 加入 `test:load` script，重複執行 T044 共 20 次並彙整結果（負責：A）

### Implementation for User Story 6

- [ ] T046 [US6] 在 `server/src/session/Broadcaster.ts` 加入每連線一個 `Outbox`：view 只保留最新一份、以 ack 控制送出；老師 view 大量送出時每 200 ms 合併一次（research R4、REQ-BUZ-NFR-05）
- [ ] T047 [US6] 檢查 `server/src/buzz/CommandQueue.ts`、`server/src/buzz/ActivityService.ts`、`server/src/buzz/BuzzEngine.ts` 的臨界區沒有 `await`、沒有網路或檔案 I/O；推送與寫檔一律在處理完之後排程（REQ-BUZ-NFR-01、02）
- [ ] T048 [US6] 依 T044 的結果調整 `server/src/session/Broadcaster.ts`（例如推送合併間隔、序列化方式），直到 20 次全部通過（SC-006、SC-007），結果記在 `specs/002-buzzer-session/manual-verification.md`

**Checkpoint**: 時序與高併發需求驗證通過

---

## Phase 7: User Story 4 - 老師即時檢視作答狀況 (Priority: P2)

**Goal**: 控制台即時顯示目前題目的順位、答案、時間與各組狀態

**Independent Test**: 學生送出後，老師控制台 1 秒內出現該組的順位與答案

### Tests for User Story 4 ⚠️

- [ ] T049 [P] [US4] `server/tests/unit/buzz/VisibilityFilter.teacher.test.ts`：`teacherView` 含 `currentRanking`、`waitingGroups`、`remainingSec`、`closedResults` 與每組的 `onlineCount`、`submittedCount`（AC-19）
- [ ] T050 [P] [US4] `web/src/pages/teacher/ConsolePage.test.tsx`：收到新的 `view:teacher` 後更新順位列表與還沒送出的組別（AC-18）

### Implementation for User Story 4

- [ ] T051 [US4] 在 `server/src/buzz/VisibilityFilter.ts` 完成 `teacherView`，並由 `SessionGateway` 追蹤每組的連線人數
- [ ] T052 [US4] 完成 `web/src/pages/teacher/ConsolePage.tsx` 的即時順位、時間軸、題目進度與各組狀態（設計稿 T4）

**Checkpoint**: 老師控制台完整

---

## Phase 8: User Story 5 - 公平模式 (Priority: P3)

**Goal**: 開啟時，在視窗秒數內由搶到最少題的組別優先

**Independent Test**: 視窗 3 秒內，已搶到 2 題的組先送、0 題的組後送，結束時判給 0 題的組

### Tests for User Story 5 ⚠️

- [ ] T053 [P] [US5] `server/tests/unit/buzz/FairPolicy.test.ts`（負責：A）：視窗內由 `winsSoFar` 最少者成功（AC-20）；相隔超過視窗時由最早者成功（AC-21）；題數相同時由序號小者成功；視窗外的送出只保留順位；同一份紀錄重算結果相同（AC-28）
- [ ] T054 [P] [US5] 在 `server/tests/unit/buzz/ActivityService.lifecycle.test.ts` 加入：公平模式關閉時一律 `FirstArrivalPolicy`（AC-22）

### Implementation for User Story 5

- [ ] T055 [US5] 在 `server/src/buzz/ranking.ts` 實作 `FairPolicy(windowSeconds)`（純函式，research R7）（負責：A）
- [ ] T056 [US5] 在 `server/src/buzz/ActivityService.ts` 依 `fairMode.enabled` 選擇排名策略，並統計各組已搶到的題數

**Checkpoint**: 002 全部 User Story 完成

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T057 [P] 手動走一次「建立 → 作答 → 結束」完整流程，確認可在 5 分鐘 demo 中展示（SC-004），並確認學生從看到題目到送出不超過 2 個操作（SC-005），結果記在 `specs/002-buzzer-session/manual-verification.md`
- [ ] T058 依 `quickstart.md` 的 10 個情境進行人工驗證，結果記到 `specs/002-buzzer-session/manual-verification.md`（原則 VIII）
- [ ] T059 圖表一致性驗證：依 `plan.md` 的「藍圖對照」逐項比對程式，結果寫到 `specs/002-buzzer-session/diagram-verification.md`（原則 I、CLAUDE.md 步驟 7）

---

## Dependencies & Execution Order

### Phase Dependencies

- 共用骨架（001 tasks Phase 1、2）→ 002 Setup（Phase 1）→ Foundational（Phase 2）
- **US1（Phase 3）**：依賴 Phase 2
- **US2（Phase 4）**：依賴 US1 的 `ActivityService`、`SessionGateway`、`AnswerPage`
- **US3（Phase 5）**：依賴 US2（要有送出才能驗證隔離）
- **US6（Phase 6）**：依賴 US2、US3；壓力測試 T044、T045 可以從 Phase 2 結束後就先寫（只依賴事件契約）
- **US4（Phase 7）**：依賴 US2
- **US5（Phase 8）**：依賴 US2；`FairPolicy`（T053、T055）只依賴型別，可以從 Phase 2 結束後就先做
- **Polish（Phase 9）**：所有 Story 完成後

### Within Each User Story

- 測試先寫並確認失敗 → 領域與服務 → Gateway／路由 → 頁面
- 每個任務完成就 commit（測試任務用 `test`，實作任務用 `feat`）

### Parallel Opportunities

- A 的任務（T030、T034、T044、T045、T053、T055）只依賴型別與契約，可與 B 的任務同時進行
- 每個 Story 的測試任務可同時寫；頁面任務（T025、T026、T037）可平行

## Parallel Example: 兩人同時進行

```text
B：T004 → T007、T008 → T013、T014 → T018 → T019 → T022 → T029 → T033 → T035 …
A：T030 → T034；T053 → T055；T044 → T045（等 B 完成 US2、US3 後執行）
```

## Implementation Strategy

### MVP First

1. 共用骨架 → 002 Phase 1、2
2. US1 + US2：可以逐題開放並搶答
3. **停下來驗證**：quickstart 情境 1–4
4. US3、US6：隔離與高併發（P1，必須在整合日前完成）

### Incremental Delivery

US1 → US2 → US3 → US6 → US4 → US5 → Polish

## 需求追溯（REQ → Tasks）

| 需求 | 任務 |
| --- | --- |
| REQ-BUZ-01 兩種角色 | T012、T022、T026 |
| REQ-BUZ-02 只有老師能操作、老師身分只在一個分頁 | T009、T010、T012、T016、T022 |
| REQ-BUZ-03 組數 | T013、T015、T018、T025 |
| REQ-BUZ-04 選組與鎖定 | T013、T018、T026 |
| REQ-BUZ-05 階段與逐題開放 | T013、T018、T028 |
| REQ-BUZ-06 單一權威、主動通知 | T016、T020、T021 |
| REQ-BUZ-07 重新連線還原 | T012、T016、T022 |
| REQ-BUZ-08 只能送出目前題目、顯示題目 | T017、T027、T029 |
| REQ-BUZ-09 以組為單位、送出後不能改 | T029、T033、T038 |
| REQ-BUZ-10 題組整組送出 | T029、T033、T038 |
| REQ-BUZ-11 依接受先後、逐一處理 | T007、T008、T029、T033 |
| REQ-BUZ-12 成功組別 | T030、T034、T035 |
| REQ-BUZ-13 結束後拒絕 | T029、T031 |
| REQ-BUZ-14 重複送出只記一次 | T029、T033 |
| REQ-BUZ-15 答案驗證 | T029、T033 |
| REQ-BUZ-16 學生資訊隔離 | T039、T040、T041、T042 |
| REQ-BUZ-17 公平模式 | T053、T054、T055、T056 |
| REQ-BUZ-18 老師即時畫面 | T049、T050、T051、T052 |
| REQ-BUZ-19 每題結果與推送 | T016、T018、T035 |
| REQ-BUZ-20 同一時間一個活動 | T015、T023 |
| REQ-BUZ-21 提前結束活動 | T013、T018、T028 |
| REQ-BUZ-22 每題倒數 | T014、T019、T024 |
| REQ-BUZ-NFR-01 嚴格全序 | T007、T008、T044、T047 |
| REQ-BUZ-NFR-02 接受時間不倒退 | T005、T006、T047 |
| REQ-BUZ-NFR-03 各處順位一致、可重算 | T030、T044、T053 |
| REQ-BUZ-NFR-04 200 連線、1,000 筆 | T044、T045、T048 |
| REQ-BUZ-NFR-05 慢連線不影響他人 | T043、T046 |
