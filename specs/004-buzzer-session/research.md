# Research: 活動與階段同步

**Feature**: `004-buzzer-session` | **Date**: 2026-11-21 | **Plan**: [plan.md](./plan.md)

整個專案的技術選擇沿用 001 的 [research.md](../001-ui-prototype/research.md) RD-01～RD-08（React + TypeScript + Vite；Node.js 24 LTS + Fastify；指令走 REST、推播走 Socket.IO；活動狀態只在伺服器記憶體；pino；Vitest + Playwright；npm workspaces `frontend/` `shared/` `server/`），不另選框架。本文件只處理 004 特有的問題。舊設計（`origin/002-buzzer-session` 的 research R1～R9）中與 004 有關的部分在此改寫；每題限時、公平模式、取回老師身分的連結、首頁發老師憑證都已拿掉。

新增的套件只有 Socket.IO 本身：`socket.io`（server）、`socket.io-client`（frontend；server 的整合與壓力測試也用）。

---

## RA-01 指令走哪一條通道

- **Decision**: 老師的指令（建立活動、修改設定、開放、結束）走 HTTP REST，路由掛 `{ preHandler: app.requireTeacher }`（002）。學生的「加入組別」「離開組別」走 Socket.IO 事件，以 ack 回覆。
- **Rationale**: RD-03 選 REST 是為了讓 002 的老師驗證最好寫、最好測，老師指令照做。學生的組別是「這一條連線屬於哪一組」（原則 VI，`GroupMembership.groupOf(socket)`），用同一條連線加入，伺服器就直接知道是哪一條連線，不必再把 HTTP 請求對應回 WebSocket 連線。005 的送出也會走同一條連線。
- **Alternatives considered**: 學生加入也走 REST（要多一個「HTTP 請求 → 連線」的對應，多一個可被冒用的地方）；老師指令也走 Socket.IO（002 的 `requireTeacher` 用不上，要在 gateway 另寫一套權限檢查）。

## RA-02 依抵達順序逐一處理（REQ-ACT-17）

- **Decision**: `CommandQueue.run(command)` 以同步程式碼執行 `command` 並回傳結果，中間不得有 `await`。所有改變活動狀態的操作都經過它：004 的建立、修改設定、開放、結束、加入、離開，以及 005 的送出與判定。已在 `run` 內時再呼叫 `run`（例如 005 的判定內呼叫 `endQuestion`）直接就地執行，成為同一個指令的一部分。
- **Rationale**: Node.js 單執行緒，同步程式碼不會被其他事件插隊，所以「一筆處理完才處理下一筆」不需要鎖；抵達順序就是 Fastify 與 Socket.IO 把請求交給事件迴圈的順序。沿用舊設計 R1。004 與 005 共用同一條，才能讓「結束這一題」和「送出」誰先誰後有明確答案。
- **Alternatives considered**: async mutex（臨界區內允許 `await`，順序就要靠鎖的實作，難測）；每個子功能各自一條佇列（結束與送出之間沒有順序）。
- **ponytail**: `CommandQueue` 只是一個「確認沒有 `await`」的集中點；整個伺服器只有一條，量級（一間教室）用不到分組或 worker。

## RA-03 狀態版本號（REQ-ACT-14、AC-24）

- **Decision**: `ActivityStore` 每次 `commit` 把 `version` 加 1（從 1 開始），包含只有組別人數改變的 commit。伺服器送出的每一份狀態都是 `ActivitySnapshot { version, activity }`。前端 `HttpActivityService.apply(snapshot)` 只採用 `version` 比手上更大的快照；每次連線（含重新連線）成功時先清掉手上的版本，採用連線後收到的第一份。
- **Rationale**: 老師按鈕的 REST 回應與 Socket.IO 推送是兩條通道，抵達順序不一定；只看版本號就能丟掉舊的那份，畫面不會倒退。重新連線時清掉，是因為伺服器重啟後版本號會從 1 重新開始。`Activity` 是 001 的實體，不能加欄位，所以版本號放在外層的 `ActivitySnapshot`，由服務拆開。
- **Alternatives considered**: 以時間戳排序（電腦時鐘可調整）；推送差異（前端要自己合併，違反原則 V）；只靠 Socket.IO 單一連線的順序（REST 回應不在那條連線上）。

## RA-04 推送方式（REQ-ACT-16、NFR-01）

- **Decision**: `ActivityBroadcaster` 訂閱 `ActivityStore`。commit 時只把 `flushScheduled` 設為 true 並以 `setImmediate` 排程；排程到時讀取當下最新的狀態，送一份 `activity:snapshot` 給 `TEACHER_ROOM`（`'teacher'`，`Audience.TEACHER`）、一份給 `students` 房間（`Audience.PUBLIC`）。同一輪事件迴圈內有多次 commit 時只送最新一份。
- **Rationale**: 網路傳送不在 `CommandQueue` 內（沿用舊設計 R1、R4）；只送最新一份讓 200 個學生同時加入時不會推送 200 次 × 201 個連線。版本號仍嚴格遞增，只是可能跳號，前端不在意跳號。
- **Alternatives considered**: 在佇列內直接 emit（違反「臨界區不做網路傳送」）；每條連線一個 `Outbox`、只保留最新一份並等 ack（舊設計 R4）。
- **ponytail**: 不做 `Outbox`。004 每題只有兩次階段改變，加入組別也已合併；Socket.IO 每條連線各自緩衝，慢的連線不會擋住別的連線。005 的老師端答案列表若在大量送出時需要每連線合併，再由 005 加。

## RA-05 不倒退的時間（REQ-ACT-18）

- **Decision**: `SequenceClock.stamp()` 回傳 `max(上一次的值, performance.timeOrigin + performance.now())`（毫秒）。`openQuestion` 記 `openedAt[n]`、`endQuestion` 記 `endedAt[n]`。005 的送出時間也用同一個 `SequenceClock`。
- **Rationale**: `performance.now()` 是單調時鐘，不受系統時間調整影響；`max` 保證不倒退（沿用舊設計 R2）。005 的「開放後經過的時間」= 送出時間 − `openedAt[n]`，兩者用同一個時鐘才不會出現負數。
- **Alternatives considered**: `Date.now()`（系統時間被調整時會倒退）。

## RA-06 學生身分與重新整理（REQ-ACT-12、13）

- **Decision**:
  - 學生第一次 `group:join` 時，伺服器以 `crypto.randomBytes(16)` 產生 `studentToken`（base64url），在 ack 中回傳。前端存在該分頁的 `sessionStorage`（鍵 `quizBuzzer.studentToken`），重新整理後仍在、分頁關閉後消失。
  - 每次連線時放在 handshake `auth.studentToken`；`GroupMembership.attach(socket, token)` 把這條連線對應到該 token。伺服器不認得的 token（例如伺服器重啟後）直接忽略，該連線視為還沒加入；下一次 `group:join` 的 ack 會給新的 token。
  - 已加入人數以 token 計算：同一個 token 重新加入同一組不重複計算；換組時從原組移到新組；斷線不減少。
  - `groupOf(socket)` = `groupByStudent.get(studentBySocket.get(socket.id))`。
  - 重新整理後頁面回到首頁（001 RD-11 不變），學生選回原組即回到原組。不要求 001 自動帶學生回原組，以免多改一套頁面切換。
- **Rationale**: cookie 與 `localStorage` 由同一個瀏覽器的所有分頁共用，所有學生分頁會變成同一個人（違反原則 VI 的分頁區分，RD-06）；`sessionStorage` 以分頁為單位。由伺服器發 token，伺服器重啟後舊 token 自然失效。token 只是「這個分頁」的代號，不是祕密，但仍不寫進 log（RA-12）。
- **Alternatives considered**: 每次重新整理都當新學生（第 1 題開放後就無法回到原組，也會重複計算人數）；前端自己產生 UUID（效果相同，但伺服器重啟後舊 UUID 仍會被當成有效身分）；重新整理後自動跳回作答頁（要改 001 的 `AppRouter` 與學生頁面的進入點，D21 之外再多一項修改）。

## RA-07 老師的即時連線

- **Decision**:
  - Socket.IO 伺服器由 002 建立（`app.io`，002 `contracts/socket-handshake.md`）。handshake 時 002 驗證 `auth.teacherToken`：有效 → 加入 `TEACHER_ROOM`（`'teacher'`）、`socket.data.isTeacher = true`；沒有帶 → 一般連線；錯誤或已作廢 → 拒絕連線（`connect_error`，`err.message === 'UNAUTHORIZED'`）。
  - 004 在 `connection` 時把 `socket.data.isTeacher` 為 false 的連線加入 `students` 房間；老師連線已由 002 放進 `TEACHER_ROOM`，004 不再處理。
  - 前端 `RealtimeClient` 的 `auth` 每次連線時以 002 的 `TeacherCredentialStore.get()` 讀老師憑證，並記下這次用的憑證（`connectedTeacherToken`）。
  - 任何人以 Google 登入時，002 讓新登入者取代前一位老師（舊憑證作廢），並以 `io.in(TEACHER_ROOM).disconnectSockets(true)` 中斷所有舊老師連線。這是伺服器主動中斷，Socket.IO 用戶端不會自動重連，所以 `RealtimeClient` 收到 `disconnect` 原因為 `io server disconnect` 時呼叫 `reconnect()`，以當下的憑證重新 handshake。
  - 收到 `connect_error` `UNAUTHORIZED`：若 `TeacherCredentialStore.get()` 已換成別的憑證，以新憑證重連；否則記下被拒的憑證（`rejectedTeacherToken`），之後的 handshake 不再帶它，以一般連線重連。這個分頁之後只收學生版快照；它的老師指令會被 002 的 `ApiClient` 回「老師登入已失效，請回首頁重新登入」。
  - `getCurrentActivity` 與四個老師指令執行前，若 `TeacherCredentialStore.get()` 與 `connectedTeacherToken` 不同，先 `reconnect()`。依 001 最終版，老師登入後的第一個活動指令是 T-Setup 的 `createActivity`（T-Lobby 不呼叫 `getCurrentActivity`），所以重新連線發生在建立活動之前，T-Lobby 之後的 `onActivityChange` 一定是老師版的快照。
- **Rationale**: 老師與學生的連線收到的內容只差在 `spreadsheet.id`（RA-08）；老師的指令仍走 REST，連線只用來收推送。
- **Alternatives considered**: 所有人都在同一個房間收同一份（學生會拿到試算表 ID）。

## RA-08 學生收到的內容（REQ-ACT-19、原則 VI）

- **Decision**: `ActivityView.toActivity(state, counts, audience)`：`TEACHER` 回傳完整的 `Activity`；`PUBLIC` 把 `spreadsheet.id` 換成空字串，其餘相同。兩種都不含任何送出資料（送出不在 `ActivityState` 裡）。
- **Rationale**: 學生頁面只用到階段、題號、題目與組別；試算表 ID 用不到就不給。`Activity.spreadsheet` 是 001 實體的必填欄位，所以用空字串而不是拿掉欄位。
- **Alternatives considered**: 學生版另外定義型別（要改 001 的介面與頁面）。

## RA-09 `getCurrentActivity` 與兩種通知（001 介面）

- **Decision**:
  - `getCurrentActivity()`：連線後伺服器立即送一份目前狀態（REQ-ACT-15）；手上已有快照時直接回傳，否則等下一份 `activity:snapshot`。5 秒內沒收到以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」 reject。不另設 `GET` 端點。依 001 最終版，只有 Main 與 S-Join 載入時呼叫；T-Lobby 用 `createActivity`、`updateSettings` 的回傳值，之後靠 `onActivityChange`。
  - `onActivityChange(listener)`：每採用一份新版本就通知（`activity` 不是 `null` 時）。
  - `onPhaseChange(listener)`：只在 `phase`、`currentQuestion` 或 `groupCount` 與上一次通知的不同時（含從沒有活動變成有活動）通知。
- **Rationale**: 狀態只有一個來源（Socket.IO 推送），初次載入也走同一條，不會出現 GET 與推送不一致。`onPhaseChange` 不因人數改變而通知，避免作答頁因為別組有人加入就被重畫；`groupCount` 改變只發生在準備中，讓選組頁能更新組別清單。
- **Alternatives considered**: 另設 `GET /api/activity`（兩個來源，要處理順序）；`onPhaseChange` 每個版本都通知（作答頁可能被不相干的人數變化重畫）。

## RA-10 錯誤怎麼回到頁面（原則 VII、001 RD-13）

- **Decision**:

  | 情況 | 伺服器回應 | `HttpActivityService` |
  | --- | --- | --- |
  | 成功 | `200 ActivitySnapshot` | 套用後回傳 `Activity` |
  | 組數不合法 | `200 ValidationError { field: "groupCount", message }` | 以 001 `shared/src/guards.ts` 的 `isValidationError` 判斷後原樣回傳 |
  | 規則不允許（已有活動、沒有匯入、不是下一題…） | `409 { code, message }`（`ErrorBody`） | `ApiClient` 的 `ApiError` 直接 reject（符合 `UnexpectedError`） |
  | 沒有老師身分 | `401 UNAUTHORIZED`（002 的 `app.requireTeacher`） | `ApiClient` 以「老師登入已失效，請回首頁重新登入」reject（002 處理） |
  | 網路錯誤 | — | `ApiClient` 以 `ApiError`（`code: "NETWORK"`）「連不上伺服器，請確認伺服器已啟動」 reject |
  | `group:join` 不允許 | ack `{ snapshot, error: { code, message } }` | 以 `UnexpectedError(error.message)` reject（001 的 `joinGroup` 回傳 `Promise<Activity>`，沒有預期失敗的回傳值） |
  | `group:leave` 在第 1 題開放後 | ack `{ snapshot, error: { code, message } }` | 以 `UnexpectedError(error.message)` reject |
  | ack 5 秒沒回 | — | 以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」 reject（與 002 的訊息相同） |

- **Rationale**: 001 規定預期中的失敗用回傳值、其他用 `UnexpectedError`；002 規定錯誤回應一律是 `ErrorBody { code, message }`、前端一律經 `ApiClient`，預期中的錯誤由各服務辨識後轉成回傳值。`ApiClient` 遇到非 2xx 只保留 `{ status, code, message }`，`ValidationError` 的 `field` 會遺失，所以預期中的失敗一律以 `200` 回傳、前端用型別判斷函式區分；非 2xx 只用於非預期錯誤與 401。`409` 的情況頁面流程不會發生（按鈕只在正確的階段出現），只有連點、兩個老師分頁、伺服器重啟，或 D21 暫時限制下老師重新登入後又按「建立活動」（`ACTIVITY_EXISTS`）時才會出現，顯示在共通錯誤訊息區即可。`group:join`、`group:leave` 被拒絕在正常流程中很少發生（選組頁只列出存在的組別；換組被拒只發生在重新整理後選錯組，或按下重新選擇的同時老師開放第 1 題），以 `UnexpectedError` 顯示在共通錯誤訊息區即可，配合 001 的介面，不請 001 修改（使用者 2026-11-22 決定）。
- **Alternatives considered**: 把 409 也做成 `ValidationError`（沒有對應的欄位可以顯示）。

## RA-11 只用 WebSocket（001 D22）

- **Decision**: 伺服器端由 002 的 `attachSocketServer` 設定 `transports: ['websocket']`（規則由 004 定義、002 實作）；004 的前端 `io({ transports: ["websocket"] })`；004 的整合測試驗證只用長輪詢的用戶端連不上。
- **Rationale**: 長輪詢在分頁多時會撞到瀏覽器對同一網域 6 條 HTTP/1.1 連線的限制（001 RD-03）。

## RA-12 Logging

- **Decision**: 以 002 建立的 pino logger 記錄 `activity.created`（組數、題數）、`question.opened`、`question.ended`（題號、版本）、`group.joined`、`group.left`（組別、各組人數）。不記錄 `studentToken`，也不記錄 handshake 物件；在 002 的 `server/src/logger.ts` `loggerOptions.redact.paths` 加上 `*.studentToken`（`*.teacherToken` 002 已有）。
- **Rationale**: 人工驗證時對照階段與人數（原則 VIII）；token 不進 log（原則 VI）。

## RA-13 Socket.IO 伺服器與模組註冊

- **Decision**: Socket.IO 伺服器由 002 建立（`app.io`），004 不另外 `new Server(...)`，只在 `app.io` 上處理 `connection`、學生事件與推送。activity 模組在 002 的組合根 `buildApp(config, deps)` 中以 `app.register(...)` 註冊；`createActivityModule(app, deps)` 從 `app` 取得 `app.io` 與 `app.requireTeacher`，`deps` 提供 003 的 `ImportStore`。四條老師路由加進 002 T043 的「老師專用路由清單」測試。005 沿用同一個 `app.io` 與 `RealtimeClient`，只新增事件。
- **Rationale**: 002 `contracts/server-extension.md`、`socket-handshake.md` 已定義這些擴充點；照用就不會有兩個 Socket.IO 伺服器或兩套老師驗證。

## RA-14 換掉模擬實作時，其他模擬實作怎麼辦

- **Decision**: `createServiceRegistry()` 把 `activity` 改綁 `HttpActivityService`，移除 `phaseControl` 與 `activityValidationControl`。005、006 還沒完成前，`MockSubmissionService` 與 `MockResultService` 仍讀 `MockSession.teacherActivity` 與 `joinedGroup`；組合根在 `submission` 或 `result` 仍是模擬實作時，把 `HttpActivityService` 的活動（`onActivityChange`）與本分頁加入的組別（`joinGroup`、`leaveGroup` 的結果）寫進 `MockSession`。這段橋接只在組合根，005、006 換掉模擬實作後刪除。
  另外，模擬的 `judge(ACCEPTED)` 只改 `MockSession.teacherActivity`（001 M4），伺服器上的題目不會結束；組合根包一層 `judge`：回傳的 `JudgeOutcome.activity` 不是 `OPEN` 時，呼叫 `HttpActivityService.endQuestion(q)`，並以它回傳的活動取代 `JudgeOutcome.activity`，讓老師端的切換與伺服器一致。學生分頁的「模擬：接受」只推進模擬的階段，不影響伺服器；接上 004 後學生頁面改由真正的階段推動，要等老師結束題目才切換。
- **Rationale**: 001 plan「替換模擬實作的方式」只允許改組合根；不橋接的話，004 一換上去，學生的「整組送出」就因為 `joinedGroup` 是空的而無法展示，老師接受後也會因為伺服器上的題目還開著而無法開放下一題。
- **Alternatives considered**: 讓 `HttpActivityService` 直接寫 `MockSession`（真正的實作依賴模擬實作，違反原則 III）。

## RA-15 壓力測試（NFR-01、NFR-02、SC-002）

- **Decision**: `server/tests/load/phaseSync.load.ts`：在隨機埠啟動伺服器（Google 與匯入以替身取代），以 `socket.io-client` 建立 1 個老師與 200 個學生連線（20 組 × 10，只用 WebSocket）。先讓 200 個學生在 1 秒內同時加入（NFR-02），再由老師依序開放並結束 4 題。每個連線記錄收到每個版本的時間。通過條件：每次階段改變 1 秒內送達全部 201 個連線、每個連線的版本號嚴格遞增、結束時所有連線的狀態與伺服器相同、每個加入都恰好一次 ack、各組人數總和為 200。`npm run test:load:activity -w server` 重複 20 次。
- **Rationale**: 沿用舊設計 R8 的做法，改成量測階段同步；送出的壓力測試（1 秒 1,000 筆）屬於 005。
