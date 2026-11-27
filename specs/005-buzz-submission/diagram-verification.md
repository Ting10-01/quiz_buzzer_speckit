# 005 圖表一致性驗證

驗證日期：2026-11-28；程式版本：`97ffafd0`（分支 `005-buzz-submission`，工作目錄沒有未提交的變更）

範圍（T034）：`diagrams/005-component.puml`、`diagrams/005-class.puml`、`diagrams/005-sequence.puml` 對照 `server/src/submission/*`、`frontend/src/services/server/ServerSubmissionService.ts`、`shared/src/submissionEvents.ts`，以及 `frontend/src/services/createServiceRegistry.ts`（`submission` 綁定）、`server/src/app.ts`（005 註冊的部分）。檢查清單依 `plan.md`「藍圖對照」。001、002、004 的檔案只確認名稱與被呼叫的介面；006 還沒實作，圖上 006 的依賴只確認被呼叫的介面存在。「說明」欄的 Dn 對應最後一節「差異與處理」。D1、D2、D8 處理後已重新產生三張 PNG（PlantUML CLI）；D3、D8 的程式修改後，伺服器測試全部通過。

## 組件圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| StudentPlayPage、ConsolePage ..> SubmissionService（7 個方法） | `frontend/src/services/interfaces.ts:51-64` | 一致 | 只確認簽章 |
| createServiceRegistry() --> ServerSubmissionService「只改 submission 的綁定」 | `createServiceRegistry.ts:16, 50` | 一致 | `mockBound` 只剩 `result`；004 的橋接只留 activity 部分 |
| ServerSubmissionService -\|> SubmissionService | `ServerSubmissionService.ts:24` | 一致 | |
| ServerSubmissionService --> RealtimeClient：emitWithAck(submit、own)、監聽三個事件、onConnect 補取 | `ServerSubmissionService.ts:38-40, 49, 61, 82, 87, 114-126` | 一致 | |
| ServerSubmissionService --> ApiClient：GET 列表、POST 判定 | `ServerSubmissionService.ts:77, 102` | 一致 | |
| RealtimeClient <--> SubmissionGateway（app.io） | `index.ts:21`；`SubmissionGateway.ts:22-27` | 一致 | |
| buildApp --> SubmissionRoutes：app.register | `server/src/app.ts:62`；`index.ts:22` | 一致 | `app.ts` 註冊的是組裝用 plugin `submissionRoutes`，它再註冊路由 plugin `submissionHttpRoutes`（D6） |
| SubmissionGateway ..> GroupMembership、--> CommandQueue run(submit) | `SubmissionGateway.ts:31-32` | 一致 | |
| SubmissionRoutes ..> app.requireTeacher、--> CommandQueue run(judge)、--> SubmissionStore 列出 | `SubmissionRoutes.ts:22, 27, 35` | 一致 | |
| （圖上沒有）SubmissionRoutes ..> ActivityStore | `SubmissionRoutes.ts:35-38` | 差異 | 在 run 內以 `current() === null` 判斷 409 `NO_ACTIVITY`（D1） |
| CommandQueue --> SubmissionEngine | `SubmissionGateway.ts:32`；`SubmissionRoutes.ts:35-37` | 一致 | |
| SubmissionEngine ..> ActivityStore：讀取、subscribe | `SubmissionEngine.ts:64, 89, 117, 153-167`；`index.ts:20` | 一致 | 訂閱寫在 `index.ts`，不在 Engine 內（D5） |
| SubmissionEngine --> SequenceClock、--> SubmissionStore | `SubmissionEngine.ts:63, 75, 130-132` | 一致 | |
| SubmissionEngine ..> ActivityManager：同一個 run 內 endQuestion、JudgeOutcome.activity | `SubmissionEngine.ts:134, 144` | 一致 | |
| SubmissionEngine ..> SubmissionNotifier「處理完後才通知（不在臨界區）」 | `SubmissionEngine.ts:80-81, 137-138`；`SubmissionNotifier.ts:36-57` | 一致 | 呼叫在 run 內，Notifier 只以 `setImmediate` 排程，實際 emit 在 run 之後 |
| SubmissionEngine ..> logger | `SubmissionEngine.ts:35, 52, 57, 76, 136, 140`；`index.ts:18` | 一致 | log 不含答案與憑證 |
| Notifier --> Visibility | `SubmissionNotifier.ts:48, 55` | 一致 | |
| Visibility --> Store | `SubmissionVisibility.ts:2`（只 import 型別） | 差異 | 程式方向相反：Store ..> Visibility（`SubmissionStore.ts:44, 77, 82`）；類別圖畫法與程式一致（D2） |
| （圖上沒有）Notifier --> Store | `SubmissionNotifier.ts:66` | 差異 | 類別圖有，組件圖沒有（D2） |
| Notifier ..> app.io TEACHER_ROOM | `SubmissionNotifier.ts:67` | 一致 | |
| Notifier ..> GroupMembership：只送 groupOf = 該組的連線 | `SubmissionNotifier.ts:74-78` | 一致 | |
| ResultService（006）..> SubmissionStore | 驗證時 `index.ts:9` 只 export 類別 | 差異 | 實例只存在 `submissionRoutes` 內；已改為 `app.submissions`（D8） |
| 註解：同一條佇列、臨界區沒有 await 與網路傳送 | `SubmissionEngine.ts:44-83, 116-146`；`SubmissionNotifier.ts:18-20` | 一致 | |
| 註解：學生 rank 一律為 0 | `SubmissionVisibility.ts:18-20` | 一致 | T035 等 001 |

## 類別圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 001 的 `Judgement`、`Submission`、`ValidationError`、`Activity`、`JudgeOutcome`、`SubmissionService` | `shared/src/entities.ts:109-122`；`interfaces.ts:51-64` | 一致 | 只確認名稱與簽章 |
| `SubmitRequest`、`SubmitReply`、`OwnSubmissionRequest`、`OwnSubmissionReply`、`JudgeRequest`、`GroupSubmitted`、`SubmissionsChanged`、`SubmissionJudged` | `submissionEvents.ts:12-56` | 一致 | 欄位、可選性相同；另有 5 個事件名稱常數（:5-9），plan「藍圖對照」有列（D10） |
| `ServerSubmissionService { -inFlight, -lastRequest, -lastQuestion }` 與 7 個公開方法 | `ServerSubmissionService.ts:26-30, 43-103` | 一致 | 另有私有 listener 集合、`requestFor`、`catchUp`、`tell`（D10） |
| ServerSubmissionService --> RealtimeClient（emitWithAck、onConnect、on、followTeacherCredential）；老師端方法先 followTeacherCredential() | `ServerSubmissionService.ts:35, 76, 81, 101` | 一致 | |
| ServerSubmissionService --> ApiClient.request | `ServerSubmissionService.ts:36, 77, 102` | 一致 | |
| `SubmissionGateway { +register(io), -onSubmit(socket, request, ack), -onOwn(socket, request, ack) }` | `SubmissionGateway.ts:22, 29, 37` | 差異 | `onSubmit`、`onOwn` 是公開的（D3）；參數型別為 `unknown`（D4） |
| `SubmissionRoutes { +register(app), -list(n), -judge(n, request) }` | `SubmissionRoutes.ts:18-41` | 一致 | 以 Fastify plugin 常數 `submissionHttpRoutes` 實作，兩條路由的 handler 對應 list、judge（D6） |
| `SubmissionEngine { -processed, +submit, +ownSubmission, +judge, +onActivityChange, -validate }` | `SubmissionEngine.ts:23, 44, 86, 104, 116, 153` | 差異 | `processed` 是 `protected`、`validate` 是公開的（D3）；另有私有 `openQuestion`、`currentOpenQuestion`（D10） |
| `SubmissionStore` 的 1 個欄位與 6 個方法 | `SubmissionStore.ts:43-83` | 一致 | 另有私有 `visibility`（D7） |
| `QuestionSubmissions { questionNumber, records, winnerGroup [0..1], closed, byGroup(), firstPending() }` | `SubmissionStore.ts:22-38` | 一致 | |
| `SubmissionRecord` 的 8 個欄位 | `SubmissionStore.ts:5-19` | 一致 | |
| `SubmissionVisibility { forTeacher, forStudent }` | `SubmissionVisibility.ts:7-20` | 一致 | |
| `SubmissionNotifier { -pending, -timer [0..1], +submissionsChanged, +groupSubmitted, +judged, -flush }` | `SubmissionNotifier.ts:23-25, 36-71` | 一致 | 另有私有 `flushScheduled`、`sendToGroup`（D10） |
| Gateway --> Engine；Routes --> Engine、Store；Engine --> Store、Visibility；Engine ..> Notifier；Notifier --> Visibility、Store；Store ..> Visibility | 各檔建構參數與 `index.ts:15-22` | 一致 | Store 自己建立一個 Visibility（D7） |
| Gateway --> CommandQueue、..> GroupMembership、..> app.io；Routes --> CommandQueue、..> requireTeacher | `SubmissionGateway.ts:18-32`；`SubmissionRoutes.ts:22, 35`；`index.ts:21` | 一致 | |
| （圖上沒有）SubmissionRoutes ..> ActivityStore | `SubmissionRoutes.ts:14, 36` | 差異 | D1 |
| Engine --> SequenceClock、..> ActivityStore（current、subscribe）、..> ActivityManager（endQuestion、snapshot(TEACHER)） | `SubmissionEngine.ts:63-64, 134, 144`；`index.ts:20` | 一致 | subscribe 見 D5 |
| Notifier ..> app.io TEACHER_ROOM、..> GroupMembership | `SubmissionNotifier.ts:11, 67, 76` | 一致 | |
| 註解：rank 從 1 連續遞增、acceptedAt = stamp()、elapsedMs = acceptedAt − openedAt[n]、requestId 重複回同一筆 | `SubmissionEngine.ts:49-54, 63-74` | 一致 | `elapsedMs` 另取整數，找不到 `openedAt` 時為 0（D10） |
| 註解：forStudent 的 rank 為 0 | `SubmissionVisibility.ts:18-20` | 一致 | |
| 註解：CommandQueue 同步、run 內 endQuestion 就地執行、subscribe listener 在 run 內 | `SubmissionEngine.ts:134, 153-163` | 一致 | |
| 註解：Notifier 三個方法都只排程 | `SubmissionNotifier.ts:36-57` | 一致 | `judged` 遇 `UNJUDGED` 直接不送（REQ-SUB-15） |
| 註解：processed 每筆加 1、寫入 log 的 seq | `SubmissionEngine.ts:45-46, 52, 57, 77` | 一致 | |

## 時序圖

| 段落與步驟 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 1. FS → GW：emitWithAck(submission:submit, {n, answers, requestId}) | `ServerSubmissionService.ts:43-56, 106-111` | 一致 | 逾時重送沿用同一個 requestId |
| 1. GW → GM.groupOf → Q.run(engine.submit(group, request)) | `SubmissionGateway.ts:31-32` | 一致 | payload 中的組別被忽略（`pick`） |
| 1. EN → AS.current()；validate 順序：開放中 → 本組未送過 → 格數 → 非空白 → ≤ 200 字 | `SubmissionEngine.ts:86-101` | 一致 | 前面另有「未加入組別」「格式錯誤」，與 data-model 第 92 行相同 |
| 1. EN → CL.stamp() → ST.append(rank, elapsedMs, PENDING) → SubmitReply；log seq | `SubmissionEngine.ts:63-82` | 一致 | |
| 1. ack 為學生視角（rank = 0） | `SubmissionEngine.ts:82` | 一致 | |
| 1. EN ->> NT：groupSubmitted、submissionsChanged | `SubmissionEngine.ts:80-81` | 一致 | |
| 1. NT ->> 同組其他分頁 submission:groupSubmitted（rank = 0） | `SubmissionNotifier.ts:47-50, 74-78` | 一致 | 送出者自己的分頁也會收到（D9） |
| 1. NT ->> 老師 submissions:changed，200 ms 內合併 | `SubmissionNotifier.ts:16, 36-71` | 一致 | 第一次變更在下一輪送出，之後 200 ms 內的變更合併為一次 |
| opt：同一個 requestId 回第一次的結果、不再通知；本組已送出；不在開放中 | `SubmissionEngine.ts:49-58, 90-91` | 一致 | 題目已結束時，重複的 requestId 回「這一題目前不能作答」，與 data-model 的檢查順序相同 |
| opt：新分頁 emitWithAck(submission:own) → groupOf → ownSubmission（不經佇列） | `ServerSubmissionService.ts:59-63`；`SubmissionGateway.ts:37-43`；`SubmissionEngine.ts:104-108` | 一致 | |
| 2. FT.followTeacherCredential() → ApiClient POST（Bearer）→ requireTeacher → Q.run | `ServerSubmissionService.ts:100-103`；`SubmissionRoutes.ts:30-37` | 一致 | |
| 2. （圖上沒有）run 內先檢查 `ActivityStore.current()`，沒有活動回 409 | `SubmissionRoutes.ts:35-38` | 差異 | D1 |
| 2. EN：firstPending() 是第 2 組 → REJECTED → snapshot(TEACHER) → JudgeOutcome（OPEN） | `SubmissionEngine.ts:116-145` | 一致 | 不符合判定條件時不改變狀態，回傳目前列表 |
| 2. NT ->> 第 2 組所有分頁 submission:judged | `SubmissionNotifier.ts:53-57` | 一致 | |
| 3. ACCEPTED → winnerGroup → AC.endQuestion(n) → AS commit → subscribe listener → closeQuestion(n) → snapshot | `SubmissionEngine.ts:130-145, 153-160` | 一致 | listener 另呼叫一次 `submissionsChanged(n)`，與判定的那次合併 |
| 3. EN ->> NT：judged(第 5 組)、submissionsChanged(n) | `SubmissionEngine.ts:137-138` | 一致 | 第 5 組也會收到 `submission:judged`（ACCEPTED），圖上沒畫（D9） |

## 差異與處理

「建議」欄：**程式改**＝改程式對齊圖；**圖改**＝改圖對齊程式；**可接受**＝兩邊都不改。

| # | 差異 | 影響 | 建議 | 理由 | 決定 |
| --- | --- | --- | --- | --- | --- |
| D1 | `SubmissionRoutes` 在 run 內讀 `ActivityStore.current()`，沒有活動回 409 `NO_ACTIVITY`；三張圖都沒有 Routes → ActivityStore | 圖上看不出 409 從哪裡來 | **圖改**：組件圖、類別圖加 `SubmissionRoutes ..> ActivityStore : current()，沒有活動回 409`；時序圖第 2 段 run 內加這一步 | 若改程式（把檢查移進 `Engine.judge`），`judge` 的回傳型別要變成 `JudgeOutcome \| null`，圖一樣要改，改動更大 | 已處理，圖改（2026-11-28）：組件圖、類別圖加上 `SubmissionRoutes ..> ActivityStore`；時序圖第 2 段 run 內加 `current()` 檢查 |
| D2 | 組件圖畫 `Visibility --> Store`，程式是 `Store ..> Visibility`（`list`、`winner` 用 `forTeacher`）；組件圖也沒有 `Notifier --> Store` | 依賴方向畫反 | **圖改**：組件圖改為 `Store ..> Visibility`，加 `Notifier --> Store : 讀取完整列表` | 類別圖已是這個方向，程式與類別圖一致 | 已處理，圖改（2026-11-28）：組件圖改為 `Store ..> Visibility`，加 `Notifier --> Store` |
| D3 | 存取修飾不同：`SubmissionEngine.validate` 公開、`processed` 是 `protected`；`SubmissionGateway.onSubmit`、`onOwn` 公開；圖上都是私有 | 外部可以繞過佇列直接呼叫 | **程式改**：四個成員改為 `private` | 沒有測試直接呼叫 `validate`、`onSubmit`、`onOwn`；`processed` 的測試以型別轉換讀取，改成 `private` 不受影響 | 已處理，程式改（2026-11-28）：`processed`、`validate`、`onSubmit`、`onOwn` 改為 `private` |
| D4 | `onSubmit`、`onOwn` 的 `request`、`ack` 型別是 `unknown`，圖上是 `SubmitRequest`、`OwnSubmissionRequest` 與 ack 函式型別 | 只是型別寫法 | **可接受** | 網路傳來的 payload 不能信任（原則 VII），先以 `unknown` 接收、在 `pick` 與 Engine 驗證；圖表示的是驗證後的意義 | 可接受，兩邊都不改（2026-11-28） |
| D5 | 圖上 `SubmissionEngine` 自己 `subscribe` ActivityStore；程式在 `index.ts:20` 訂閱，再呼叫 `engine.onActivityChange` | 組裝位置不同，行為相同 | **可接受** | listener 仍在 run 內同步呼叫 Engine；訂閱放在組裝處與其他依賴一起建立，Engine 不需要知道自己怎麼被接上 | 可接受，兩邊都不改（2026-11-28） |
| D6 | 圖上 `SubmissionRoutes` 是有 `register`、`list`、`judge` 的類別；程式是 Fastify plugin 常數 `submissionHttpRoutes`，而 `index.ts` 的組裝 plugin 名為 `submissionRoutes` | 名稱容易混淆：`submissionRoutes` 不是圖上的 SubmissionRoutes | **可接受** | 與 004 `activityRoutes` 的表示法相同；`index.ts` 的 `submissionRoutes` 名稱寫在 plan「藍圖對照」，要改名須先改 plan | 可接受，兩邊都不改（2026-11-28） |
| D7 | `SubmissionStore` 自己 `new SubmissionVisibility()`，`index.ts` 另建一個給 Engine、Notifier，共兩個實例 | `SubmissionVisibility` 沒有狀態，結果相同 | **可接受** | 改成建構子注入會讓 006 建立 Store 時也要傳 Visibility，沒有實際好處 | 可接受，兩邊都不改（2026-11-28） |
| D8 | 006 的 `ResultService ..> SubmissionStore`：目前 Store 實例只存在 `submissionRoutes` 內，沒有掛到 `app` 上 | 006 實作時要修改 005 的 `index.ts`（例如 `app.decorate('submissions', …)`）才拿得到實例 | **可接受（延後到 006）** | 005 範圍內沒有使用者；何時、以什麼名稱公開由 006 的 plan 決定，與 004 對 005、006 的處理相同 | 不接受，程式與圖都改（2026-11-28 使用者決定）：比照 004 `app.activity`，`index.ts` 以 `app.decorate('submissions', …)` 提供 `SubmissionStore`（T062、T063），006 不必修改 005 的檔案；contracts/submission-store.md「取得方式」先記錄；組件圖、類別圖的 006 依賴標上 `app.submissions` |
| D9 | 時序圖只畫 `groupSubmitted` 送到同組「另一個」分頁，程式也送到送出者自己的分頁；第 3 段第 5 組也收到 `submission:judged`（ACCEPTED），圖上沒畫 | 送出者與被接受的組多收到一則事件 | **可接受** | 圖註已說明第 5 組由 `onPhaseChange` 切換、不另外顯示已接受；001 頁面收到 `groupSubmitted` 時導向同一個 S-Submitted（`StudentPlayPage.tsx:185-186`），`onJudgement` 只處理 REJECTED（`StudentPlayPage.tsx:282-283`），多收到的事件不改變畫面 | 可接受，兩邊都不改（2026-11-28） |
| D10 | 私有成員（listener 集合、`requestFor`、`catchUp`、`tell`、`flushScheduled`、`sendToGroup`、`openQuestion`、`currentOpenQuestion`）、建構參數、事件名稱常數、`sendError`、`Audience` import、`elapsedMs` 取整數與 `openedAt` 缺值時為 0 等細節沒畫 | 不影響設計 | **可接受** | 圖不需要畫到這個粒度；事件名稱常數已列在 plan「藍圖對照」 | 可接受，兩邊都不改（2026-11-28） |
