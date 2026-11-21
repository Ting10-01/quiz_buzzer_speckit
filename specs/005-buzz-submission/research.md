# Research: 搶答與判定

**Feature**: `005-buzz-submission` | **Date**: 2026-11-21 | **Plan**: [plan.md](./plan.md)

技術棧沿用 001 [research.md](../001-ui-prototype/research.md) 的 RD-01～RD-08（TypeScript strict、Node.js 24 LTS、Fastify、Socket.IO、pino、Vitest、Playwright、npm workspaces `frontend/` `shared/` `server/`），不另選框架。伺服器骨架、`app.io`、`TEACHER_ROOM`、`app.requireTeacher`、`ApiClient` 依 002 `contracts/server-extension.md`、`socket-handshake.md`；`CommandQueue`、`SequenceClock`、`ActivityStore`、`GroupMembership`、`ActivityManager`、`RealtimeClient` 依 004 `contracts/server-modules.md`、`socket-events.md`。本文件只處理 005 特有的問題：順序、時間、併發、資訊隔離與介面的落點。順序與併發的想法沿用舊 `002-buzzer-session` research R1～R4、R8，改成「老師依順序判定」（E4）。

---

## RD-01 順序怎麼保證（REQ-SUB-07、REQ-SUB-08、NFR-01）

- **Decision**: 005 不自己建立佇列。送出與判定都放進 004 的 `CommandQueue.run(command)`；004 的開放、結束一題也走同一條佇列（004 REQ-ACT-17），所以四種指令構成單一全序：送出若在結束之前被處理就有效、之後就被拒絕（AC-25）。`command` 是同步函式：從讀取 `ActivityStore`、驗證、取順位、`SequenceClock.stamp()` 到寫入 `SubmissionStore`，中間沒有任何 `await`（004 的 `run` 遇到回傳 Promise 會丟出錯誤）。推送一律在 `run` 回傳之後才排程。順位在臨界區內以「本題目前的送出數 + 1」取得。
- **處理序號**: 004 的 `CommandQueue` 沒有序號。`SubmissionEngine` 自己維護 `processed`：每處理一筆送出（不論結果）加 1，寫進 log 的 `seq`，讓壓力測試核對「每組被接受的是最早處理的那一筆」。因為只在 `run` 內遞增，順序與佇列相同。
- **Rationale**: Node.js 單執行緒，同步區段不會被插隊，不需要鎖；抵達順序就是 Socket.IO／Fastify 把訊息交給事件迴圈的順序。一條佇列由 004 擁有，避免兩個子功能各有一條、順序對不起來。
- **Alternatives considered**: 005 自己建一條佇列（和 004 的開放、結束不在同一個順序，只能靠「兩邊都同步」的假設維持）；資料庫交易或鎖（單一程序不需要，XI）；以學生端時間排序（可被竄改）。

## RD-02 時間與經過時間（REQ-SUB-09、NFR-03）

- **Decision**: 接受時間用 004 的 `SequenceClock.stamp()`（`max(上一次的值, performance.timeOrigin + performance.now())`）。開放時間直接讀 004 `ActivityState.openedAt.get(n)`，它也是同一個 `SequenceClock` 在開放那一刻記下的。`elapsedMs = acceptedAt − openedAt`，取整數。
- **Rationale**: 同一個單調時鐘，系統時間被調整不影響，且隨處理順序不減；005 不必另外記開放時間。順位只看處理順序，時間只供顯示與 006 計算「比第一名慢的秒數」。

## RD-03 學生送出走 Socket.IO，老師走 HTTP（REQ-SUB-02、REQ-SUB-17）

- **Decision**:
  - 學生「整組送出」：在 002 建立的 `app.io` 上新增事件 `submission:submit`，以 ack 回覆 `SubmitReply`。伺服器用 004 的 `GroupMembership.groupOf(socket)` 判斷組別。
  - 老師「列出送出」「判定」：HTTP REST（`GET /api/questions/:n/submissions`、`POST /api/questions/:n/judgements`），路由以 `app.register(submissionRoutes)` 註冊在 002 的 `buildApp`，每條加 `{ preHandler: app.requireTeacher }`。錯誤回應用 002 的 `{ code, message }`。
  - 推播：老師列表 `submissions:changed` 只送 `app.io.to(TEACHER_ROOM)`；判定 `submission:judged` 只送給 `groupOf(socket) === n` 的連線（RD-05）。
- **Rationale**: 001 RD-03 原則上是「指令走 REST、推播走 WebSocket」。學生送出是例外：組別必須由伺服器依連線判斷（001 RD-06、原則 VI），而 004 以 Socket.IO 連線記住組別，HTTP 請求沒有對應的連線身分。老師的指令照 001 RD-03 走 REST，直接用 002 的 `app.requireTeacher`。
- **Alternatives considered**: 學生送出也走 HTTP，另發「組別憑證」（多一套憑證，和 004 的 `studentToken` 重複）；老師判定也走 Socket.IO（要另外寫老師驗證）。

## RD-04 重複送出與連點（REQ-SUB-06、AC-05）

- **Decision**:
  - 前端 `ServerSubmissionService.submitAnswer` 每次送出產生 `requestId = crypto.randomUUID()`。同一題已有送出在進行中時，直接回傳同一個 Promise（連點只送一次）。送出因逾時或斷線失敗時，下一次按「整組送出」若題號與答案都相同，沿用同一個 `requestId`。
  - 伺服器把 `requestId` 存在 `SubmissionRecord`。同一組在本題已有紀錄時：`requestId` 相同 → 回覆第一次的結果（成功），不產生新紀錄；不同 → 拒絕「本組已送出此題」。
- **Rationale**: 不需要另外的「已處理請求」對照表；同組另一人送出的是不同 `requestId`，自然被判為「本組已送出此題」（AC-04）。驗證失敗的送出不存，重送時再驗證一次，結果相同。

## RD-05 推播量、判定通知與慢連線（REQ-SUB-10、REQ-SUB-15、NFR-02、NFR-04）

- **Decision**:
  - 老師列表合併：某題有變化時，若 200 ms 內沒有推送過就立刻推送，否則在 200 ms 視窗結束時推送一次最新的完整列表。
  - 判定通知不合併：老師判定 `ACCEPTED` 或 `REJECTED` 後，`SubmissionNotifier.judged` 走過 `app.io` 目前所有連線，送給 `GroupMembership.groupOf(socket) === n` 的那些。004 不建立組別房間（004 socket-events），所以 005 不維護 `group:<n>` 房間。
  - 所有 `emit` 都不等待對方回應。
- **Rationale**: 1 秒 1,000 筆送出時，老師最多每秒收到 5 份列表，落後不超過 1 秒。判定一次最多掃過約 200 條連線，且一題只有少數幾次判定，成本可忽略；比在 `group:join`、`group:leave`、斷線重連時同步維護房間簡單（XI）。Socket.IO 對每條連線各自緩衝，慢連線只塞住自己。
- **上限**: 連線數到數千條時，改成在 004 的加入組別流程中維護房間。
- **Alternatives considered**: 舊 002 的每連線 `Outbox`（舊設計每次送出都要推完整 view 給全部學生才需要它；005 的學生不收他組資料，不需要）；`socket.volatile.emit`（可能丟掉最後一份列表）。

## RD-06 作答期間的資訊隔離（REQ-SUB-16、R9）

- **Decision**: 學生端只會收到兩種送出資料：自己送出的 ack 與本組的 `submission:judged`，兩者都經 `SubmissionVisibility.forStudent()` 產生，不含 `rank`。送出列表只能經 `app.requireTeacher` 的 HTTP 與 `TEACHER_ROOM` 取得。送出時前端不傳組別；就算請求中夾帶 `groupNumber` 也被忽略。
- **Rationale**: 限制在伺服器端執行（原則 VI）；順位會透露其他組是否已送出，所以學生的 `Submission` 不帶 `rank`。這要求 001 把 `Submission.rank` 改為可選（spec「需請 001 修改」第 5 項）。
- **過渡做法**: 001 修改前 `rank` 仍是必填，型別無法通過編譯。005 實作開始前必須先完成這項 001 修改；不以 `rank: 0` 之類的假值代替。

## RD-07 判定規則與自動結束（REQ-SUB-11～15）

- **Decision**:
  - `judge(n, group, judgement)` 只在下列條件都成立時改變狀態：`ActivityStore.current()` 是 `OPEN` 且 `currentQuestion === n`；本題沒有 `ACCEPTED`；該組的紀錄是 `firstPending()`；`judgement` 是 `ACCEPTED` 或 `REJECTED`。否則不改變任何狀態，回傳本題目前的完整列表（HTTP 200）。請求格式錯誤回 400 `{ code, message }`。
  - `ACCEPTED`：在同一個 `CommandQueue.run` 內，標記 `ACCEPTED`、`winnerGroup`，再呼叫 004 的 `ActivityManager.endQuestion(n)`（就地執行）。因為前面已確認第 n 題開放中，不會碰到 `ActivityRuleError(QUESTION_NOT_OPEN)`。004 `commit` 時同步呼叫 `ActivityStore.subscribe` 的 listener（仍在 `run` 內），`SubmissionEngine.onActivityChange` 看到第 n 題不再開放，就呼叫 `SubmissionStore.closeQuestion(n)`，把其餘 `PENDING` 改成 `UNJUDGED`。
  - 老師手動按「結束這一題」走 004 自己的流程，同樣經 `subscribe` 觸發 `closeQuestion(n)`。
- **Rationale**: 001 介面的 `judge` 只回傳 `Submission[]`，沒有錯誤值；回傳目前列表讓頁面依伺服器的狀態重畫（原則 V）。接受與結束在同一個 `run` 內完成，接受之後不可能再有送出被收進本題。

## RD-08 001 頁面的落點與替換方式

- **Decision**: 前端新增 `frontend/src/services/server/ServerSubmissionService.ts`，在 `createServiceRegistry()` 把 `submission` 綁到它，並移除 `judgementControl`、`submissionValidationControl`（001 plan「替換模擬實作的方式」）。`MockSubmissionService` 是 001 的檔案，保留不刪，只供 001 的測試使用。
- 使用其他子功能的前端元件：
  - Socket.IO：004 的 `RealtimeClient`（每分頁一條連線，組別記在這條連線上）。送出用 `emitWithAck`（5 秒逾時，逾時以 `UnexpectedError("連不上伺服器")` reject）；重新連線用 `onConnect`；監聽 005 的事件需要 `RealtimeClient` 提供一般的事件訂閱（plan 交界假設 A-3）。
  - HTTP：002 的 `ApiClient.request(method, path, body?)`，自動帶老師憑證，錯誤轉成 `ApiError`（符合 `UnexpectedError`）。
- `ValidationError.field` 的值：`answers[i]`（第 i 格，從 0 開始）或 `submit`（送出提示區），見 spec「需請 001 修改」第 6 項。
- **老師端重新連線**: `RealtimeClient.onConnect` 觸發時，`onSubmissionsChange` 的訂閱重新呼叫 `GET /api/questions/:n/submissions`，以完整列表通知頁面（spec Clarifications）。

## RD-09 Logging（原則 VI、VIII）

- **Decision**: 使用 002 的 pino logger（`loggerOptions`），記錄 `submission.accepted`（`seq`＝`SubmissionEngine.processed`、`questionNumber`、`groupNumber`、`rank`、`elapsedMs`、`requestId`）、`submission.duplicate`、`submission.rejected`（`seq`、`reason`）、`judgement.applied`、`judgement.ignored`。不記錄答案內容與任何憑證。
- **Rationale**: 人工驗證與壓力測試可用 log 對照順位（AC-22）；答案不需要出現在 log。

## RD-10 壓力測試（NFR-01、NFR-02、SC-002、SC-003）

- **Decision**: `server/tests/load/submission.load.ts`，以 `npm run test:load -w server` 執行，重複 20 輪：
  1. 以子程序啟動伺服器（隨機埠，Google 以 002 的測試替身取代），pino 輸出到暫存檔。
  2. 以 `socket.io-client`（只用 WebSocket 傳輸）建立 1 個老師連線與 200 個學生連線（20 組 × 10），學生經 004 的 `group:join` 加入。
  3. 老師經 004 的 HTTP 建立活動並開放一題。
  4. 1 秒內送出 1,000 筆：每個學生連線送 5 筆，其中包含「同一個 `requestId` 再送一次」與「同組不同連線各自送出」。
  5. 檢查：每筆恰好一個 ack；每組恰好一個 `ok` 的不同送出（重複的 `requestId` 回同一筆）；被接受的 `rank` 為 1..20；每組被接受的 `requestId` 是 log 中該組 `seq` 最小的那一筆；老師收到的最後一份 `submissions:changed`、`GET /api/questions/:n/submissions`（直接回傳 `SubmissionStore.list(n)`）與 log 三者的順位一致；ack 延遲 p95 ≤ 1 s、最大 ≤ 2 s；老師收到的最後一份列表與最後一筆被接受的時間差 ≤ 1 s。
  6. 另開一個不讀取資料（暫停事件處理）的慢連線，確認其他連線的延遲仍在範圍內（NFR-04）。
- **Rationale**: 伺服器與模擬學生在不同程序，量測不受模擬端的 CPU 影響；不需要真的開 200 個瀏覽器分頁。

## RD-11 測試分層（原則 VIII）

- **單元**（Vitest，`server/tests/unit/submission/`）：`SubmissionEngine`（使用 004 真正的 `CommandQueue`、以假的 `performance.now` 控制的 `SequenceClock`，以及假的 `ActivityStore`、`ActivityManager`）、`SubmissionStore`、`SubmissionVisibility`、`SubmissionNotifier`（假計時器、假的 io）；前端 `ServerSubmissionService`（假的 `RealtimeClient` 與 `ApiClient`）。`CommandQueue`、`SequenceClock` 本身的測試屬於 004。
- **整合**（Vitest + Fastify `inject()` 與真的 Socket.IO 連線，`server/tests/integration/submission/`）：使用 002、004 的真正實作，Google 以 002 的測試替身取代。
- **端對端**（Playwright，`frontend/tests/e2e/`）：1 個老師分頁與 3 個學生分頁走完送出、拒絕、接受、自動結束；擷取學生分頁的 WebSocket 訊息檢查 R9。
- **壓力**：RD-10。
- **人工驗證**：`specs/005-buzz-submission/manual-verification.md`（implement 階段產生）。
