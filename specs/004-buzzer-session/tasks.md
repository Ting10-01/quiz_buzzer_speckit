---
description: "Task list for 004 活動與階段同步"
---

# Tasks: 活動與階段同步

**Input**: Design documents from `specs/004-buzzer-session/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md；001（頁面、`ActivityService` 介面、`createServiceRegistry`）、002（`buildApp`、`app.requireTeacher`、`app.io` 與 handshake 老師驗證、`ErrorBody`、`loggerOptions`、前端 `ApiClient` 與 `TeacherCredentialStore`；見 002 `contracts/server-extension.md`、`socket-handshake.md`）、003（`ImportStore.latest()`）已完成

**Tests**: 原則 VIII 要求每個 User Story 至少一個正常與一個邊界案例的自動化測試；US5 另有壓力測試。測試先寫、先確認失敗，再實作。外部依賴（Google、003 的匯入、002 的老師驗證）一律以替身取代。

**Organization**: 依 User Story 分 Phase。P1 的 US1、US2、US3、US5 在前，P2 的 US4 在後。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬 User Story（US1–US5）

## 依賴 001 的修改

spec「需請 001 修改」有兩項：C1（D21：老師登入後依階段回到控制台；001 已完成但沒有納入）與 C2（活動設定頁、等待開放頁引用 004 的組數規則與說明文字）。004 不修改 001 的頁面與測試（原則 III）。001 完成 C1 前，T050 中「回到控制台」的 e2e 以 `test.skip` 標記並註明原因；001 完成 C2 前，T028、T044 中檢查「−」「+」不可用與說明文字的 e2e 以 `test.skip` 標記；「暫時限制」的部分（老師重新登入後進入 T-Pick、活動不變、再建立活動被拒絕）現在就測。其餘頁面行為照 001 最終版：結束最後一題直接 `FINISHED`、加入後依階段切換、取消活動（FR-026、FR-050、FR-051，`onPhaseChange(null)`），001 已完成。組數範圍與預設值、說明文字是 001 spec 交給 004 定義的規則，004 以 `shared/src/activityRules.ts` 提供（T002），頁面由 001 依 C2 引用（research RA-16）。

---

## Phase 1: Setup

**Purpose**: 套件、共用型別與測試工具

- [X] T001 [P] 在 `server/package.json` 加入 `socket.io` 相依、`socket.io-client` 開發相依；在 `frontend/package.json` 加入 `socket.io-client` 相依
- [X] T002 [P] 建立 `shared/src/activityRules.ts`：`GROUP_COUNT_MIN = 2`、`GROUP_COUNT_MAX = 20`、`GROUP_COUNT_DEFAULT = 6`，以及 spec「說明文字」的 `JOIN_METHOD_TEXT`、`WAIT_ROUND_TEXT`（data-model §1，REQ-ACT-23）；`server/tests/unit/activity/activityRules.test.ts` 確認常數值與 spec 的數值、文字完全相同
- [X] T003 [P] 建立 `shared/src/activitySync.ts`：`ActivitySnapshot { version: number; activity: Activity | null }`、`GroupAck { snapshot: ActivitySnapshot; studentToken?: string; error?: { code: string; message: string } }`；`isValidationError` 沿用 001 的 `shared/src/guards.ts`
- [X] T004 建立 `server/tests/helpers/activityTestServer.ts`：以 002 的 `buildApp(config, deps)` 在隨機埠啟動伺服器（含 002 的 `app.io` 與 004 的 activity 模組）；經 002 的 `listenTestApp` 使用 002 的 `FakeGoogleGateway` 登入取得老師憑證（`teacherToken`），`rotateTeacher()` 以另一次登入模擬換發（舊憑證作廢、舊老師連線被中斷），不替換 002 的 `TeacherAuth`、不修改 `AppDeps`；003 的匯入以真的 `ImportStore.save` 存入 4 題的結果（`fourQuestionImport()`），`importResult: null` 表示尚未匯入；提供 `connectTeacher(token?)`、`connectStudent(studentToken?)`（只用 WebSocket）、`waitForSnapshot(socket, predicate, timeoutMs)`、`emitWithAck(socket, event, payload)`，依 T001、T003

---

## Phase 2: Foundational

**Purpose**: 狀態、順序、版本與連線；所有 Story 都依賴這些

**⚠️ CRITICAL**: 這個 Phase 完成前不開始 User Story

- [X] T005 [P] `server/tests/unit/activity/CommandQueue.test.ts`：依呼叫順序逐一執行；`run` 內再呼叫 `run` 就地執行；`command` 回傳 Promise 時丟出錯誤（RA-02、REQ-ACT-17）
- [X] T006 [P] 實作 `server/src/activity/CommandQueue.ts`：`run<T>(command: () => T): T`，`-running: boolean`（data-model）
- [X] T007 [P] `server/tests/unit/activity/SequenceClock.test.ts`：連續呼叫不倒退；把 `performance.now` 替身往回調時仍回傳上一次的值（REQ-ACT-18）
- [X] T008 [P] 實作 `server/src/activity/SequenceClock.ts`：`stamp()` = `max(last, performance.timeOrigin + performance.now())`（RA-05）
- [X] T009 [P] `server/tests/unit/activity/ActivityStore.test.ts`：`version()` 初始為 0；每次 `commit` 加 1（以同一個 state commit 也加 1）；`commit(null)`（取消活動）後 `current()` 為 `null`、版本照樣加 1；listener 在 `commit` 當下同步被呼叫、取消訂閱後不再呼叫（REQ-ACT-14、REQ-ACT-22）
- [X] T010 [P] 實作 `server/src/activity/ActivityStore.ts`：`ActivityState`（`spreadsheet`、`questions`、`groupCount`、`phase`、`currentQuestion?`、`openedAt: Map<number, number>`、`endedAt: Map<number, number>`）與 `ActivityStore`（`current`、`version`、`commit`（接受 `null`）、`subscribe`）
- [X] T011 [P] `server/tests/unit/activity/GroupMembership.test.ts`：`join` 第一次產生 token、之後沿用；同一 token 重新加入同組不重複計算；換組時原組減 1；`leave` 移除；`detach` 不改人數；`attach` 不認得的 token 時忽略；`groupOf` 依連線回傳組別或 `null`；`memberCounts(groupCount)`、`highestOccupiedGroup()`；`reset()` 後人數全為 0、`groupOf` 為 `null`，同一條連線再 `join` 沿用原 token（REQ-ACT-12、13、22）
- [X] T012 [P] 實作 `server/src/activity/GroupMembership.ts`：`SocketRef = { id: string }`；`reset()`；token 以 `crypto.randomBytes(16).toString("base64url")` 產生（RA-06）
- [X] T013 [P] `server/tests/unit/activity/ActivityView.test.ts`：`TEACHER` 回傳完整 `Activity`；`PUBLIC` 的 `spreadsheet` 為空白值（`id`、`title`、`selectedWorksheet` 為空字串、`worksheets` 為空陣列、`editable` 為 false），其他欄位相同；`groups` 依 `counts` 產生 `{ number, memberCount }`；`FINISHED` 時 `currentQuestion` 為最後一題（REQ-ACT-19）
- [X] T014 [P] 實作 `server/src/activity/ActivityView.ts`：`Audience`（`TEACHER`、`PUBLIC`）與 `toActivity(state, counts, audience)`
- [X] T015 實作 `server/src/activity/ActivityManager.ts` 的骨架：建構子注入 `CommandQueue`、`ActivityStore`、`GroupMembership`、`SequenceClock`、`ImportStore`；`snapshot(audience)`；`ActivityRuleError(code, message)`，依 T006、T010、T012、T014
- [X] T016 實作 `server/src/activity/ActivityBroadcaster.ts`：`start()` 訂閱 `ActivityStore`；commit 時若 `flushScheduled` 為 false 則設為 true 並 `setImmediate(flush)`；`flush` 以 002 的 `app.io` 送最新快照給 `TEACHER_ROOM`（`TEACHER`）與 `students`（`PUBLIC`）房間（RA-04），依 T015
- [X] T017 實作 `server/src/activity/ActivityGateway.ts` 的連線部分：在 002 的 `app.io` 上處理 `connection`；`socket.data.isTeacher` 為 false 的連線加入 `students` 房間（老師連線已由 002 加入 `TEACHER_ROOM`）；`GroupMembership.attach(socket, auth.studentToken)`；連線後送一次 `activity:snapshot`；斷線時 `detach`（contracts/socket-events.md），依 T015
- [X] T018 建立 `server/src/activity/index.ts` 的 `createActivityModule(app, deps)`，在 002 的 `buildApp(config, deps)`（`server/src/app.ts`）以 `app.register(...)` 註冊；使用 002 的 `app.io`（已設定只用 WebSocket），不另建 Socket.IO 伺服器（RA-11、RA-13）；匯出 `ActivityStore`、`GroupMembership`、`ActivityManager`、`CommandQueue`、`SequenceClock` 給 005、006（contracts/server-modules.md），依 T016、T017
- [X] T019 `server/tests/integration/activity/connection.test.ts`：連線後立即收到 `{ version: 0, activity: null }`（REQ-ACT-15）；只用 polling 的用戶端連不上（AC-31、REQ-ACT-20）；有效老師憑證的連線在 `TEACHER_ROOM`、沒有憑證的在 `students` 房間、作廢憑證的連線被拒絕（`UNAUTHORIZED`）；同一輪事件迴圈內兩次 commit 只推送一次且是較新的版本（RA-04），依 T004、T018
- [X] T020 [P] 實作 `frontend/src/services/RealtimeClient.ts`：`io({ transports: ["websocket"], auth })`，`auth` 每次連線讀取 002 的 `TeacherCredentialStore.get()`（等於 `rejectedTeacherToken` 時不帶；002 #18 之後作廢的憑證會留在本分頁）與 `sessionStorage` 的 `quizBuzzer.studentToken`；`connect`、`reconnect`（`io server disconnect` 時自動呼叫）、`on<T>(event, listener)`、`onConnect`、`emitWithAck`（5 秒逾時 reject `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」）、`studentToken`、`setStudentToken`、`-connectedTeacherToken`、`-rejectedTeacherToken`；`connect_error` `UNAUTHORIZED` 依 research RA-07 處理（data-model §3）
- [X] T021 [P] `frontend/tests/unit/HttpActivityService.sync.test.ts`（假的 `RealtimeClient`）：只採用版本較大的快照，舊的與相同版本被忽略（AC-24）；連線成功後採用第一份即使版本較小；`onActivityChange` 每個新版本通知；`onPhaseChange` 只在 `phase:currentQuestion:groupCount` 改變時通知；剛連線收到 `activity: null` 時不通知；`getCurrentActivity` 有快照時立即回傳、沒有時等下一份、5 秒逾時 reject `UnexpectedError`（RA-09）
- [X] T022 實作 `frontend/src/services/HttpActivityService.ts` 的骨架：`apply`（含 `activity: null` 的處理）、`getCurrentActivity`、`onPhaseChange`、`onActivityChange`（contracts/activity-service.md），依 T020

**Checkpoint**: 連線就能收到帶版本的快照，狀態、順序與身分的基礎就緒

---

## Phase 3: User Story 1 - 老師建立活動並設定組數 (Priority: P1) 🎯 MVP

**Goal**: 老師建立活動、修改組數、在準備中取消活動，學生頁面看得到活動；組數規則與說明文字以共用常數提供

**Independent Test**: 用假的匯入結果建立 4 組的活動，再改成 6 組，開著的學生連線收到更新；取消後學生連線收到 `activity: null`，再建立一次人數從 0 開始

### Tests for User Story 1 ⚠️

- [X] T023 [P] [US1] `server/tests/unit/activity/ActivityManager.settings.test.ts`：建立後為 `PREPARING`、題目來自 `ImportStore`、第 1–n 組各 0 人（AC-03）；組數 1、21、3.5 回 `ValidationError`「組數必須是 2 到 20 之間的整數」且狀態不變（AC-04）；已有活動回 `ACTIVITY_EXISTS`，訊息為「已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器」（AC-06、AC-32）；沒有匯入回 `NO_IMPORT`（REQ-ACT-01）；準備中修改成功；小於有學生的最大組別回「第 n 組已有學生加入，組數不能少於 n」（AC-05）；第 1 題開放後回 `SETTINGS_LOCKED`（AC-08）；沒有活動時修改回 `NO_ACTIVITY`
- [X] T024 [P] [US1] `server/tests/integration/activity/activityRoutes.settings.test.ts`（Fastify `inject`）：`POST /api/activity`、`PUT /api/activity/settings` 成功回 `200 ActivitySnapshot`；組數不合法（含 3.5、字串）回 `200 ValidationError { field: "groupCount", message }` 且活動不變；規則不允許回 `409 { code, message }`；沒有老師憑證回 `401 UNAUTHORIZED` 且活動不變（AC-07、SC-006）；並把這兩條路由加進 002 `server/tests/integration/requireTeacher.test.ts` 的「老師專用路由清單」；建立後學生連線 1 秒內收到 `PREPARING` 的快照（AC-03、AC-15）
- [X] T054 [P] [US1] `server/tests/unit/activity/ActivityManager.cancel.test.ts`：`PREPARING` 取消後 `current()` 為 `null`、版本加 1、`GroupMembership` 人數全為 0（REQ-ACT-22）；取消後 `createActivity` 成功且人數從 0 開始（AC-34）；`OPEN`、`QUESTION_ENDED`、`FINISHED` 時回 `CANCEL_LOCKED`「第 1 題開放後不能取消活動」且狀態與版本不變（AC-35）；沒有活動時不 commit、回傳目前快照（AC-36）；取消後 `joinGroup` 回 `NO_ACTIVITY`、`updateSettings` 回 `NO_ACTIVITY`
- [X] T055 [P] [US1] `server/tests/integration/activity/activityRoutes.cancel.test.ts`（Fastify `inject` 與真的 Socket.IO 連線）：`DELETE /api/activity` 成功回 `200 { version, activity: null }`；第 1 題開放後回 `409 CANCEL_LOCKED`；沒有老師憑證回 `401` 且活動不變（AC-07、SC-006）；把這條路由加進 002 的「老師專用路由清單」；取消後學生與老師連線 1 秒內收到 `activity: null` 的快照（AC-33、SC-007）
- [X] T056 [P] [US1] `frontend/tests/unit/HttpActivityService.cancel.test.ts`（002 `ApiClient` 與假的 `RealtimeClient`）：`cancelActivity` 送 `DELETE /api/activity`，套用回應後 resolve，`onPhaseChange` 收到 `null`、`onActivityChange` 不被呼叫；`ApiError`（409、401）原樣 reject；有活動時推送 `activity: null` 通知 `onPhaseChange(null)`；斷線期間被取消、或伺服器重新啟動（重新連線後收到 `{ version: 0, activity: null }`），都仍通知 `null`（`lastPhaseKey` 不清除，spec Edge Cases）；取消後再推送新活動時通知新的 `Activity`（001 RD-12）
- [X] T025 [P] [US1] `frontend/tests/unit/HttpActivityService.teacher.test.ts`（002 `ApiClient` 的替身）：`createActivity`、`updateSettings` 成功時回傳 `Activity` 並套用版本；`200` 的 body 為 `ValidationError`（以 `isValidationError` 判斷）時原樣回傳、不套用版本；`ApiError`（409、401、`NETWORK`）原樣 reject（RA-10）

**Phase 3 Red 的暫時 skip（2026-11-26）**：T054 中「取消後 `joinGroup` 回 `NO_ACTIVITY`」以 `it.skip` 標記，需 T032（Phase 4），在 Phase 4 的 Red 取消 skip；T028 的 e2e 中「組數超出範圍時建立被拒絕」以 `test.skip` 標記，需 T042（Phase 5）把 `activity` 綁定到 `HttpActivityService`，在 Phase 5 的 Red 取消 skip。「組數預設 6」001 頁面已符合，現在就測。

### Implementation for User Story 1

- [X] T026 [US1] 在 `server/src/activity/ActivityManager.ts` 實作 `createActivity`、`updateSettings`，都在 `CommandQueue.run` 內；組數驗證用 `activityRules`（data-model「ValidationError 的內容」），依 T015、T002
- [X] T027 [US1] 實作 `server/src/activity/activityRoutes.ts` 的 `POST /api/activity`、`PUT /api/activity/settings`：`{ preHandler: app.requireTeacher }`；JSON schema 只要求 body 是物件，`groupCount` 由 `ActivityManager` 驗證；`ValidationError` → `200` 回傳 `ValidationError`；`ActivityRuleError` → `409 { code, message }`（002 的 `ErrorBody`，contracts/activity-http.md），依 T026
- [X] T028 [US1] 在 `frontend/src/services/HttpActivityService.ts` 實作 `createActivity`、`updateSettings`（經 002 的 `ApiClient`），依 T022；並在 `frontend/tests/e2e/activity-sync.spec.ts` 加入「活動設定頁」情境：組數預設 6；組數超出範圍時建立被拒絕並在欄位旁顯示「組數必須是 2 到 20 之間的整數」（AC-01、AC-04）；「−」「+」不可用與「學生加入」的說明文字（AC-01、AC-02）先 `test.skip`，註明需 001 完成 C2
- [X] T058 [US1] 在 `server/src/activity/ActivityManager.ts` 實作 `cancelActivity()`，在 `CommandQueue.run` 內；`GroupMembership.reset()`、`ActivityStore.commit(null)`（data-model「狀態轉換」、research RA-17），依 T026
- [X] T059 [US1] 在 `server/src/activity/activityRoutes.ts` 加入 `DELETE /api/activity`：`{ preHandler: app.requireTeacher }`；`ActivityRuleError` → `409`（contracts/activity-http.md），依 T027、T058
- [X] T060 [US1] 在 `frontend/src/services/HttpActivityService.ts` 實作 `cancelActivity()`（經 002 的 `ApiClient`，套用回應後 resolve），依 T028

**Checkpoint**: 老師可以建立、修改、取消活動，學生連線同步收到

---

## Phase 4: User Story 2 - 學生選擇組別加入 (Priority: P1)

**Goal**: 學生不登入即可選組；伺服器依連線記住組別；重新整理後選回原組即回到原組

**Independent Test**: 3 個學生連線分別加入第 1、3、3 組，老師連線收到人數；開放第 1 題後第 3 組的連線換組被拒絕

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] `server/tests/unit/activity/ActivityManager.groups.test.ts`：依 data-model「組別規則」逐列測試——沒有活動（`NO_ACTIVITY`）、組別超出範圍（`NO_SUCH_GROUP`）、同組重新加入不重複計算、準備中換組、鎖定後換組回 `GROUP_LOCKED`「第 1 題開放後不能換組，你在第 m 組」、鎖定後未加入的連線可加入（OPEN、QUESTION_ENDED、FINISHED）；`leaveGroup` 準備中成功、鎖定後回 `error`；每次成功的加入或離開都 commit 新版本（REQ-ACT-10、11、13）
- [X] T030 [P] [US2] `server/tests/integration/activity/ActivityGateway.groups.test.ts`：`group:join` 的 ack 帶 `studentToken`，老師連線 1 秒內收到人數加 1（AC-09）；兩條連線加入同組為 2 人（AC-10）；準備中換組（AC-11）；開放第 1 題後換組被拒絕、仍在原組（AC-12）；開放後新連線可加入（AC-13）；斷線後以同一 `studentToken` 重新連線並加入原組，人數不變且 `groupOf` 仍為原組（AC-14）；伺服器不認得的 token 被忽略；payload 不是整數時回 `error`；學生連線收到的所有快照 `spreadsheet` 為空白值、老師連線的不是（AC-16、SC-003）
- [X] T031 [P] [US2] `frontend/tests/unit/HttpActivityService.groups.test.ts`：`joinGroup` 成功時存 `studentToken` 並回傳 `Activity`；ack 有 `error` 時先套用 `snapshot` 再 reject `UnexpectedError(error.message)`（`NO_ACTIVITY`、`NO_SUCH_GROUP`、`GROUP_LOCKED`）；`leaveGroup` 有 `error` 時 reject `UnexpectedError(error.message)`；ack 逾時 reject「連不上伺服器，請確認伺服器已啟動」

### Implementation for User Story 2

- [X] T032 [US2] 在 `server/src/activity/ActivityManager.ts` 實作 `joinGroup(socket, n)`、`leaveGroup(socket)`，在 `CommandQueue.run` 內；回傳 `GroupAck`（`PUBLIC` 快照），依 T026
- [X] T033 [US2] 在 `server/src/activity/ActivityGateway.ts` 處理 `group:join`、`group:leave`：驗證 payload、呼叫 `ActivityManager`、以 ack 回覆（contracts/socket-events.md），依 T032
- [X] T034 [US2] 在 `frontend/src/services/HttpActivityService.ts` 實作 `joinGroup`、`leaveGroup`（經 `RealtimeClient.emitWithAck`），`joinGroup` 照 001 回傳 `Promise<Activity>`，被拒絕時以 `UnexpectedError(error.message)` reject，依 T022

**Checkpoint**: 學生可以加入、換組、重新整理後回到原組；伺服器提供 `groupOf(socket)`

---

## Phase 5: User Story 3 - 老師逐題開放與結束，所有人同步 (Priority: P1)

**Goal**: 依題號逐題開放、結束；最後一題結束即活動結束；所有分頁 1 秒內同步

**Independent Test**: 1 個老師與 3 個學生連線，開放第 1 題、結束、開放第 2 題，所有連線 1 秒內收到相同版本

### Tests for User Story 3 ⚠️

- [X] T035 [P] [US3] `server/tests/unit/activity/ActivityManager.questions.test.ts`：data-model「狀態轉換」每一條；準備中開放第 2 題、`OPEN(1)` 開放第 2 題回 `QUESTION_NOT_NEXT`，結束非開放中的題目回 `QUESTION_NOT_OPEN`，狀態不變（AC-21）；結束最後一題直接 `FINISHED` 且 `currentQuestion` 為最後一題（AC-20）；重複開放、重複結束回傳目前快照且版本不變（AC-22）；在 `CommandQueue.run` 內（模擬 005 的判定）呼叫 `endQuestion` 就地執行，之後老師的 `endQuestion` 不改變狀態（REQ-ACT-07、08）；以假的 `SequenceClock` 驗證 `openedAt[n]`、`endedAt[n]` 被記錄且結束不早於開放（AC-30、REQ-ACT-18）
- [X] T036 [P] [US3] `server/tests/integration/activity/sync.test.ts`：1 個老師與 3 個學生連線；開放第 1 題、結束、開放第 2 題、…、結束第 4 題，每次所有連線 1 秒內收到同一版本與階段（AC-17～20）；某學生連線斷線期間老師開放下一題，重新連線後立即收到目前狀態（AC-23）；每條連線收到的版本嚴格遞增
- [X] T037 [P] [US3] `server/tests/integration/activity/activityRoutes.questions.test.ts`（Fastify `inject`）：`POST /api/activity/questions/:n/open`、`/end` 的 `200`、`409`、`401`；`:n` 不是整數時回 409；把這兩條路由加進 002 的「老師專用路由清單」
- [X] T038 [P] [US3] 在 `frontend/tests/unit/HttpActivityService.teacher.test.ts` 加入 `openQuestion`、`endQuestion`：`200` 套用並回傳 `Activity`；`ApiError` 原樣 reject；回應的版本比已收到的推送舊時不覆蓋較新的狀態（AC-24）
- [X] T061 [US3] 依 spec「需請 001 修改」C2 補充，讓 001 的 E2E 接上真的測試伺服器：擴充 `server/tests/e2e/startTestServer.ts`（假的 Google 登入與假的 `SpreadsheetReader`，提供 001 的示範學習單）；修改 `frontend/tests/e2e/` 的走法輔助檔（`us5-walk.ts`、`googleSignIn.ts`、`googlePicker.ts` 等），把頁面的 `/api` 與 Socket.IO 連線導向測試伺服器，老師以測試伺服器登入與匯入，學生需要推進階段時由輔助函式直接呼叫測試伺服器的老師 API，不另開老師頁面；不修改 001 的頁面程式與既有測試的斷言；刪除「模擬：推進到下一個階段」與活動的「模擬：驗證失敗」的專屬測試。必須改斷言才能通過的測試先列出，由使用者決定

### Implementation for User Story 3

- [X] T039 [US3] 在 `server/src/activity/ActivityManager.ts` 實作 `openQuestion(n)`、`endQuestion(n)`：依 data-model「狀態轉換」，`openedAt`、`endedAt` 用 `SequenceClock.stamp()`，重複要求不 commit，依 T026
- [X] T040 [US3] 在 `server/src/activity/activityRoutes.ts` 加入 `POST /api/activity/questions/:n/open`、`/end`（contracts/activity-http.md），依 T039
- [X] T041 [US3] 在 `frontend/src/services/HttpActivityService.ts` 實作 `openQuestion`、`endQuestion`，依 T028
- [X] T042 [US3] 修改 `frontend/src/services/createServiceRegistry.ts`：`activity` 綁定 `HttpActivityService`；移除 `phaseControl` 與 `activityValidationControl`；`submission` 或 `result` 仍是模擬實作時，把 `onActivityChange` 的活動寫進 `MockSession.teacherActivity`、`joinGroup` 成功的組別寫進 `MockSession.joinedGroup`、`leaveGroup` 成功時清除，`onPhaseChange(null)`（活動被取消）時清除 `teacherActivity` 與 `joinedGroup`；保留 003 留下的 `readWorksheet` 包裝（`MockResultService` 在老師分頁仍讀 `lastImport`）；並包一層模擬的 `judge`：`JudgeOutcome.activity` 不是 `OPEN` 時呼叫 `HttpActivityService.endQuestion(q)`，以其回傳的活動取代 `JudgeOutcome.activity`（RA-14）；更新 `frontend/tests/unit/createServiceRegistry.test.ts`（`isMockMode()` 仍為 true、`phaseControl` 不存在）
- [X] T043 [US3] 在 `server/src/activity/ActivityManager.ts` 與 `ActivityGateway.ts` 加入 pino 事件 `activity.created`、`activity.cancelled`、`question.opened`、`question.ended`、`group.joined`、`group.left`（RA-12），不記錄 `studentToken`；在 002 的 `server/src/logger.ts` `loggerOptions.redact.paths` 加上 `*.studentToken`；不記錄 handshake 物件；`server/tests/integration/activity/logging.test.ts` 檢查 log 輸出中沒有任何 `studentToken`
- [X] T062 [US3] （由 T050 提前，2026-11-26）在 `frontend/src/services/RealtimeClient.ts` 與 `HttpActivityService.ts` 實作「憑證改變就重新連線」（contracts/activity-service.md）：`getCurrentActivity()` 與五個老師指令執行前，若 `TeacherCredentialStore.get()` 與 `connectedTeacherToken` 不同、且不是 `rejectedTeacherToken`，先 `reconnect()`。理由：老師分頁在登入前就以學生身分連線，沒有這一步時收到的是學生版快照（`spreadsheet` 為空白值），版本相同的推送比老師指令的回應先到時，老師端會採用學生版，T044 與 001 的主持流程（模擬判定依試算表 ID 取答案）無法通過。T050 只保留它的 e2e，依 T042
- [X] T044 [US3] `frontend/tests/e2e/activity-sync.spec.ts`：1 個老師與 3 個學生分頁走完「建立 → 加入 → 開放並結束 4 題 → 已結束」，學生頁面隨階段自動切換（S-Join 沒有活動 → 有活動、S-Wait → S-Answer → S-QuestionDone → S-Answer → … → 最後一題直接 S-Results），不需重新整理（AC-15、AC-17～20、SC-001、SC-004）；在 `QUESTION_ENDED`、`FINISHED` 時加入的分頁分別進入 S-QuestionDone、S-Results（001 RD-14）；學生分頁的 WebSocket 訊息中 `spreadsheet` 的 `id`、`title` 為空、沒有 `transport=polling` 的請求（AC-16、REQ-ACT-20、SC-003）；準備中老師取消活動：老師進入 T-Pick，S-Wait 的分頁切到 S-Join 並顯示「目前沒有活動，請等老師建立活動」、已選組別的 S-Join 清除選擇、首頁顯示沒有活動；老師重新建立活動後各組人數從 0 開始（AC-33、AC-34、SC-007）；開放第 1 題後控制台沒有「取消活動」；學生重新整理後選別組，共通錯誤訊息區顯示「第 1 題開放後不能換組，你在第 3 組」、停留在 S-Join；選回原組回到作答頁（AC-12、AC-14）；S-Wait 顯示 spec「說明文字」的內容（AC-09）先 `test.skip`，註明需 001 完成 C2

**Checkpoint**: 完整活動流程可以展示；MVP 完成

---

## Phase 6: User Story 5 - 分頁很多時階段同步仍然正確 (Priority: P1)

**Goal**: 201 個連線時階段改變 1 秒內送達、版本不亂；200 個同時加入不漏

**Independent Test**: `npm run test:load:activity -w server` 重複 20 次全部通過

- [ ] T045 [P] [US5] 建立 `server/tests/load/phaseSync.load.ts`（research RA-15）：1 個老師與 200 個學生連線（20 組 × 10，只用 WebSocket）；200 個學生在 1 秒內同時 `group:join`，檢查每個都恰好一次 ack、人數總和 200、老師連線在最後一個加入後 1 秒內收到相同人數（AC-29、NFR-02）；老師依序開放並結束 4 題，檢查每次階段改變 1 秒內送達全部 201 個連線、每條連線版本嚴格遞增、結束時所有連線與伺服器狀態相同（AC-28、NFR-01）
- [ ] T046 [US5] 在 `server/package.json` 加入 `test:load:activity` script：重複執行 T045 共 20 次並輸出彙整（SC-002）
- [ ] T047 [US5] 執行 T046；若未通過，調整 `server/src/activity/ActivityBroadcaster.ts`（例如序列化一次、對兩個房間重用），直到 20 次全部通過；結果記在 `specs/004-buzzer-session/manual-verification.md`

**Checkpoint**: 高併發下的階段同步經過量測

---

## Phase 7: User Story 4 - 老師重新整理後回到控制台 (Priority: P2)

**Goal**: 老師分頁重新整理或關閉時活動繼續；001 C1 完成前，老師重新登入後進入 T-Pick（暫時限制），完成後回到控制台目前的階段

**Independent Test**: 第 2 題搶答中老師連線斷開，學生連線不受影響；以新的老師憑證連線後收到老師版快照

### Tests for User Story 4 ⚠️

- [ ] T048 [P] [US4] `server/tests/integration/activity/teacherRefresh.test.ts`：`OPEN(2)` 時老師連線斷線，活動與版本不變，學生連線照常收到之後的推送（AC-25）；模擬 002 換發老師憑證（任何人登入都取代前一位老師）：舊老師連線被中斷、帶舊憑證重連被拒絕（`UNAUTHORIZED`）；以新憑證連線加入 `TEACHER_ROOM` 並收到 `TEACHER` 快照（`spreadsheet.id` 不是空字串）
- [ ] T049 [P] [US4] `frontend/tests/unit/HttpActivityService.reconnect.test.ts`：`TeacherCredentialStore.get()` 與 `connectedTeacherToken` 不同時，`getCurrentActivity` 與五個老師指令先 `reconnect()`；憑證等於 `rejectedTeacherToken`（002 #18：被取代的分頁保留作廢的憑證）時不重新連線，連續兩次老師指令都不多一次 handshake，並回傳重新連線後的快照；`disconnect` 原因為 `io server disconnect` 時自動重連；`connect_error` `UNAUTHORIZED` 且憑證沒換時，記下 `rejectedTeacherToken` 並以一般連線重連（research RA-07）

### Implementation for User Story 4

- [ ] T050 [US4] （實作已移到 T062，Phase 5）在 `frontend/tests/e2e/activity-sync.spec.ts` 加入：（現在測）`OPEN(2)` 時老師重新整理並登入（002 的測試替身），進入 T-Pick，學生分頁的階段不變；再走到 T-Setup 按「建立活動」，共通錯誤訊息區顯示暫時限制的說明（AC-25、AC-32、SC-005）；沒有活動時登入進入 T-Pick（AC-27）；（需 001 C1，先 `test.skip`）登入後直接回到 T-Live（第 2 題），`PREPARING` → T-Lobby、`QUESTION_ENDED` → T-QuestionEnd、`FINISHED` → T-Results（AC-26）

**Checkpoint**: 老師誤重新整理不會毀掉活動

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T051 依 quickstart.md 執行 17 個人工驗證情境，結果記在 `specs/004-buzzer-session/manual-verification.md`（原則 VIII）
- [ ] T052 圖表一致性驗證：比對 `server/src/activity/`、`shared/src/activity*.ts`、`frontend/src/services/HttpActivityService.ts`、`RealtimeClient.ts` 的類別、方法、呼叫順序與 `diagrams/004-*.puml`，結果寫在 `specs/004-buzzer-session/diagram-verification.md`；不一致時修正程式碼，或依原則 II 先改 spec 與圖表（原則 I）
- [ ] T053 回報執行的測試指令與結果：`npm test -w server -- activity`、`npm test -w frontend -- HttpActivityService`、`npx playwright test -c frontend/playwright.config.ts activity-sync`、`npm run test:load:activity -w server`（原則 VIII）

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → US5；US4 在 US3 之後。
- US2 依賴 US1（加入需要活動）；US3 依賴 US1；US3 的 e2e（T044）依賴 US2 與 T061；US5 依賴 US2、US3；US4 依賴 US3；US4 中回到控制台的 e2e 依賴 001 C1；T028、T044 中頁面規則與說明文字的 e2e 依賴 001 C2。
- 同一檔案的任務依序執行：`ActivityManager.ts`（T015 → T026 → T058 → T032 → T039 → T043）、`HttpActivityService.ts`（T022 → T028 → T060 → T034 → T041 → T062）、`activityRoutes.ts`（T027 → T059 → T040）、`ActivityGateway.ts`（T017 → T033 → T043）。

### Parallel Opportunities

- Phase 2：T005/T007/T009/T011/T013（測試）與 T006/T008/T010/T012/T014（實作）可兩兩平行；T020、T021 與伺服器任務平行。
- 每個 Story 的測試任務（標 [P]）可平行撰寫。

```text
# US1 的測試可以同時開始
T023 server/tests/unit/activity/ActivityManager.settings.test.ts
T024 server/tests/integration/activity/activityRoutes.settings.test.ts
T025 frontend/tests/unit/HttpActivityService.teacher.test.ts
T054 server/tests/unit/activity/ActivityManager.cancel.test.ts
T055 server/tests/integration/activity/activityRoutes.cancel.test.ts
T056 frontend/tests/unit/HttpActivityService.cancel.test.ts
```

## Implementation Strategy

1. **MVP**：Phase 1、2 → US1 → US2 → US3。完成後即可展示完整的活動流程（SC-004）。
2. 加上 US5，以壓力測試確認時序與量級。
3. US4 的伺服器與服務層現在就做；001 C1 完成後解除回到控制台的 e2e skip；001 C2 完成後解除 T028、T044 中頁面規則與說明文字的 e2e skip。
4. Polish：人工驗證、圖表一致性驗證、回報測試結果。

## 需求追溯

| 需求 | 驗收 | 實作任務 | 測試任務 |
| --- | --- | --- | --- |
| REQ-ACT-01 | AC-03 | T026、T027 | T023、T024 |
| REQ-ACT-02 | AC-01、AC-02、AC-04 | T002、T026、T028 | T002、T023、T024、T028 |
| REQ-ACT-03 | AC-06、AC-34 | T026、T058 | T023、T054 |
| REQ-ACT-04 | AC-05、AC-08 | T026 | T023 |
| REQ-ACT-05 | AC-17～21 | T039、T040 | T035、T036、T037 |
| REQ-ACT-06 | AC-20 | T039 | T035、T036、T044 |
| REQ-ACT-07 | AC-22、AC-36 | T039、T058 | T035、T054 |
| REQ-ACT-08 | AC-22 | T006、T039、T018 | T005、T035 |
| REQ-ACT-09 | AC-07 | T027、T040、T059 | T024、T037、T055 |
| REQ-ACT-10 | AC-09、AC-10 | T012、T032、T033 | T011、T029、T030 |
| REQ-ACT-11 | AC-11～13 | T032、T033、T034 | T029、T030、T031 |
| REQ-ACT-12 | AC-14、AC-16 | T012、T017、T018 | T011、T030 |
| REQ-ACT-13 | AC-14 | T012、T020、T034 | T011、T030、T044 |
| REQ-ACT-14 | AC-24、AC-33 | T010、T016、T022、T058 | T009、T019、T021、T038、T055 |
| REQ-ACT-15 | AC-23 | T017 | T019、T036 |
| REQ-ACT-16 | AC-15、AC-17～19、AC-33 | T016、T022、T060 | T036、T044、T056 |
| REQ-ACT-17 | AC-22、AC-29 | T006、T026、T032、T039 | T005、T035、T045 |
| REQ-ACT-18 | AC-30 | T008、T039 | T007、T035 |
| REQ-ACT-19 | AC-16 | T014、T016、T017 | T013、T030、T044 |
| REQ-ACT-20 | AC-31 | T018、T020 | T019、T044 |
| REQ-ACT-21 | AC-25～27、AC-32 | T062 | T048、T049、T050 |
| REQ-ACT-22 | AC-33～36 | T010、T012、T058、T059、T060、T042 | T009、T011、T054、T055、T056、T044 |
| REQ-ACT-23 | AC-01、AC-02、AC-09 | T002 | T002、T028、T044（頁面部分依賴 001 C2） |
| REQ-ACT-NFR-01 | AC-28 | T016、T047 | T045、T046 |
| REQ-ACT-NFR-02 | AC-29 | T032、T047 | T045、T046 |
| SC-001、SC-004 | — | — | T044、T051 |
| SC-002 | — | T047 | T045、T046 |
| SC-003 | — | T014 | T030、T044 |
| SC-005 | — | T050 | T050、T051 |
| SC-006 | — | T027、T040、T059 | T024、T037、T055 |
| SC-007 | — | T058、T060 | T055、T044、T051 |
