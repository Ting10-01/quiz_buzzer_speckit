# Research: 搶答活動

**Feature**: `002-buzzer-session` | **Date**: 2026-11-15 | **Plan**: [plan.md](./plan.md)

技術棧沿用 001 的決定（TypeScript、Node.js 24 LTS、Socket.IO、React + Vite + Tailwind CSS、Vitest、npm workspaces）。本文件處理 002 特有的問題：順序、時間、併發、倒數與身分。

## R1. 順序怎麼保證（REQ-BUZ-11、NFR-01）

- **Decision**: 所有改變狀態的指令（開題、結束題目、結束活動、送出）都進入伺服器上唯一的 `CommandQueue`，以**同步程式碼**逐一處理：從驗證、`takeNextSeq()`、寫入送出紀錄到回傳結果，中間沒有任何 `await`。推送畫面、寫檔等非同步工作一律在處理完之後才排程。
- **Rationale**: Node.js 是單執行緒事件迴圈，同步執行的區段不會被其他事件插隊，因此「一筆處理完才處理下一筆」不需要鎖就成立；抵達順序就是 Socket.IO 把訊息交給事件迴圈的順序。序號由同一個計數器在臨界區內遞增，必然唯一、連續、沒有空號。
- **Alternatives considered**: 資料庫交易或分散式鎖（單一程序不需要，增加延遲與複雜度）；用學生端時間戳排序（可被竄改，違反 REQ-BUZ-11）；Worker threads 平行處理（需要額外同步，反而破壞順序保證）。

## R2. 接受時間不倒退（NFR-02）

- **Decision**: `SequenceClock.stamp()` 以 `performance.timeOrigin + performance.now()` 取得毫秒時間，再取 `max(上一次發出的時間, 現在)`。
- **Rationale**: `performance.now()` 是單調時鐘，不受系統時間調整影響；再加上 `max` 保證同一毫秒的多筆送出時間相同、不會倒退（AC-27）。順位只看序號，時間只供顯示。
- **Alternatives considered**: `Date.now()`（系統時間被調整時可能倒退）。

## R3. 重複送出（REQ-BUZ-14、AC-12）

- **Decision**: 學生端每次按下送出時以 `crypto.randomUUID()` 產生 `submissionId`，重試時沿用同一個。伺服器以 `Map<submissionId, SubmitResult>` 記住結果，重複抵達時回傳第一次的結果，`status` 為 `DUPLICATE`，不取新序號。
- **Rationale**: 網路重試或連點都不會產生第二筆紀錄；同組另一位成員送出的是不同 `submissionId`，會因「本組已送過此題」被拒絕（AC-11）。

## R4. 推送與慢連線（NFR-04、NFR-05）

- **Decision**: `Broadcaster` 為每個連線維護一個 `Outbox`：
  - 畫面資料（view）只保留最新一份；上一份還沒被前端確認收到（Socket.IO ack）之前，新的 view 直接取代待送的那份。
  - 送出回覆（submit result）逐筆保留、依序送出。
  - 老師端的 view 在大量送出時以 200 ms 為間隔合併推送，滿足「落後 ≤ 1 秒」。
- **Rationale**: 每條連線各自排隊，慢的連線只塞住自己的 Outbox，不會拖慢排序或其他人；只保留最新 view 讓佇列長度固定。
- **Alternatives considered**: 直接 `io.emit` 廣播（慢連線會讓伺服器端緩衝無限增長）；`socket.volatile.emit`（可能丟掉最後一份狀態，畫面停在舊階段）。

## R5. 倒數計時（REQ-BUZ-22、SC-008）

- **Decision**: 開題時伺服器計算 `deadline`，`QuestionTimer` 以 `setTimeout` 在截止時把 `CloseQuestionCommand(TIMEOUT)` 放進 `CommandQueue`。推給前端的 view 帶 `remainingSec`（伺服器計算的剩餘秒數），前端以收到的那一刻為基準本地倒數，每次收到新的 view 就重新校正。
- **Rationale**: 截止由伺服器決定（原則 V），且結束指令和送出走同一條佇列，所以「歸零的那一刻」和送出誰先誰後一定有明確答案（AC-13）。前端用 `remainingSec` 而非絕對時間，避免學生電腦時鐘不準造成顯示誤差。
- **Alternatives considered**: 前端自己倒數到 0 就通知伺服器（不可信，且各分頁不同步）。

## R6. 老師與學生的身分（REQ-BUZ-02、REQ-BUZ-07）

- **Decision**:
  - 老師：`POST /api/teacher/session` 發出一組隨機憑證（`crypto.randomBytes(32)`，base64url），存在老師瀏覽器的 `localStorage`，所以關閉分頁後在同一個瀏覽器重新開啟仍是老師（spec Edge Cases）。同時只能有一個老師憑證；已有進行中的活動時，只有持有原憑證的瀏覽器能取回老師身分。伺服器重新啟動後憑證失效，老師頁面自動重新申請。HTTP 用 `Authorization: Bearer`，Socket.IO 連線用 `auth.teacherToken`。
  - 學生：連線後送 `student:join { groupId }`，伺服器回一個 `participantId`（存在 `sessionStorage`，每個分頁各自一位學生，方便用多分頁模擬各組），重新整理後帶著它重連即回到原組別。
- **Rationale**: 本機模擬不需要帳號密碼，但老師操作必須在伺服器端驗證，學生分頁無法冒充（AC-06）；憑證不寫入檔案或 log（原則 VI）。

## R7. 公平模式的判定（REQ-BUZ-17）

- **Decision**: `FairPolicy.resolve(question, submissions, winsSoFar)`：取該題第一筆送出時間 `t0`，在 `[t0, t0 + window]` 內的送出中，選 `winsSoFar` 最小者，平手取序號最小者；`FirstArrivalPolicy` 直接取序號最小者。兩者都是純函式。
- **Rationale**: 純函式讓「依紀錄重新判定得到相同結果」（AC-28）可以直接測試。

## R8. 壓力測試（SC-006、SC-007）

- **Decision**: `packages/server/tests/load/` 以 `socket.io-client` 在同一台電腦建立 200 個連線（20 組 × 10），開題後在 1 秒內送出 1,000 筆（含重複送出與同組搶同題），檢查：每筆都有回覆、被接受的序號 1..N 連續不重複、回覆延遲 p95 ≤ 1 秒、最長 ≤ 2 秒、老師 view 與搶答結果順位一致。用 `npm run test:load -w packages/server` 執行，重複 20 次。
- **Rationale**: 對應 NFR-04 與 SC-006、SC-007；在本機量測，符合「不必架設伺服器」的作業規定。

## R9. 前端狀態

- **Decision**: 前端不自行推導階段（原則 V）：每個頁面只訂閱伺服器推來的 `TeacherView` 或 `StudentView`，以 React state 顯示；送出只發指令，畫面等伺服器回覆再改變。
- **Rationale**: 避免前端與伺服器狀態不一致；斷線重連後拿到最新 view 即可還原畫面（REQ-BUZ-07）。
