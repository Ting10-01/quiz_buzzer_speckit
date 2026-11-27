# 004 圖表一致性驗證

驗證日期：2026-11-27；程式版本：`f9169a8`（分支 `004-buzzer-session`，工作目錄沒有未提交的變更）

範圍（T052）：`diagrams/004-component.puml`、`diagrams/004-class.puml`、`diagrams/004-sequence.puml` 對照 `server/src/activity/*`、`shared/src/activityRules.ts`、`shared/src/activitySync.ts`、`frontend/src/services/HttpActivityService.ts`、`frontend/src/services/RealtimeClient.ts`，以及 `frontend/src/services/createServiceRegistry.ts`（`activity` 綁定）、`server/src/app.ts`（004 註冊的部分）。檢查清單依 `plan.md`「藍圖對照」與「時序圖與測試」。001、002、003 的檔案只確認名稱與被呼叫的介面。005、006 還沒實作，圖上 005、006 的依賴只確認被呼叫的介面存在。「說明」欄的 Dn 對應最後一節「差異與處理」。D3–D5 處理後已重新產生三張 PNG（PlantUML CLI）。

## 組件圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 001 頁面 ..> ActivityService | `frontend/src/services/interfaces.ts:32-49` | 一致 | 10 個方法的簽章與圖相同 |
| TeacherPages、StudentPages ..> activityRules（001 依 C2 引用） | `frontend/src/` 沒有任何檔案引用 `activityRules` | 差異（預期） | 001 尚未完成 C2（D1） |
| createServiceRegistry() --> HttpActivityService「只改 activity 的綁定」 | `createServiceRegistry.ts:44-47` | 差異 | 另有 RA-14 的暫時橋接 `bridgeMocksToActivity`（:68-111），包住 `joinGroup`、`leaveGroup` 與 005 模擬的 `judge`；plan 有寫，圖上沒有（D2） |
| HttpActivityService -\|> ActivityService | `HttpActivityService.ts:16` | 一致 | |
| HttpActivityService --> RealtimeClient | `HttpActivityService.ts:26-29` | 一致 | |
| HttpActivityService --> ApiClient（老師的指令） | `HttpActivityService.ts:30, 53, 125, 133` | 一致 | |
| RealtimeClient ..> TeacherCredentialStore.get() → auth.teacherToken | `RealtimeClient.ts:24, 116-125` | 一致 | |
| HttpActivityService ..> activitySync | `HttpActivityService.ts:4` | 一致 | |
| ApiClient --> activityRoutes（Bearer） | `activityRoutes.ts:27-53` | 一致 | |
| RealtimeClient <--> ActivityGateway（WebSocket，handshake auth） | `RealtimeClient.ts:30-33`；`ActivityGateway.ts:24-25` | 一致 | |
| activityRoutes ..> app.requireTeacher | `activityRoutes.ts:25` | 一致 | |
| ActivityGateway ..> app.io、socket.data.isTeacher | `ActivityGateway.ts:16-21`；`index.ts:44` | 一致 | |
| activityRoutes --> ActivityManager | `activityRoutes.ts:31, 37, 39, 46, 52` | 一致 | |
| ActivityGateway --> ActivityManager（加入、離開、連線時取 snapshot） | `ActivityGateway.ts:34, 40, 43` | 一致 | |
| ActivityManager --> CommandQueue（每個指令都經過） | `ActivityManager.ts:70, 96, 109, 126, 146, 166, 188` | 一致 | `snapshot()` 只讀，不經過佇列，與 data-model 相同 |
| ActivityManager --> ActivityStore、GroupMembership、SequenceClock | `ActivityManager.ts:61-63, 175, 200` | 一致 | |
| ActivityManager ..> ImportStore（建立活動時） | `ActivityManager.ts:74` | 一致 | |
| ActivityManager ..> activityRules | `ActivityManager.ts:1` | 一致 | 只用 `GROUP_COUNT_MIN`、`GROUP_COUNT_MAX` |
| （圖上沒有）ActivityManager ..> 002 的 logger | `ActivityManager.ts:65`；`index.ts:44`（`app.log`） | 差異 | 細節（D8） |
| ActivityStore <.. ActivityBroadcaster（subscribe） | `ActivityBroadcaster.ts:24` | 一致 | |
| ActivityBroadcaster --> ActivityView、GroupMembership | `ActivityBroadcaster.ts:41` | 一致 | |
| ActivityBroadcaster --> ActivityGateway：emit activity:snapshot | `ActivityBroadcaster.ts:33-34` | 差異 | 程式由 Broadcaster 直接以 `io.to(...)` 推送，不經過 Gateway（D3） |
| （圖上沒有）ActivityGateway ..> ActivityBroadcaster（`STUDENTS_ROOM`） | `ActivityGateway.ts:3, 22`；`ActivityBroadcaster.ts:9` | 差異 | 房間名稱常數定義在 Broadcaster（D7） |
| 005 ..> CommandQueue、GroupMembership.groupOf、ActivityManager.endQuestion、ActivityStore、SequenceClock；006 ..> ActivityStore | `index.ts:19-25, 51`（`app.activity`） | 一致 | 被呼叫的介面都存在；005、006 還沒實作，呼叫端無法驗證 |
| 註解：所有指令同一條佇列、同步執行、推送在之後才排程 | `CommandQueue.ts:5-22`；`ActivityBroadcaster.ts:23-29` | 一致 | |
| 註解：快照帶版本、前端只採用較新的、同一輪只送最新一份、取消時送 null | `ActivityBroadcaster.ts:25-41`；`HttpActivityService.ts:148-149`；`ActivityStore.ts:39-43` | 一致 | |
| （圖上沒有）`createActivityModule` 與 `app.activity` | `index.ts:19-55`；`server/src/app.ts:59` | 差異 | plan「藍圖對照」與 `contracts/server-modules.md` 有寫，圖上沒有（D8） |

## 類別圖

| 圖上的元素 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 001 的 `Activity`、`Group`、`ActivitySettings`、`ValidationError`、`ActivityPhase`、`ActivityService` | `shared/src/entities.ts`；`interfaces.ts:32-49` | 一致 | 只確認名稱與簽章 |
| `ActivitySnapshot { version, activity [0..1] }` | `shared/src/activitySync.ts:5-8` | 一致 | |
| `GroupAck { snapshot, studentToken [0..1], error [0..1] }` | `shared/src/activitySync.ts:11-17` | 一致 | |
| `activityRules`：2、20、6、`JOIN_METHOD_TEXT`、`WAIT_ROUND_TEXT` | `shared/src/activityRules.ts:4-13` | 一致 | 文字與 spec 相同由 `activityRules.test.ts` 確認 |
| `HttpActivityService { -realtime, -api, -latest, -lastPhaseKey, -apply(): boolean }` | `HttpActivityService.ts:18-30, 148` | 一致 | `realtime`、`api` 的型別是 `Pick<...>`；另有私有的 listener 集合、`waiters`、`saveSettings`、`questionCommand`、`activityAfter`（D8） |
| （圖上沒有）`HttpActivityService -followTeacherCredential()` | `HttpActivityService.ts:119-121`；在 `getCurrentActivity` 與五個老師指令開頭呼叫（:40, 45, 51, 86, 132） | 差異 | 見 D4 |
| HttpActivityService ..> UnexpectedError（含 joinGroup 被拒絕） | `HttpActivityService.ts:72, 80, 143` | 一致 | 以 `Error(message)` reject，符合 001 `UnexpectedError { message }` |
| HttpActivityService ..> ApiError（原樣 reject） | `HttpActivityService.ts:124-134` | 一致 | 不 catch |
| `RealtimeClient { -socket, -connectedTeacherToken, -rejectedTeacherToken }` | `RealtimeClient.ts:15-19` | 一致 | `socket` 為 `Socket \| null`；另有 `listeners`、`connectListeners`、建構參數 `credentials`、`createSocket`（D8） |
| `RealtimeClient +connect() +reconnect() +on<T>() +onConnect() +emitWithAck<T>() +studentToken() +setStudentToken()` | `RealtimeClient.ts:28, 55, 74, 83, 91, 100, 108` | 一致 | |
| （圖上沒有）`RealtimeClient +followTeacherCredential(): boolean` | `RealtimeClient.ts:66-72` | 差異 | 公開方法，`HttpActivityService` 的建構子型別把它列為必填（T064）；類別圖與 data-model §3 都沒有（D4） |
| （圖上沒有）`RealtimeClient -handshakeAuth()` | `RealtimeClient.ts:116-125` | 差異 | 私有，細節（D8） |
| `ApiClient`、`ApiError`、`TeacherCredentialStore`（002） | `frontend/src/services/http/` | 一致 | 只確認名稱 |
| `ActivityState { spreadsheet, questions, groupCount, phase, currentQuestion [0..1], openedAt, endedAt }` | `ActivityStore.ts:7-19` | 一致 | `phase` 型別排除 `NO_ACTIVITY`，與 data-model 相同 |
| `ActivityStore { -state, -version, current(), version(), commit(), subscribe() }` | `ActivityStore.ts:23-53` | 一致 | 欄位名稱是 `currentVersion`（TypeScript 不能與方法 `version()` 同名）；`current()` 回傳 `Readonly`；另有 `listeners`（D8） |
| `GroupMembership` 的 2 個欄位與 8 個方法 | `GroupMembership.ts:12-69` | 一致 | 名稱、參數、回傳型別都相同 |
| `SocketRef { id }` | `GroupMembership.ts:4-6` | 一致 | |
| `CommandQueue { -running, run<T>() }` | `CommandQueue.ts:4-14` | 一致 | |
| `SequenceClock { -last, stamp() }` | `SequenceClock.ts:4-11` | 一致 | |
| `ActivityManager` 的 8 個方法 | `ActivityManager.ts:69, 95, 108, 125, 145, 165, 187, 208` | 一致 | 簽章相同；另有私有 `logGroup`、`refuse`，建構參數多 `log: ActivityLog`（D8） |
| `ActivityRuleError { code, message }` «exception»；ActivityManager ..> 它 : throws | `ActivityManager.ts:12-20` | 一致 | |
| （圖上沒有）activityRoutes ..> ActivityRuleError、002 的 `sendError` | `activityRoutes.ts:2-3, 16-22` | 差異 | 細節（D8） |
| `Audience { TEACHER, PUBLIC }` «enum» | `ActivityView.ts:5-9` | 一致 | `as const` 物件加型別，是表示法差異 |
| `ActivityView.toActivity(state, counts, audience)` | `ActivityView.ts:15` | 一致 | |
| `ActivityBroadcaster { -io, -flushScheduled, start(), -flush() }` | `ActivityBroadcaster.ts:14-35` | 一致 | 另有私有 `snapshot(audience)`（:37），與 `ActivityManager.snapshot` 內容相同（D8） |
| `ActivityGateway { attach(io), -onConnection(socket) }` | `ActivityGateway.ts:16, 20` | 一致 | 另有私有 `noSuchGroup`（:47）；也依賴 `Audience`（:5），圖上沒有（D8） |
| `activityRoutes` 的 5 條路由 | `activityRoutes.ts:27-53` | 一致 | |
| `ImportStore.latest()`（003）、`app.requireTeacher`、`app.io { TEACHER_ROOM = 'teacher' }`（002） | `ActivityManager.ts:74`；`activityRoutes.ts:25`；`server/src/realtime/socketServer.ts:12` | 一致 | |
| ActivityBroadcaster ..> app.io | `ActivityBroadcaster.ts:33-34` | 一致 | 與組件圖的畫法不同，見 D3 |
| 註解：ActivityStore 版本從 1 開始、只改人數也遞增、listener 同步呼叫只排程、取消時 commit(null) | `ActivityStore.ts:24, 39-43`；`ActivityManager.ts:114, 138, 154` | 一致 | |
| 註解：CommandQueue 同步、巢狀呼叫就地執行 | `CommandQueue.ts:7-14, 18-22` | 一致 | 另會拒絕回傳 Promise 的指令 |
| 註解：studentToken 由伺服器以 `crypto.randomBytes` 產生、依 token 計算人數、reset 保留 token | `GroupMembership.ts:1, 34-42, 50-56, 66-68` | 一致 | |
| 註解：PUBLIC 的空白 Spreadsheet、FINISHED 時 currentQuestion 為最後一題 | `ActivityView.ts:12, 19-23`；`ActivityManager.ts:196-200` | 一致 | |
| SetupPage、StudentPlayPage ..> activityRules（C2） | 001 頁面沒有引用 | 差異（預期） | D1 |

## 時序圖

| 段落與步驟 | 程式位置 | 結果 | 說明 |
| --- | --- | --- | --- |
| 1. createActivity：HS → ApiClient POST → requireTeacher → AM → Q.run | `HttpActivityService.ts:39-42, 124-128`；`activityRoutes.ts:27-31`；`ActivityManager.ts:69-70` | 一致 | HS 在送出前先 `followTeacherCredential()`（D4） |
| 1. 檢查順序：ACTIVITY_EXISTS、組數 ValidationError，之後才 `IS.latest()` | `ActivityManager.ts:71-77` | 差異 | 程式是 ACTIVITY_EXISTS → `latest()`／NO_IMPORT → 組數；與 data-model 第 107 行的順序相同，圖與它們不同（D5） |
| 1. commit(PREPARING) → listener 只排程 → 回 snapshot(v1) | `ActivityManager.ts:78-89`；`ActivityBroadcaster.ts:24-28` | 一致 | |
| 1. 組數不合法回 200 + ValidationError；HS apply 後回傳 | `activityRoutes.ts:8-10`；`HttpActivityService.ts:124-128, 140-145` | 一致 | |
| 1. BC 下一輪推送：TEACHER_ROOM 完整、students 房間 PUBLIC；老師分頁因版本不新而忽略 | `ActivityBroadcaster.ts:27, 31-35`；`HttpActivityService.ts:149` | 一致 | 推送路徑見 D3 |
| 2. joinGroup：HS emitWithAck → GW → AM → Q.run → 規則 → GM.join → commit → ack | `HttpActivityService.ts:68-76`；`ActivityGateway.ts:28-37`；`ActivityManager.ts:125-142` | 一致 | |
| 2. HS 存 studentToken、apply | `HttpActivityService.ts:74-75` | 一致 | |
| 3. openQuestion：連點只生效一次、QUESTION_NOT_NEXT、openedAt = stamp()、commit(OPEN) | `ActivityManager.ts:165-179` | 一致 | |
| 4. endQuestion：已結束回傳目前狀態、QUESTION_NOT_OPEN、endedAt、最後一題 FINISHED | `ActivityManager.ts:187-205` | 一致 | 005 就地執行由 `CommandQueue.ts:7` 支援 |
| 5. 重新整理：handshake auth.studentToken → GM.attach → emit 目前快照 | `RealtimeClient.ts:116-125`；`ActivityGateway.ts:24-25, 43` | 一致 | |
| 5. 同一個 token 已在第 3 組 → 不重複計算；GroupAck | `GroupMembership.ts:34-42, 50-56`；`ActivityManager.ts:136-141` | 一致 | 程式仍會 commit 一次（版本 +1），圖上這一段沒畫 commit（D6） |
| 5. 第 1 題開放後選別組 → GROUP_LOCKED → UnexpectedError | `ActivityManager.ts:133-135`；`HttpActivityService.ts:70-73` | 一致 | |
| 6. 002 換發憑證、中斷舊老師連線 → RealtimeClient 自動重連 | `RealtimeClient.ts:38-41` | 一致 | |
| 6. HS：`TeacherCredentialStore.get() ≠ connectedTeacherToken → RealtimeClient.reconnect()` | `HttpActivityService.ts:86, 119-121`；`RealtimeClient.ts:66-72` | 差異 | 比較在 `RealtimeClient.followTeacherCredential()` 內進行（`connectedTeacherToken` 是 RealtimeClient 的私有欄位），HS 只呼叫它並在回傳 true 時清除 `latest`（D4） |
| 6. 新 handshake → 002 驗證 → TEACHER_ROOM → TEACHER 快照 | `ActivityGateway.ts:21-22, 43` | 一致 | |
| 7. cancelActivity：DELETE → requireTeacher → AM → Q.run → 沒有活動回傳目前狀態、CANCEL_LOCKED → GM.reset() → commit(null) | `HttpActivityService.ts:50-52`；`activityRoutes.ts:39`；`ActivityManager.ts:108-118` | 一致 | |
| 7. HS apply → onPhaseChange(null) → resolve；BC 推送 activity: null | `HttpActivityService.ts:52, 163-166`；`ActivityBroadcaster.ts:31-41` | 一致 | |

## 差異與處理

| # | 差異 | 影響 | 建議處理 | 決定 |
| --- | --- | --- | --- | --- |
| D1 | 001 頁面還沒引用 `activityRules`（C2） | 頁面的組數規則與說明文字由 001 處理；T028、T044 對應的 2 個 e2e 仍是 `test.skip` | 不改；等 001 完成 C2 後解除 skip | 延後，依 001 C2（2026-11-27）：頁面引用 `activityRules` 與解除 2 個 `test.skip` 屬於 001 的工作，004 的程式與圖已提供規則，不影響 T052 完成 |
| D2 | 組件圖沒有 RA-14 的暫時橋接 `bridgeMocksToActivity` | 005、006 完成後移除，plan 有記錄 | 在組件圖 Registry 加註「RA-14 暫時橋接，005、006 完成後移除」，或維持現狀 | 可接受，圖不改（2026-11-27）：橋接是 005、006 完成前的暫時程式，已記在 plan「替換模擬實作」與 research RA-14，完成後會移除，畫進藍圖反而會留下過時的元素 |
| D3 | 組件圖與時序圖畫成「Broadcaster → Gateway：emit」；程式由 Broadcaster 直接用 `app.io` 推送（類別圖 `ActivityBroadcaster ..> appIo` 與程式一致） | 只是畫法，行為相同 | 改組件圖與時序圖：Broadcaster 經 `app.io` 推送 | 已處理（2026-11-27）：組件圖改為 `Broadcaster ..> app.io`；時序圖新增 `app.io` 參與者，推送改由它送出；連線當下的快照仍由 Gateway 送出 |
| D4 | `RealtimeClient.followTeacherCredential(): boolean` 與 `HttpActivityService` 私有的 `followTeacherCredential()` 不在類別圖、data-model §3；時序圖第 6 段把比較畫在 HS | T062、T064 加入的公開方法沒有回寫到設計 | 類別圖與 data-model 的 RealtimeClient 加上 `+followTeacherCredential(): boolean`；時序圖第 6 段改成 `HS -> RealtimeClient : followTeacherCredential()`，在 RealtimeClient 內比較 | 已處理（2026-11-27）：類別圖與 data-model §3 加上兩個 `followTeacherCredential`；時序圖新增 `RealtimeClient` 參與者，第 6 段改由它比較並重新連線 |
| D5 | 時序圖第 1 段把組數檢查畫在 `IS.latest()` 之前；程式與 data-model 是 NO_IMPORT 先 | 沒有匯入且組數不合法時，程式回 409 `NO_IMPORT`，依圖應回 ValidationError | 改時序圖，照 data-model 與程式的順序（程式與 data-model 一致，不改程式） | 已處理（2026-11-27）：時序圖第 1 段改為 ACTIVITY_EXISTS → `latest()`／NO_IMPORT → 組數 ValidationError |
| D6 | 時序圖第 5 段沒畫同組重新加入時的 commit（版本 +1） | 只是省略 | 維持現狀，或補一行 `AM -> ST : commit` | 可接受，圖不改（2026-11-27）：第 2 段已畫出加入組別時的 commit，第 5 段重點是同一個 studentToken 不重複計算；版本 +1 的規則已寫在類別圖 ActivityStore 的註解 |
| D7 | `STUDENTS_ROOM` 定義在 `ActivityBroadcaster.ts`，Gateway 從那裡 import | 圖上沒有 Gateway → Broadcaster 的依賴 | 維持現狀（只是常數），或把常數移到 `ActivityGateway.ts` 讓依賴方向與圖相同 | 可接受，圖不改（2026-11-27）：只共用一個房間名稱常數，沒有呼叫關係；組件圖已寫明 Gateway 管理 students 房間、Broadcaster 推送到 students 房間 |
| D8 | 私有成員、建構參數、logger、`sendError`、`createActivityModule` 等細節沒畫 | 不影響設計 | 不改（圖不需要畫到這個粒度） | 可接受，圖不改（2026-11-27）：私有成員與組裝細節不影響組件、公開方法與呼叫順序；`createActivityModule` 與 `app.activity` 已記在 plan「藍圖對照」與 contracts/server-modules.md |
