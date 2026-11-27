---
description: "Task list for 005 搶答與判定"
---

# Tasks: 搶答與判定

**Input**: Design documents from `specs/005-buzz-submission/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；001–004 已合併（以 `main` 目前的版本為準）（含 004 的 `CommandQueue`、`SequenceClock`、`ActivityStore`、`GroupMembership`、`ActivityManager`、`RealtimeClient`，與 002 的 `buildApp`、`app.io`、`TEACHER_ROOM`、`app.requireTeacher`、`ApiClient`）。005 不需要 001 再改頁面；只有 T035 要等 001 把 `Submission.rank` 改成可選

**Tests**: constitution 原則 VIII 要求每個 User Story 至少一個正常案例與一個邊界案例的自動化測試；US4 另有壓力測試。測試先寫、先確認失敗，再實作。

**Organization**: 依 User Story 分 Phase：US1（送出、同組組員跟著切換、老師看到列表）、US2（依序判定）、US3（資訊隔離）、US4（高併發）都是 P1。AC-26（說明文字）的檢查在 Polish 的端對端測試中，因為文字由 001 依 feature-split 3.2 寫在頁面上。

**換綁時機（2026-11-27）**：每個 User Story 的 Phase 結尾都要在瀏覽器人工驗證，所以組合根換綁（T024）提前到 US1：Phase 3 完成後，學生送出與老師的答案列表（AC-03、AC-09）都走真正的實作。老師判定在 Phase 4 才完成；Phase 3 結束時按「接受」「不接受」，共通錯誤訊息區會顯示「判定功能尚未完成（005 Phase 4）」，列表與階段不變（2026-11-27 使用者決定：暫時回傳錯誤，不把判定提前，也不交給模擬實作）；這段期間以 004 的「結束這一題」結束題目、開放下一題。US1 的人工驗證不操作判定。這段暫時的程式只存在於 Phase 3 與 Phase 4 之間，T023 移除，不會合併進 `main`。001 的測試隨換綁分兩批改走法（T041 在 Phase 3、T043 在 Phase 4）。

**頁面確認（CLAUDE.md 第 2 節步驟 6）**：005 不新增也不修改頁面（spec Assumptions），每個 Phase 寫測試前的「列出按鈕配置與顯示文字」不適用；各 Phase 的 E2E 與人工驗證只檢查 001 現有頁面上的文字。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1–US4）
- 伺服器程式在 `server/src/submission/`，測試在 `server/tests/`；前端在 `frontend/`

---

## Phase 1: Setup

**Purpose**: 共用型別與測試工具

- [X] T001 [P] 建立 `shared/src/submissionEvents.ts`：`SubmitRequest`（`questionNumber: number`、`answers: string[]`、`requestId: string`）、`SubmitReply`（`ok: boolean`、`submission?: Submission`、`error?: ValidationError`）、`OwnSubmissionRequest`（`questionNumber: number`）、`OwnSubmissionReply`（`submission: Submission | null`）、`JudgeRequest`（`groupNumber: number`、`judgement: Judgement`）、`SubmissionsChanged`（`questionNumber`、`submissions: Submission[]`）、`GroupSubmitted`（`submission`）、`SubmissionJudged`（`submission`），以及事件名稱常數 `SUBMIT = "submission:submit"`、`OWN = "submission:own"`、`SUBMISSIONS_CHANGED = "submissions:changed"`、`GROUP_SUBMITTED = "submission:groupSubmitted"`、`JUDGED = "submission:judged"`，依 data-model 第 2 節；`JudgeOutcome` 直接用 001 `shared/src/entities.ts` 的定義
- [X] T002 [P] 在 `server/package.json` 加入 script `test:load:submission`（`tsx tests/load/submission.load.ts --runs 20`，命名沿用 004 的 `test:load:activity`）；`socket.io-client` 已是 devDependency，不再加入
- [X] T003 [P] 擴充 004 的 `server/tests/helpers/activityTestServer.ts`，不另寫測試伺服器（research RD-11）：加入 `groupQuestionImport()`（第 1 題為含 2 個小題的題組、其餘為單題，作為 `importResult` 傳入）與 `waitForEvent(socket, event, predicate, timeoutMs)`；老師憑證、`rotateTeacher()`、`connectTeacher`、`connectStudent`、`emitWithAck` 沿用既有的（plan 交界假設 A-6）

---

## Phase 2: Foundational

**Purpose**: 資料、角色視角、推播與活動狀態的訂閱；所有 Story 都依賴這些。佇列與時鐘用 004 的 `CommandQueue`、`SequenceClock`，005 不另建

**⚠️ CRITICAL**: 這個 Phase 完成前不開始 User Story

- [X] T004 [P] `server/tests/unit/submission/SubmissionStore.test.ts`：`append` 後 `list` 依 `rank` 排序；第一次 `append` 時建立該題；`byGroup`、`firstPending` 正確；`closeQuestion` 把 `PENDING` 改為 `UNJUDGED`、其他狀態不變；`winner` 回傳 `ACCEPTED` 那一筆或 `null`；沒有該題時 `list` 回 `[]`（contracts/submission-store.md）
- [X] T005 實作 `server/src/submission/SubmissionStore.ts`：`SubmissionStore`（`question`、`append`、`closeQuestion`、`list`、`winner`）、`QuestionSubmissions`（`byGroup`、`firstPending`）、`SubmissionRecord`，依 data-model 第 4 節，依 T004
- [X] T006 [P] `server/tests/unit/submission/SubmissionVisibility.test.ts`：`forTeacher` 的 `rank` 為紀錄的順位；`forStudent` 的 `rank` 一律為 0，其他欄位與 `forTeacher` 相同（REQ-SUB-16）
- [X] T007 實作 `server/src/submission/SubmissionVisibility.ts`，依 T006；`SubmissionStore.list`、`winner` 改用 `forTeacher`
- [X] T008 [P] `server/tests/unit/submission/SubmissionNotifier.test.ts`（假計時器、假的 io、假的 `GroupMembership`）：三個方法被呼叫的當下都不 `emit`，要等 `setImmediate` 之後才送出（research RD-05、004 RA-04）；`submissionsChanged` 第一次在 `setImmediate` 之後送到 `io.to(TEACHER_ROOM)`，200 ms 內多次只在視窗結束時再送一次最新完整列表；`groupSubmitted`、`judged` 在 `setImmediate` 之後送給 `groupOf(socket) === n` 的連線、其他連線收不到，payload 的 `rank` 為 0；`UNJUDGED` 不送判定通知（REQ-SUB-15、REQ-SUB-20）
- [X] T009 實作 `server/src/submission/SubmissionNotifier.ts`：所有推送以 `setImmediate` 排程，不在呼叫當下 `emit`；老師列表 200 ms 合併送 `app.io.to(TEACHER_ROOM)`；`groupSubmitted`、`judged` 掃描 `app.io` 的連線、送給 `groupOf(socket) === n` 者；`emit` 不等待回應（research RD-05），依 T008
- [X] T010 [P] `server/tests/unit/submission/SubmissionEngine.activity.test.ts`：以假的 `ActivityStore`（`subscribe` 的 listener 由測試以版本號 `(version: number)` 呼叫，狀態由 `current()` 提供）通知：第 n 題不再開放（`QUESTION_ENDED`、`FINISHED`、開放下一題）時呼叫 `closeQuestion(n)` 並通知 `SubmissionNotifier.submissionsChanged(n)`（REQ-SUB-14）
- [X] T011 實作 `server/src/submission/SubmissionEngine.ts` 的建構子與 `onActivityChange`，並建立 `server/src/submission/index.ts` 的 `submissionRoutes`（Fastify plugin）：建立 `SubmissionStore`、`SubmissionVisibility`、`SubmissionNotifier`、`SubmissionEngine`（從 004 的 `app.activity` 取得 `queue`、`clock`、`store`、`membership`、`manager`），以 `ActivityStore.subscribe` 註冊 `onActivityChange(version)`（以 `store.current()` 讀狀態）；在 002 的 `buildApp`（`server/src/app.ts`）於 `createActivityModule` 之後加一行 `app.register(submissionRoutes)`（plan 交界假設 A-1、A-2），依 T005、T007、T009、T010

**Checkpoint**: 資料、角色視角、推播與活動訂閱就緒

---

## Phase 3: User Story 1 - 學生以組別整組送出 (Priority: P1) 🎯 MVP

**Goal**: 學生整組送出目前開放的題目，伺服器依連線判斷組別、驗證、取得順位；同組其他分頁跟著切到等待判定頁；加入時可取得本組送出；老師看到依順位排列的答案列表（AC-03、AC-09）；組合根換綁到真正的實作

**Independent Test**: 1 個老師、3 個學生連線（2 組），送出、同組同時送出、空白答案、組員送出後才加入，伺服器每組只接受一筆、空白被拒絕、同組分頁收到通知

### Tests for User Story 1 ⚠️

- [X] T012 [P] [US1] `server/tests/unit/submission/SubmissionEngine.submit.test.ts`：接受時 `rank` 從 1 遞增、`judgement = PENDING`、回覆的 `rank` 為 0（AC-01）；某格空白或只有空白字元 → `field: "answers.<i>"`「每一格都填才能送出」（AC-02）；題組兩格共用一筆一個 `rank`，格數不等於小題數 → `field: "answers"`「送出的資料格式不正確」（AC-03）；同組不同 `requestId` → `field: "answers"`「本組已送出此題」（AC-04）；同一 `requestId` → 回第一次的結果、不新增紀錄、不再通知 `groupSubmitted`（AC-05）；題目未開放、已結束、題號不是目前開放的題 → 「這一題目前不能作答」且不取 `rank`（AC-06）；超過 200 字 → `field: "answers.<i>"`「每一格最多 200 字」（AC-07）；`REJECTED` 的組再送 → 「本組已送出此題」（AC-08）；`group` 為空 → 「請先加入組別」；接受時通知 `SubmissionNotifier.groupSubmitted` 一次（AC-27）；`ownSubmission(group, q)` 回傳本組紀錄（`rank` 0、目前的 `judgement`）或空（AC-28）；保存去除前後空白後的答案；`elapsedMs = SequenceClock.stamp() − ActivityState.openedAt.get(n)`；以假的 `performance.now` 讓時間往回走時，後處理的送出 `elapsedMs` 不小於先處理的（AC-23、REQ-SUB-NFR-03）；`submit` 在 004 真正的 `CommandQueue.run` 內執行、`processed` 每筆加 1。（2026-11-27 使用者決定：補上陣列取值的型別寫法讓 `npm run typecheck` 通過，斷言不變）
- [X] T013 [P] [US1] `server/tests/integration/submission/gateway.submit.test.ts`：真的 Socket.IO 連線送 `submission:submit`，組別取自 `GroupMembership.groupOf(socket)`，payload 夾帶 `groupNumber` 被忽略（AC-19）；ack 為 `SubmitReply`；同組兩條連線同時送出只有一筆 `ok`，另一條收到「本組已送出此題」，兩條都收到 `submission:groupSubmitted`（AC-04）；同組另一條連線 1 秒內收到 `submission:groupSubmitted`，別組連線收不到（AC-27）；`submission:own` 回傳本組的送出（待判定、被拒絕後為 `REJECTED`），沒有送出或沒有加入組別時為 `null`，payload 指定別組也只回本組（AC-28、AC-19）；004 結束題目之後才處理的送出被拒絕，結束之前處理的送出有效並變成 `UNJUDGED`，重複 100 次（AC-25）。（2026-11-27 使用者決定：「被拒絕後為 `REJECTED`」要用 Phase 4 的判定路由，在 T022 完成前暫時 skip，T022 時打開）。（2026-11-27 使用者決定：AC-25 的 100 輪每輪啟動新的測試伺服器，因為 004 在第 1 題開放後不能取消活動）
- [X] T037 [P] [US1] `server/tests/integration/submission/routes.list.test.ts`：`GET /api/questions/:n/submissions` 依 `rank` 回傳老師視角列表，題組一筆一列、兩個小題的答案（AC-03），`n` 不是正整數回 400；沒有或錯誤的老師憑證由 `app.requireTeacher` 拒絕（AC-16）；學生送出後老師連線 1 秒內收到 `submissions:changed`（AC-09）；學生連線收不到 `submissions:changed`
- [X] T038 [P] [US1] `frontend/tests/unit/ServerSubmissionService.teacher.test.ts`（既有的 `frontend/tests/helpers/fakeRealtimeClient.ts` 與假的 `ApiClient`）：`listSubmissions` 先呼叫 `followTeacherCredential()` 再呼叫正確的路徑並回傳列表；`ApiClient` reject 時原樣 reject；`onSubmissionsChange(q)` 先呼叫 `followTeacherCredential()`，只轉交題號 q 的列表，`onConnect` 觸發時重新 `listSubmissions(q)` 並通知；取消訂閱後不再通知（research RD-08）；`judge` 在 Phase 4 之前不送出任何請求、不呼叫 `ApiClient`，以 `UnexpectedError`「判定功能尚未完成（005 Phase 4）」reject（T023 實作 `judge` 時刪除這個案例）
- [X] T047 [P] [US1] `server/tests/unit/submission/SubmissionEngine.activity.test.ts`、`SubmissionStore.test.ts`：活動消失（`commit(null)`）後 `SubmissionStore` 沒有任何送出，之後新活動同一組可以再送第 1 題（spec Edge Cases「活動消失」，2026-11-27）
- [X] T014 [P] [US1] `frontend/tests/unit/ServerSubmissionService.student.test.ts`（既有的 `frontend/tests/helpers/fakeRealtimeClient.ts`）：`submitAnswer` 的 `ok` 回 `Submission`、否則回 `ValidationError`；同一題進行中再呼叫回傳同一個 Promise、只 emit 一次（AC-05）；`emitWithAck` 逾時 reject 時原樣 reject；逾時後以相同題號與答案再送沿用同一個 `requestId`；`getGroupSubmission(q)` 送 `submission:own` 並回傳 `submission` 或 `null`；`onGroupSubmitted`、`onJudgement` 轉交對應事件；`onConnect` 觸發時以最近的題號重新 `getGroupSubmission`，有送出時通知 `onGroupSubmitted` 的訂閱、`REJECTED` 時通知 `onJudgement` 的訂閱；取消訂閱後不再通知

### Implementation for User Story 1

- [X] T015 [US1] 在 `server/src/submission/SubmissionEngine.ts` 實作 `submit`、`validate`、`ownSubmission`：檢查順序、`field` 與訊息依 data-model 第 4 節（「每一格都填才能送出」「每一格最多 200 字」「本組已送出此題」「這一題目前不能作答」「請先加入組別」「送出的資料格式不正確」）；小題數取自 `ActivityStore.current()` 的題目；`rank` = 本題紀錄數 + 1；`acceptedAt = sequenceClock.stamp()`；`processed` 加 1；回覆以 `forStudent` 產生；新紀錄建立後通知 `groupSubmitted` 與 `submissionsChanged`，依 T011、T012
- [X] T048 [US1] 在 `server/src/submission/SubmissionStore.ts` 加入 `clear()`，`SubmissionEngine.onActivityChange` 在 `ActivityStore.current()` 為空時呼叫；E2E 每個測試的 `/test/reset` 因此不留下前一個測試的送出，依 T047
- [X] T016 [US1] 實作 `server/src/submission/SubmissionGateway.ts`：`register(app.io)` 監聽 `SUBMIT`、`OWN`；`onSubmit` 以 `groupOf(socket)` 取得組別，只讀 `questionNumber`、`answers`、`requestId`，`commandQueue.run(() => engine.submit(group, request))` 後以 ack 回覆；`onOwn` 以 `groupOf(socket)` 與 `questionNumber` 呼叫 `engine.ownSubmission`；在 `submissionRoutes` 中註冊，依 T013、T015
- [X] T017 [US1] 實作 `frontend/src/services/server/ServerSubmissionService.ts` 的學生端方法：`submitAnswer`（`inFlight`、`lastRequest`、`crypto.randomUUID()`、`RealtimeClient.emitWithAck`，research RD-04）、`getGroupSubmission`（`emitWithAck(OWN, …)`）、`onGroupSubmitted`（`RealtimeClient.on(GROUP_SUBMITTED, …)`）、`onJudgement`（`RealtimeClient.on(JUDGED, …)`），並以 `lastQuestion` 在 `onConnect` 時補發（research RD-08），依 T001、T014
- [X] T039 [US1] 實作 `server/src/submission/SubmissionRoutes.ts` 的 `GET /api/questions/:n/submissions`（`{ preHandler: app.requireTeacher }`，400 `INVALID_QUESTION_NUMBER`，回傳 `SubmissionStore.list(n)`）；在 `submissionRoutes` 中註冊；把這個路由加進 002 T043 的老師路由清單測試（plan 交界假設 A-5），依 T037
- [X] T040 [US1] 在 `frontend/src/services/server/ServerSubmissionService.ts` 實作 `listSubmissions`、`onSubmissionsChange`（開頭 `realtime.followTeacherCredential()`；002 `ApiClient.request`；`RealtimeClient.on`，`onConnect` 時重新讀取）；`judge` 在 Phase 4 實作，這之前不送出任何請求，以 `UnexpectedError`（`new Error("判定功能尚未完成（005 Phase 4）")`，與 004 `HttpActivityService` 的寫法相同）reject；001 的控制台把它顯示在共通錯誤訊息區，列表與階段不變，依 T038
- [X] T024 [US1] 修改 `frontend/src/services/createServiceRegistry.ts`（research RD-08）：`submission` 綁定 `ServerSubmissionService`（注入 004 的 `RealtimeClient` 與 002 的 `ApiClient`）；移除 `judgementControl`、`submissionValidationControl`、`teammateControl`；`mockBound` 移除 `submission`；刪除 004 橋接（`bridgeMocksToActivity`）中跟送出有關的部分：包住 `submission.judge` 的那一層、包住 `joinGroup`／`leaveGroup` 寫入 `MockSession.joinedGroup` 的那一層、`session.setViewerPhaseAdvancer(() => {})`；保留寫入 `MockSession.teacherActivity` 的部分與 003 的 `lastImport` 包裝（`MockResultService` 仍要讀，006 後刪）；不為結果頁另做橋接（spec Assumptions 已知限制），依 T017、T040
- [X] T041 [US1] 依 research RD-08，仿照 004 T061 讓 001 中跟送出有關的測試接上真的測試伺服器：修改 `frontend/tests/e2e/` 的走法輔助檔（`us5-walk.ts` 等），學生真的送出，「模擬：同組組員送出」改為另一個學生連線經測試伺服器送出，送出的「模擬：驗證失敗」改為送出空白格；涉及 `us4-student.spec.ts`、`us5-mock-controls.spec.ts`、`us5-screen-flow.spec.ts`、`us5-removed-elements.spec.ts` 中不需要判定的部分，以及 `frontend/tests/unit/createServiceRegistry.test.ts`、`frontend/tests/component/MockControlBar.test.tsx`。只改走法與輔助檔，不修改 001 的頁面程式與既有斷言；只驗證已移除的模擬控制本身的測試，以及必須改斷言才能通過的測試（例如 `createServiceRegistry.test.ts` 檢查三個控制存在、`us4-student.spec.ts` 檢查訊息「模擬：驗證失敗」），先列出由使用者決定，依 T024
  - （2026-11-27 使用者決定）範圍擴大到 `us3-hosting.spec.ts`、`us5-unexpected-error.spec.ts`，並依下列方式處理：
    - 改走法：「模擬：同組組員送出」改由走法輔助檔以另一條學生連線經測試伺服器送出（`us5-screen-flow` S7）；`us5-unexpected-error` 的 S-Answer 改為讓測試伺服器收不到 `submission:submit`，預期訊息改為「連不上伺服器，請確認伺服器已啟動」（同 004 對活動的處理）。
    - 改斷言：`us4-student`「a validation failure」與 `us5-screen-flow` S5 改為送出空白格，預期訊息改為「每一格都填才能送出」；`us5-mock-controls` 的 S-Answer 只剩「模擬：非預期錯誤」、S-Submitted 沒有控制列；`createServiceRegistry.test.ts` 第一個案例改為 `submission` 是 `ServerSubmissionService`、三個控制不存在。
    - 刪除：`us5-mock-controls`「AC-8: 模擬：驗證失敗」；`createServiceRegistry.test.ts` 中測 MockSession 組別與模擬判定橋接的案例（加入、離開組別、取消活動時忘記組別、模擬判定接受與不接受）。
    - 暫時 skip，到 T043 處理：需要判定或老師列表資料的測試，即 `us3-hosting` 兩個案例；`us4-student` Q7；`us5-mock-controls` 的 S-Rejected 與 AC-5 三個案例；`us5-screen-flow` 的「T-Live → T-QuestionEnd：接受」「T-Live → T-Results：接受」、T13、「S-Open（S-Submitted 不接受）」「S-Submitted → S-QuestionDone：接受」「S-Submitted → S-Submitted（不接受）」、S6；`us5-removed-elements` 的「student pages」。T043 時再逐一決定恢復、改斷言，或等 006。理由：判定在 Phase 4 才完成，不 skip 的話 Phase 3 結束時一定有測試失敗。
- [ ] T042 [US1] 人工驗證：依 quickstart「US1」情境 1–4 在瀏覽器操作，結果記在 `specs/005-buzz-submission/manual-verification.md`（原則 VIII），依 T024

**Checkpoint**: 學生可以送出，伺服器記錄順位，同組分頁跟著切換，老師看到答案列表；組合根已換綁，001 的測試接上測試伺服器

---

## Phase 4: User Story 2 - 老師依送出順序判定 (Priority: P1)

**Goal**: 老師依順位檢視並判定；接受後自動結束本題，`judge` 回傳結束後的活動；不接受的組停在等待判定頁、不能重送

**Independent Test**: 3 組依序送出，老師拒絕 #1、嘗試判定 #3、接受 #2，檢查順序、自動結束、`JudgeOutcome` 與各組判定狀態

### Tests for User Story 2 ⚠️

- [ ] T018 [P] [US2] `server/tests/unit/submission/SubmissionEngine.judge.test.ts`（004 真正的 `CommandQueue`、假的 `ActivityStore` 與 `ActivityManager`）：判定不是 `firstPending` 的組 → 狀態不變，回傳的 `JudgeOutcome.submissions` 為目前列表、`activity` 為 `snapshot(Audience.TEACHER).activity`（AC-10）；`REJECTED` 後下一筆成為 `firstPending`、`activity.phase` 仍為 `OPEN`（AC-11）；`ACCEPTED` → 設 `winnerGroup`、在同一次 `CommandQueue.run` 中呼叫一次 `ActivityManager.endQuestion(n)`，假的 `ActivityStore` 呼叫 listener 後其餘 `PENDING` 變 `UNJUDGED`，回傳的 `activity.phase` 為 `QUESTION_ENDED`（最後一題 `FINISHED`）（AC-12、AC-15）；全部拒絕或沒有送出時 `winner` 為 `null`（AC-13）；題目已結束、已有 `ACCEPTED`、題號不是目前開放的題、組別沒有紀錄時都不改變狀態（SC-007）
- [ ] T019 [P] [US2] `server/tests/integration/submission/routes.judge.test.ts`：`POST /api/questions/:n/judgements` 依 contracts/submission-api.md 第 3 節回傳 `JudgeOutcome`，格式錯誤回 400、沒有活動回 409，body 為 `{ code, message }`；沒有或錯誤的老師憑證由 `app.requireTeacher` 拒絕（AC-16）；以 `rotateTeacher()` 模擬老師重新登入：舊憑證的判定被拒絕且狀態不變，新憑證的 `GET` 回傳含目前判定狀態的完整列表、新老師連線收到之後的 `submissions:changed`、可以繼續判定（AC-29）；接受後回傳的 `activity.phase` 為 `QUESTION_ENDED`（最後一題 `FINISHED`），所有學生連線 1 秒內收到 004 的階段改變（AC-12、SC-005）；被拒絕的組的所有連線收到 `judgement = REJECTED` 的 `submission:judged`，排在後面的組沒有收到（AC-11、AC-15）；「兩組幾乎同時送出」重複 100 次，每次 `rank` 不重複、先處理者為 #1、老師列表與 `SubmissionStore.list` 一致（SC-001）
- [ ] T020 [P] [US2] 在 `frontend/tests/unit/ServerSubmissionService.teacher.test.ts` 加入 `judge`：先呼叫 `followTeacherCredential()`，送 `POST /api/questions/:q/judgements`，回傳 `JudgeOutcome`（`submissions`、`activity`）；`ApiClient` reject 時原樣 reject

### Implementation for User Story 2

- [ ] T021 [US2] 在 `server/src/submission/SubmissionEngine.ts` 實作 `judge`（research RD-07）：條件不成立時不改變狀態；`ACCEPTED` 時標記並設 `winnerGroup`，在同一個 `CommandQueue.run` 內呼叫 004 的 `ActivityManager.endQuestion(n)`（呼叫前已確認第 n 題開放中，不會丟 `ActivityRuleError`；plan 交界假設 A-2、A-4）；`REJECTED` 時標記；最後回傳 `{ submissions: store.list(n), activity: activityManager.snapshot(Audience.TEACHER).activity }`（plan 交界假設 A-3）；處理後通知 `SubmissionNotifier.judged`、`submissionsChanged`，依 T018
- [ ] T022 [US2] 在 `server/src/submission/SubmissionRoutes.ts` 加入 `POST /api/questions/:n/judgements`：`{ preHandler: app.requireTeacher }`，錯誤回 002 的 `{ code, message }`（400 `INVALID_QUESTION_NUMBER`、`INVALID_JUDGEMENT`；409 `NO_ACTIVITY`），判定經 `commandQueue.run(() => engine.judge(…))`；把這個路由加進 002 T043 的老師路由清單測試（plan 交界假設 A-5），依 T019、T021、T039
- [ ] T023 [US2] 在 `frontend/src/services/server/ServerSubmissionService.ts` 實作 `judge`（開頭 `realtime.followTeacherCredential()`；002 `ApiClient.request`，回傳 `JudgeOutcome`），取代 T040 留下的暫時錯誤，並刪除 T038 中對應的測試案例；完成後全文搜尋確認「判定功能尚未完成」已不存在，依 T020
- [ ] T043 [US2] 接續 T041，讓 001 中需要判定的測試接上測試伺服器：「模擬：接受」「模擬：不接受」改為由走法輔助檔直接呼叫測試伺服器的 `POST /api/questions/:n/judgements`（學生分頁的走法）或在老師頁面按「接受」「不接受」（老師頁面的走法）；涉及 `us4-student.spec.ts`、`us5-mock-controls.spec.ts`、`us5-screen-flow.spec.ts`、`us5-removed-elements.spec.ts` 中需要判定的部分。只改走法，不修改 001 的頁面與既有斷言；必須改斷言才能通過的測試先列出由使用者決定，依 T022、T023。先打開 T041 中暫時 skip 的測試（2026-11-27），再依本任務改走法
- [ ] T044 [US2] 人工驗證：依 quickstart「US2」情境 5–11 在瀏覽器操作（含老師重新登入 AC-29、結果頁的已知限制），結果記在 `specs/005-buzz-submission/manual-verification.md`，依 T043

**Checkpoint**: 搶答與判定完整可用，001 的測試全部接上測試伺服器

---

## Phase 5: User Story 3 - 作答期間學生看不到其他組 (Priority: P1)

**Goal**: 資訊隔離在伺服器端執行

**Independent Test**: 第 2 組送出後，第 4 組連線收到的所有訊息中沒有其他組資料，學生收到的 `rank` 全為 0

### Tests for User Story 3 ⚠️

- [ ] T025 [P] [US3] `server/tests/integration/submission/isolation.test.ts`：第 4 組連線在第 2 組送出、老師判定第 2 組前後收到的所有 Socket.IO 訊息，序列化後找不到第 2 組的答案與組別編號（AC-17、SC-004）；第 2 組連線收到的 `submit` ack、`submission:own` ack、`submission:groupSubmitted`、`submission:judged` 中 `rank` 全為 0（AC-18）；學生連線不帶老師憑證呼叫兩個 HTTP 路由被拒絕，也收不到 `submissions:changed`（AC-16、AC-19）

### Implementation for User Story 3

- [ ] T026 [US3] 檢查並修正 `server/src/submission/SubmissionGateway.ts`、`server/src/submission/SubmissionEngine.ts`、`server/src/submission/SubmissionNotifier.ts`：學生只會收到經 `forStudent` 產生的資料；`SUBMISSIONS_CHANGED` 只 emit 到 `app.io.to(TEACHER_ROOM)`；沒有任何事件以 `io.emit` 廣播給所有連線（REQ-SUB-16），依 T025
- [ ] T045 [US3] 人工驗證：依 quickstart「US3」情境 12–13 在瀏覽器操作，結果記在 `specs/005-buzz-submission/manual-verification.md`，依 T026

**Checkpoint**: 隔離由伺服器端保證

---

## Phase 6: User Story 4 - 高併發下順序仍然正確 (Priority: P1)

**Goal**: 200 個學生連線、1 秒 1,000 筆送出時不遺失、不給錯順位、回覆夠快，慢連線不影響別人

**Independent Test**: `npm run test:load:submission -w server` 20 輪全部通過

### Tests for User Story 4 ⚠️

- [ ] T027 [P] [US4] 建立 `server/tests/load/submission.load.ts`（research RD-10）：子程序啟動伺服器並把 pino 輸出到暫存檔；1 個老師與 200 個學生連線（20 組 × 10，只用 WebSocket）；1 秒內 1,000 筆送出，含同一 `requestId` 重送與同組多條連線搶送；檢查每筆恰好一個 ack、每組恰好一筆被接受且是 log 中該組 `seq` 最小者、老師端 `rank` 為 1..20、學生收到的 `rank` 全為 0、每條學生連線恰好收到一次自己組的 `submission:groupSubmitted`（AC-20）；ack 延遲 p95 ≤ 1 秒、最大 ≤ 2 秒，老師列表落後 ≤ 1 秒（AC-21）；老師最後一份列表、`GET` 列表、log 的順位一致（AC-22）；另開一個暫停讀取的慢連線，其他連線延遲仍在範圍內（AC-24）；重複 20 輪並輸出每輪的 p95、最大延遲與被接受筆數（SC-002、SC-003）

### Implementation for User Story 4

- [ ] T028 [US4] 在 `server/src/submission/SubmissionEngine.ts` 加入 pino log（002 的 logger）：`submission.accepted`（`seq` = `processed`、`questionNumber`、`groupNumber`、`rank`、`elapsedMs`、`requestId`）、`submission.duplicate`、`submission.rejected`（`seq`、`reason`）、`judgement.applied`、`judgement.ignored`；不記錄答案與憑證（research RD-09、AC-22）
- [ ] T029 [US4] 檢查 `server/src/submission/` 中在 004 `CommandQueue.run` 內執行的程式（`submit`、`judge`、`onActivityChange`）沒有 `await`、沒有任何 `emit`（推送都經 `SubmissionNotifier` 以 `setImmediate` 排程）、沒有檔案 I/O；`run` 內只允許改 `SubmissionStore`、排程推送與寫 log（REQ-SUB-07、REQ-SUB-NFR-01、004 RA-04），依 T027、T028
- [ ] T030 [US4] 依 T027 的結果調整 `server/src/submission/SubmissionNotifier.ts`（例如合併間隔、序列化方式），直到 20 輪全部通過；結果記在 `specs/005-buzz-submission/load-test.md`（同 004：壓力測試是自動化量測，不放進人工驗證紀錄；REQ-SUB-NFR-02、NFR-04）
- [ ] T046 [US4] 人工驗證：依 quickstart「US4」情境 14–16 在瀏覽器操作，結果記在 `specs/005-buzz-submission/manual-verification.md`，依 T030

**Checkpoint**: 高併發下順序與延遲達標

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T031 [P] 在 `frontend/tests/e2e/submission-texts.spec.ts` 檢查：T-Setup 摘要的成功規則說明有「老師依送出順序判定，第一個被接受的組別搶答成功」與「每組每題只能送出一次，被拒絕後不能重送」（AC-26、REQ-SUB-18）。文字由 001 依 feature-split 3.2 寫在頁面上；005 不改頁面。若文字不符，回報給 001，不在 005 修改
- [ ] T032 [P] `frontend/tests/e2e/submission.spec.ts`（Playwright，1 個老師分頁、4 個學生分頁）：依 quickstart 人工驗證情境 1–9 自動化，照 001 最終版的頁面行為：空白格送出後第一個答案欄旁出現「每一格都填才能送出」（AC-02）、同組同時送出後兩人都在等待判定頁（AC-04、AC-27）、題組一列兩個答案（AC-03、AC-09）、只有 #1 可判定（AC-10）、拒絕後該組停在等待判定頁的不接受狀態且沒有送出按鈕（AC-08、AC-11）、新分頁加入已送出的組直接進入等待判定頁（AC-28）、接受後 1 秒內老師到 T-QuestionEnd、學生到 S-QuestionDone（AC-12）、手動結束後未判定（AC-14）；擷取學生分頁的 WebSocket 訊息確認沒有他組資料、`rank` 全為 0（AC-17、AC-18）
- [ ] T033 依 `specs/005-buzz-submission/quickstart.md` 執行所有自動化測試（含 001–004 既有的測試），並把人工驗證情境 1–16 從頭走一次，結果寫入 `specs/005-buzz-submission/manual-verification.md`（原則 VIII）
- [ ] T034 圖表一致性驗證：比對 `server/src/submission/`、`frontend/src/services/server/ServerSubmissionService.ts`、`shared/src/submissionEvents.ts` 與 `diagrams/005-*.puml` 的組件、類別、方法與呼叫順序，結果寫入 `specs/005-buzz-submission/diagram-verification.md`（原則 I）
- [ ] T035 （等 001 把 `Submission.rank` 改成可選後才做）修改 `server/src/submission/SubmissionVisibility.ts` 的 `forStudent` 為不放 `rank`，並把 T006、T025、T027 中「學生的 `rank` 為 0」的檢查改成「學生的資料沒有 `rank` 屬性」（spec「需請 001 修改」、research RD-06）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：沒有相依，可立即開始
- **Foundational（Phase 2）**：依賴 Setup；阻擋所有 User Story
- **US1（Phase 3）**：依賴 Foundational
- **US1（Phase 3）內**：T024 依賴 T017、T040；T041、T042 依賴 T024
- **US2（Phase 4）**：依賴 US1（判定需要送出）；T043 依賴 T022、T023；T044 依賴 T043
- **US3（Phase 5）**：依賴 US1、US2（要有送出與判定才能檢查隔離）
- **US4（Phase 6）**：依賴 US1、US2
- **Polish（Phase 7）**：依賴全部 User Story；T035 另依賴 001 修改 `Submission.rank`

### Within Each User Story

- 測試先寫並確認失敗，再實作
- `SubmissionEngine` → Gateway／Routes → 前端服務 → 組合根綁定 → 001 測試改走法 → 人工驗證（每個 User Story 的最後一個任務）

### Parallel Opportunities

- T001、T002、T003 可平行
- T004、T006、T008、T010 可平行；對應的實作 T005、T007、T009 可平行
- US1 的 T012、T013、T014、T037、T038 可平行
- US2 的 T018、T019、T020 可平行
- US3（T025–T026）與 US4（T027–T030）在 US2 完成後可平行

## Parallel Example: User Story 2

```text
Task: "T018 SubmissionEngine.judge 單元測試 in server/tests/unit/submission/SubmissionEngine.judge.test.ts"
Task: "T019 路由整合測試 in server/tests/integration/submission/routes.test.ts"
Task: "T020 前端老師端服務測試 in frontend/tests/unit/ServerSubmissionService.teacher.test.ts"
```

## Implementation Strategy

### MVP First

1. Phase 1、2
2. Phase 3（US1）：學生可送出，伺服器記錄順位，同組分頁跟著切換，老師看到列表；組合根換綁；人工驗證 US1
3. Phase 4（US2）：老師可依序判定、接受後自動結束，即可展示完整的搶答流程；人工驗證 US2
4. **STOP and VALIDATE**：確認 001–004 既有的測試在換綁後全部通過

### Incremental Delivery

US3（隔離驗證）→ US4（壓力測試）→ Polish。每個 User Story 的 Phase 以人工驗證結尾；每個 Phase 完成後停下並回報測試指令與結果（CLAUDE.md 第 2 節步驟 6）。

---

## 需求追溯表

| 需求 | 驗收準則 | 任務 |
| --- | --- | --- |
| REQ-SUB-01 | AC-06、AC-25 | T012、T013、T015 |
| REQ-SUB-02 | AC-01、AC-19 | T003、T012、T013、T016 |
| REQ-SUB-03 | AC-04、AC-08 | T012、T013、T015、T032、T042、T044 |
| REQ-SUB-04 | AC-03 | T012、T015、T032、T037、T042 |
| REQ-SUB-05 | AC-02、AC-07 | T012、T015、T032、T042 |
| REQ-SUB-06 | AC-05 | T012、T014、T015、T017 |
| REQ-SUB-07 | AC-04、AC-20、AC-25 | T011、T012、T013、T016、T022、T029 |
| REQ-SUB-08 | AC-09、AC-20 | T004、T005、T012、T015、T027 |
| REQ-SUB-09 | AC-09、AC-23 | T012、T015 |
| REQ-SUB-10 | AC-09、AC-29 | T008、T009、T019、T037、T038、T039、T040、T042、T044 |
| REQ-SUB-11 | AC-10、AC-11、SC-007 | T018、T021、T032、T044 |
| REQ-SUB-12 | AC-12 | T018、T019、T021、T032、T044 |
| REQ-SUB-13 | AC-08、AC-11 | T018、T019、T021、T032 |
| REQ-SUB-14 | AC-13、AC-14 | T004、T005、T010、T011、T018、T032 |
| REQ-SUB-15 | AC-11、AC-15 | T008、T009、T014、T017、T018、T019 |
| REQ-SUB-16 | AC-17、AC-18、AC-19、SC-004 | T006、T007、T025、T026、T032、T035、T045 |
| REQ-SUB-17 | AC-16、AC-29 | T019、T022、T025、T037、T039、T045 |
| REQ-SUB-18 | AC-26 | T031 |
| REQ-SUB-19 | AC-13、AC-22 | T004、T005、T019、T027 |
| REQ-SUB-20 | AC-04、AC-27 | T008、T009、T012、T013、T014、T015、T017、T032、T042 |
| REQ-SUB-21 | AC-28 | T012、T013、T014、T015、T016、T017、T032、T042、T044 |
| REQ-SUB-NFR-01 | AC-20、AC-22、SC-002 | T027、T028、T029、T046 |
| REQ-SUB-NFR-02 | AC-21、SC-003 | T027、T030 |
| REQ-SUB-NFR-03 | AC-23 | T012、T015 |
| REQ-SUB-NFR-04 | AC-24 | T027、T030、T046 |

| 成功標準 | 任務 |
| --- | --- |
| SC-001 | T019 |
| SC-002、SC-003 | T027、T030 |
| SC-004 | T025、T032 |
| SC-005 | T019、T032 |
| SC-006 | T032、T042（人工驗證：填寫、送出兩步） |
| SC-007 | T018 |

| 組件／類別（圖） | 任務 |
| --- | --- |
| `CommandQueue`、`SequenceClock`（004，005 只使用） | T011、T012、T015、T016、T018、T022、T029 |
| `SubmissionStore`、`QuestionSubmissions`、`SubmissionRecord` | T004、T005 |
| `SubmissionVisibility` | T006、T007、T035 |
| `SubmissionEngine` | T010、T011、T012、T015、T018、T021 |
| `SubmissionGateway` | T013、T016、T026 |
| `SubmissionNotifier` | T008、T009、T026、T030 |
| `SubmissionRoutes` | T019、T022、T037、T039 |
| `ServerSubmissionService` | T014、T017、T020、T023、T038、T040 |
| `createServiceRegistry()`（含刪除 004 橋接中跟送出有關的部分） | T024 |
| 共用事件型別 | T001 |

| 其他 | 任務 |
| --- | --- |
| 001 的測試改走測試伺服器（research RD-08） | T041、T043 |
| 每個 User Story 的人工驗證（原則 VIII） | T042（US1）、T044（US2）、T045（US3）、T046（US4）、T033（全部再走一次） |
| 壓力測試結果紀錄 | T030（`load-test.md`） |
