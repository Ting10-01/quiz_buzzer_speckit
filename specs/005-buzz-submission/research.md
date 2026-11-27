# Research: 搶答與判定

**Feature**: `005-buzz-submission` | **Date**: 2026-11-21（2026-11-22 配合 001 最終版修訂；2026-11-27 對照 001–004 的實際程式修訂） | **Plan**: [plan.md](./plan.md)

技術棧沿用 001 [research.md](../001-ui-prototype/research.md) 的 RD-01～RD-08（TypeScript strict、Node.js 24 LTS、Fastify、Socket.IO、pino、Vitest、Playwright、npm workspaces `frontend/` `shared/` `server/`），不另選框架。介面與實體以 `main` 目前的 001（含 2026-11-24、2026-11-27 的修訂）的 [contracts/service-interfaces.md](../001-ui-prototype/contracts/service-interfaces.md)、[data-model.md](../001-ui-prototype/data-model.md) 為準。伺服器骨架、`app.io`、`TEACHER_ROOM`、`app.requireTeacher`、`ApiClient` 依 002 `contracts/server-extension.md`、`socket-handshake.md`；`CommandQueue`、`SequenceClock`、`ActivityStore`、`GroupMembership`、`ActivityManager`、`RealtimeClient` 依 004 `contracts/server-modules.md`、`socket-events.md`。本文件只處理 005 特有的問題：順序、時間、併發、資訊隔離與介面的落點。順序與併發的想法沿用舊 `002-buzzer-session` research R1～R4、R8，改成「老師依順序判定」（E4）。

---

## RD-01 順序怎麼保證（REQ-SUB-07、REQ-SUB-08、NFR-01）

- **Decision**: 005 不自己建立佇列。送出與判定都放進 004 的 `CommandQueue.run(command)`；004 的開放、結束一題也走同一條佇列（004 REQ-ACT-17），所以四種指令構成單一全序：送出若在結束之前被處理就有效、之後就被拒絕（AC-25）。`command` 是同步函式：從讀取 `ActivityStore`、驗證、取順位、`SequenceClock.stamp()` 到寫入 `SubmissionStore`，中間沒有任何 `await`（004 的 `run` 遇到回傳 Promise 會丟出錯誤）。推送一律在 `run` 回傳之後才排程。順位在臨界區內以「本題目前的送出數 + 1」取得。
- **處理序號**: 004 的 `CommandQueue` 沒有序號。`SubmissionEngine` 自己維護 `processed`：每處理一筆送出（不論結果）加 1，寫進 log 的 `seq`，讓壓力測試核對「每組被接受的是最早處理的那一筆」。因為只在 `run` 內遞增，順序與佇列相同。
- **Rationale**: Node.js 單執行緒，同步區段不會被插隊，不需要鎖；抵達順序就是 Socket.IO／Fastify 把訊息交給事件迴圈的順序。一條佇列由 004 擁有，避免兩個子功能各有一條、順序對不起來。
- **Alternatives considered**: 005 自己建一條佇列（和 004 的開放、結束不在同一個順序）；資料庫交易或鎖（單一程序不需要，XI）；以學生端時間排序（可被竄改）。

## RD-02 時間與經過時間（REQ-SUB-09、NFR-03）

- **Decision**: 接受時間用 004 的 `SequenceClock.stamp()`（`max(上一次的值, performance.timeOrigin + performance.now())`）。開放時間直接讀 004 `ActivityState.openedAt.get(n)`，它也是同一個 `SequenceClock` 在開放那一刻記下的。`elapsedMs = acceptedAt − openedAt`，取整數。
- **Rationale**: 同一個單調時鐘，系統時間被調整不影響，且隨處理順序不減；005 不必另外記開放時間。順位只看處理順序，時間只供顯示與 006 計算 `behindFirstMs`。

## RD-03 學生走 Socket.IO，老師走 HTTP（REQ-SUB-02、REQ-SUB-17、REQ-SUB-20、REQ-SUB-21）

- **Decision**:
  - 學生的指令都在 002 建立的 `app.io` 上，以 ack 回覆；組別一律由 004 的 `GroupMembership.groupOf(socket)` 判斷：
    - 「整組送出」：`submission:submit` → `SubmitReply`。
    - 取得本組送出（`getGroupSubmission`）：`submission:own` → `OwnSubmissionReply`（`submission` 或 `null`）。
  - 老師「列出送出」「判定」：HTTP REST（`GET /api/questions/:n/submissions`、`POST /api/questions/:n/judgements`），路由以 `app.register(submissionRoutes)` 註冊在 002 的 `buildApp`，每條加 `{ preHandler: app.requireTeacher }`。判定回傳 001 的 `JudgeOutcome`；錯誤回應用 002 的 `{ code, message }`。
  - 推播：老師列表 `submissions:changed` 只送 `app.io.to(TEACHER_ROOM)`；`submission:groupSubmitted`（`onGroupSubmitted`）與 `submission:judged`（`onJudgement`）只送給 `groupOf(socket) === n` 的連線（RD-05）。
- **Rationale**: 001 RD-03 原則上是「指令走 REST、推播走 WebSocket」。學生的指令是例外：組別必須由伺服器依連線判斷（001 RD-06、原則 VI），而 004 以 Socket.IO 連線記住組別，HTTP 請求沒有對應的連線身分。老師的指令照 001 RD-03 走 REST，直接用 002 的 `app.requireTeacher`。
- **Alternatives considered**: 學生也走 HTTP，另發「組別憑證」（和 004 的 `studentToken` 重複）；老師判定也走 Socket.IO（要另外寫老師驗證）。

## RD-04 重複送出與連點（REQ-SUB-06、AC-05）

- **Decision**:
  - 001 的「整組送出」一律可用、頁面不擋連點（FR-053），所以由服務處理：`ServerSubmissionService.submitAnswer` 每次送出產生 `requestId = crypto.randomUUID()`；同一題已有送出在進行中時，直接回傳同一個 Promise（連點只送一次）。送出因逾時或斷線失敗時，下一次按「整組送出」若題號與答案都相同，沿用同一個 `requestId`。
  - 伺服器把 `requestId` 存在 `SubmissionRecord`。同一組在本題已有紀錄時：`requestId` 相同 → 回覆第一次的結果（成功），不產生新紀錄；不同 → 拒絕「本組已送出此題」。
- **Rationale**: 不需要另外的「已處理請求」對照表；同組另一人送出的是不同 `requestId`，自然被判為「本組已送出此題」（AC-04）。驗證失敗的送出不存，重送時再驗證一次，結果相同。

## RD-05 推播量、同組通知與慢連線（REQ-SUB-10、REQ-SUB-15、REQ-SUB-20、NFR-02、NFR-04）

- **Decision**:
  - 老師列表合併：某題有變化時，若 200 ms 內沒有推送過，就以 `setImmediate` 排在這一輪事件迴圈結束後推送；否則在 200 ms 視窗結束時推送一次最新的完整列表。
  - `SubmissionNotifier` 的三個方法都只排程，不在呼叫當下 `emit`：它們由 `submit`、`judge` 與 `ActivityStore.subscribe` 的 listener 在 004 的 `CommandQueue.run` 內呼叫，而 004 規定 listener 只排程、不在 `run` 內送網路訊息（004 RA-04，`ActivityBroadcaster` 也用 `setImmediate`）。組員送出與判定的通知同樣以 `setImmediate` 送出，不合併。
  - 送給某一組的通知（組員送出、判定）不合併，排程後走過 `app.io` 目前所有連線，送給 `GroupMembership.groupOf(socket) === n` 的那些。004 不建立組別房間（004 socket-events），所以 005 不維護 `group:<n>` 房間。組員送出的通知也會送到送出者自己的分頁；那個分頁已經在等待判定頁，沒有訂閱 `onGroupSubmitted`，不受影響。
  - 所有 `emit` 都不等待對方回應。
- **Rationale**: 1 秒 1,000 筆送出時，老師最多每秒收到 5 份列表，落後不超過 1 秒。組別通知一題最多 20 次（每組送出一次）加上幾次判定，每次掃過約 200 條連線，成本可忽略；比在加入、離開組別與斷線重連時同步維護房間簡單（XI）。Socket.IO 對每條連線各自緩衝，慢連線只塞住自己。
- **上限**: 連線數到數千條時，改成在 004 的加入組別流程中維護房間。
- **Alternatives considered**: 舊 002 的每連線 `Outbox`（005 的學生不收他組資料，推播量小，不需要）；`socket.volatile.emit`（可能丟掉最後一份列表）。

## RD-06 作答期間的資訊隔離（REQ-SUB-16、R9）

- **Decision**: 學生端只會收到本組的送出：`submission:submit` 的 ack、`submission:own` 的 ack、`submission:groupSubmitted`、`submission:judged`，全部經 `SubmissionVisibility.forStudent()` 產生，`rank` 一律為 0。送出列表只能經 `app.requireTeacher` 的 HTTP 與 `TEACHER_ROOM` 取得。學生請求中夾帶的 `groupNumber` 一律忽略。
- **Rationale**: 限制在伺服器端執行（原則 VI）；真正的順位會透露其他組是否已送出。001 的 `Submission.rank` 目前是必填（2026-11-22 使用者決定：在 001 改成可選之前填 0）。001 的學生頁面不顯示順位，所以 0 不會出現在畫面上。
- **001 改成可選之後**: `forStudent` 改成不放 `rank`，其他程式不變；這是 005 的一項後續任務（tasks T035），等 001 改完再做。

## RD-07 判定規則、自動結束與 `JudgeOutcome`（REQ-SUB-11～15）

- **Decision**:
  - `judge(n, group, judgement)` 只在下列條件都成立時改變狀態：`ActivityStore.current()` 是 `OPEN` 且 `currentQuestion === n`；本題沒有 `ACCEPTED`；該組的紀錄是 `firstPending()`；`judgement` 是 `ACCEPTED` 或 `REJECTED`。否則不改變任何狀態。請求格式錯誤回 400 `{ code, message }`；沒有活動時回 409 `NO_ACTIVITY`（頁面流程不會發生，前端轉成 `UnexpectedError`）。
  - `ACCEPTED`：在同一個 `CommandQueue.run` 內，標記 `ACCEPTED`、`winnerGroup`，再呼叫 004 的 `ActivityManager.endQuestion(n)`（就地執行）。因為前面已確認第 n 題開放中，不會碰到 `ActivityRuleError(QUESTION_NOT_OPEN)`。004 `commit` 時同步呼叫 `ActivityStore.subscribe` 的 listener（仍在 `run` 內），`SubmissionEngine.onActivityChange` 看到第 n 題不再開放，就呼叫 `SubmissionStore.closeQuestion(n)`，把其餘 `PENDING` 改成 `UNJUDGED`。
  - 回傳：同一個 `run` 的最後組出 001 的 `JudgeOutcome`：`submissions` 為 `SubmissionStore.list(n)`（老師視角），`activity` 為 004 `ActivityManager.snapshot(Audience.TEACHER).activity`。接受後是 `QUESTION_ENDED` 或 `FINISHED`；不接受或判定無效時是當下的階段（通常仍是 `OPEN`），頁面依 001 FR-032a 切換或留下。
  - 老師手動按「結束這一題」走 004 自己的流程，同樣經 `subscribe` 觸發 `closeQuestion(n)`。
- **Rationale**: 001 的 `judge` 沒有錯誤值；回傳目前列表與活動讓頁面依伺服器的狀態重畫或切換（原則 V）。接受與結束在同一個 `run` 內完成，接受之後不可能再有送出被收進本題。

## RD-08 001 頁面的落點與替換方式

- **Decision**: 前端新增 `frontend/src/services/server/ServerSubmissionService.ts`，實作 001 `SubmissionService` 的七個方法，在 `createServiceRegistry()` 把 `submission` 綁到它，並移除 `judgementControl`、`submissionValidationControl`、`teammateControl`（001 plan「替換模擬實作的方式」、data-model `ServiceRegistry`）。`MockSubmissionService` 是 001 的檔案，保留不刪，只供 001 的單元與元件測試使用。
- **組合根中 004 留下的橋接（004 RA-14 的 `bridgeMocksToActivity`）**：刪除跟送出有關的部分：包住 `submission.judge` 的那一層（接受後改呼叫 `activity.endQuestion`；真正的 `judge` 已在伺服器自動結束本題）、包住 `joinGroup`／`leaveGroup` 寫入 `MockSession.joinedGroup` 的那一層，以及 `session.setViewerPhaseAdvancer(() => {})`。保留 `onActivityChange`／`onPhaseChange` 寫入 `MockSession.teacherActivity` 與 003 的 `lastImport` 包裝，因為 `MockResultService` 仍要讀，006 換掉結果的模擬實作後才刪。`mockBound` 移除 `submission`。
- **006 完成前的結果頁**：`MockResultService` 讀的是 `MockSession.submissions`，換綁後永遠是空的，每一題都顯示「沒有組別送出」。spec 列為已知限制（Session 2026-11-27）；不另做橋接把真正的送出寫回 `MockSession`（XI：那段程式只為了展示，006 一完成就要刪）。
- **001 的測試**：依賴「模擬：接受」「模擬：不接受」「模擬：同組組員送出」與送出的「模擬：驗證失敗」的 001 E2E 與元件測試，改走真的測試伺服器（同 004 T061）：老師以測試伺服器登入，學生真的送出，需要判定時由輔助函式直接呼叫測試伺服器的老師 API。只改走法與輔助檔，不改 001 的頁面與既有斷言；一定要改斷言才能通過的測試先列出，由使用者決定。這些模擬控制的專屬測試（它們只驗證模擬實作本身）隨模擬控制從組合根移除而刪除或改為只測 `MockSubmissionService`。
- 使用其他子功能的前端元件：
  - Socket.IO：004 的 `RealtimeClient`（每分頁一條連線，組別記在這條連線上）。`submitAnswer`、`getGroupSubmission` 用 `emitWithAck`（5 秒逾時，以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」reject）；`onSubmissionsChange`、`onGroupSubmitted`、`onJudgement` 用 `on`；重新連線用 `onConnect`。
  - HTTP：002 的 `ApiClient.request(method, path, body?)`，自動帶老師憑證，錯誤轉成 `ApiError`（符合 `UnexpectedError`）。
- `ValidationError` 配合 001 現況：作答頁把某一格的錯誤（`answers.<i>`）顯示在該格旁，不屬於某一格的錯誤（`answers`）顯示在第一個答案欄旁（001 tasks T087）。`field` 沿用 001 模擬實作的寫法：某一格為 `answers.<i>`，不屬於某一格為 `answers`；`message` 說明是哪一格或什麼原因。
- **老師憑證與連線**：`listSubmissions`、`judge`、`onSubmissionsChange` 開頭都先呼叫 `RealtimeClient.followTeacherCredential()`，與 004 `HttpActivityService` 的老師指令相同（004 T062）。分頁在登入前以學生身分連線；沒有這一步，連線不在 `TEACHER_ROOM`，收不到 `submissions:changed`。重新連線後的 `onConnect` 會觸發下面的重新讀取。
- **重新連線**:
  - 老師：`onSubmissionsChange` 的訂閱在 `onConnect` 時重新呼叫 `GET /api/questions/:n/submissions`，以完整列表通知頁面。老師重新整理後重新登入（001 FR-015）時，控制台・搶答中掛載時本來就會 `listSubmissions` 並訂閱，取得的是伺服器上的完整列表（AC-29）；舊憑證的請求由 002 拒絕。
  - 學生：服務記住最近一次 `submitAnswer`／`getGroupSubmission` 的題號。`onConnect` 時若有 `onGroupSubmitted` 或 `onJudgement` 的訂閱，就重新 `getGroupSubmission(q)`：有送出且有 `onGroupSubmitted` 訂閱時通知它；判定為 `REJECTED` 且有 `onJudgement` 訂閱時通知它。004 的 `RealtimeClient` 不補送舊事件，所以由服務自己補。

## RD-09 Logging（原則 VI、VIII）

- **Decision**: 使用 002 的 pino logger（`loggerOptions`），記錄 `submission.accepted`（`seq`＝`SubmissionEngine.processed`、`questionNumber`、`groupNumber`、`rank`、`elapsedMs`、`requestId`）、`submission.duplicate`、`submission.rejected`（`seq`、`reason`）、`judgement.applied`、`judgement.ignored`。不記錄答案內容與任何憑證。
- **Rationale**: 人工驗證與壓力測試可用 log 對照順位（AC-22）；答案不需要出現在 log。

## RD-10 壓力測試（NFR-01、NFR-02、SC-002、SC-003）

- **Decision**: `server/tests/load/submission.load.ts`，以 `npm run test:load:submission -w server` 執行（命名沿用 004 的 `test:load:activity`），重複 20 輪，每輪結果記在 `specs/005-buzz-submission/load-test.md`（同 004：壓力測試是自動化量測，不放進人工驗證紀錄）：
  1. 以子程序啟動伺服器（隨機埠，Google 以 002 的測試替身取代），pino 輸出到暫存檔。
  2. 以 `socket.io-client`（只用 WebSocket 傳輸）建立 1 個老師連線與 200 個學生連線（20 組 × 10），學生經 004 的 `group:join` 加入。
  3. 老師經 004 的 HTTP 建立活動並開放一題。
  4. 1 秒內送出 1,000 筆：每個學生連線送 5 筆，其中包含「同一個 `requestId` 再送一次」與「同組不同連線各自送出」。
  5. 檢查：每筆恰好一個 ack；每組恰好一個 `ok` 的不同送出（重複的 `requestId` 回同一筆）；老師端被接受的 `rank` 為 1..20，學生收到的 `rank` 全為 0；每組被接受的 `requestId` 是 log 中該組 `seq` 最小的那一筆；每條學生連線都收到恰好一次 `submission:groupSubmitted`，而且是自己組的；老師收到的最後一份 `submissions:changed`、`GET /api/questions/:n/submissions`（直接回傳 `SubmissionStore.list(n)`）與 log 三者的順位一致；ack 延遲 p95 ≤ 1 s、最大 ≤ 2 s；老師收到的最後一份列表與最後一筆被接受的時間差 ≤ 1 s。
  6. 另開一個不讀取資料（暫停事件處理）的慢連線，確認其他連線的延遲仍在範圍內（NFR-04）。
- **Rationale**: 伺服器與模擬學生在不同程序，量測不受模擬端的 CPU 影響；不需要真的開 200 個瀏覽器分頁。

## RD-11 測試分層（原則 VIII）

- **單元**（Vitest，`server/tests/unit/submission/`）：`SubmissionEngine`（使用 004 真正的 `CommandQueue`、以假的 `performance.now` 控制的 `SequenceClock`，以及假的 `ActivityStore`、`ActivityManager`）、`SubmissionStore`、`SubmissionVisibility`、`SubmissionNotifier`（假計時器、假的 io）；前端 `ServerSubmissionService`（假的 `RealtimeClient` 與 `ApiClient`）。`CommandQueue`、`SequenceClock` 本身的測試屬於 004。
- **整合**（Vitest + Fastify `inject()` 與真的 Socket.IO 連線，`server/tests/integration/submission/`）：使用 002、004 的真正實作，Google 以 002 的測試替身取代。測試伺服器沿用 004 的 `server/tests/helpers/activityTestServer.ts`（老師憑證、`rotateTeacher()`、只用 WebSocket 的老師與學生連線、`emitWithAck`、`importResult`），005 只在旁邊加一個含題組的匯入範例與等待 005 事件的輔助函式，不另寫一份測試伺服器。
- **前端單元**：使用既有的 `frontend/tests/helpers/fakeRealtimeClient.ts`，不另寫假的 `RealtimeClient`。
- **端對端**（Playwright，`frontend/tests/e2e/`，經 004 的 `testServer.ts`／`server/tests/e2e/startTestServer.ts` 連到測試伺服器）：1 個老師分頁與 3 個學生分頁走完送出、組員跟著切換、拒絕、接受、自動結束；擷取學生分頁的 WebSocket 訊息檢查 R9。
- **壓力**：RD-10。
- **人工驗證**：每個 User Story 的 Phase 結尾各執行 quickstart 中該 Story 的情境，結果記在 `specs/005-buzz-submission/manual-verification.md`（implement 階段產生）；Polish 再把全部情境走一次。
