# Data Model: 活動與階段同步

**Feature**: `004-buzzer-session` | **Date**: 2026-11-21 | **Blueprint**: [`diagrams/004-class.puml`](../../diagrams/004-class.puml)

類別名稱、欄位、方法與關聯和 `diagrams/004-class.puml` 一一對應。001 的實體（`Activity`、`Group`、`ActivityPhase`、`ActivitySettings`、`ValidationError`、`UnexpectedError`、`Spreadsheet`、`Question`）照 001 的 [data-model.md](../001-ui-prototype/data-model.md)，004 不改欄位，也不改介面簽章（`joinGroup` 照 001 回傳 `Promise<Activity>`，預期中的失敗以 `UnexpectedError` reject）。

## 1. 共用型別（`shared/src/`，004 新增）

### `activityRules.ts`

| 常數 | 值 | 用途 |
| --- | --- | --- |
| `GROUP_COUNT_MIN` | 2 | T-Setup「−」何時不可用（001 spec US2 AC-7 已交給 004，004 套用）；伺服器驗證（REQ-ACT-02） |
| `GROUP_COUNT_MAX` | 20 | T-Setup「+」何時不可用（同上）；伺服器驗證 |
| `GROUP_COUNT_DEFAULT` | 6 | T-Setup 建立模式的初始值（001 spec FR-023 把預設值交給 004） |

001 已完成但 T-Setup 沒有引用這些常數，由 004 修改 `SetupPage.tsx` 套用（REQ-ACT-23、research RA-16）。

### `activitySync.ts`

| 型別 | 欄位 | 規則 |
| --- | --- | --- |
| `ActivitySnapshot` | `version: number`、`activity: Activity \| null` | `version` 來自 `ActivityStore`，從 1 開始、每次 commit 加 1；`activity` 依對象由 `ActivityView` 產生；沒有活動時為 `null`。伺服器剛啟動時 `version` 為 0；活動被取消後 `version` 照樣遞增（research RA-03） |
| `GroupAck` | `snapshot: ActivitySnapshot`、`studentToken?: string`、`error?: { code: string; message: string }` | `group:join`、`group:leave` 的 ack。成功加入時有 `studentToken`；被拒絕時有 `error`（見「加入與離開組別被拒絕」），`snapshot` 仍是目前狀態；前端以 `UnexpectedError(error.message)` reject |

## 2. 伺服器（`server/src/activity/`）

### `ActivityState`（活動的權威狀態）

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `spreadsheet` | `Spreadsheet` | 建立時取自 `ImportStore.latest()`，之後不變 |
| `questions` | `Question[]` | 同上，1 題以上；依題號由小到大 |
| `groupCount` | `number` | 2–20 的整數；只能在 `PREPARING` 修改，且不少於 `GroupMembership.highestOccupiedGroup()` |
| `phase` | `ActivityPhase` | 只會是 `PREPARING`、`OPEN`、`QUESTION_ENDED`、`FINISHED`；沒有活動時 `ActivityStore` 的狀態是 `null`（不使用 `NO_ACTIVITY`） |
| `currentQuestion` | `number \| undefined` | `PREPARING` 時沒有；`OPEN`、`QUESTION_ENDED` 時為該題題號；`FINISHED` 時為最後一題題號 |
| `openedAt` | `Map<number, number>` | 題號 → 開放時間（`SequenceClock.stamp()`）；005 用來算經過時間 |
| `endedAt` | `Map<number, number>` | 題號 → 結束時間；006 用來顯示結束時間 |

「已鎖定組別」不另設欄位：`phase !== PREPARING` 即表示第 1 題已開放過。

### 狀態轉換

```text
（null）--createActivity--> PREPARING
PREPARING --updateSettings--> PREPARING（只改 groupCount）
PREPARING --cancelActivity--> （null）（GroupMembership.reset()）
PREPARING --openQuestion(1)--> OPEN(1)
OPEN(n) --endQuestion(n)，n 不是最後一題--> QUESTION_ENDED(n)
OPEN(n) --endQuestion(n)，n 是最後一題--> FINISHED（currentQuestion = n）
QUESTION_ENDED(n) --openQuestion(n+1)--> OPEN(n+1)
```

- 重複的要求：`OPEN(n)` 時 `openQuestion(n)`、`QUESTION_ENDED(n)` 或 `FINISHED` 且 `n ≤ currentQuestion` 時 `endQuestion(n)`、沒有活動時 `cancelActivity()`，不改變狀態、不 commit，回傳目前的快照（REQ-ACT-07、REQ-ACT-22）。
- 其他不在上表的轉換一律 `ActivityRuleError`，狀態不變。

### `ActivityStore`

| 成員 | 說明 |
| --- | --- |
| `-state: ActivityState \| null` | 唯一權威的活動狀態 |
| `-version: number` | 從 0 開始；`commit` 時加 1 |
| `+current()` | 回傳目前狀態（唯讀使用，不得修改） |
| `+version()` | 目前版本 |
| `+commit(next)` | `next` 為 `ActivityState` 或 `null`（取消活動）。取代狀態、版本加 1、同步呼叫所有 listener，回傳新版本。組別人數改變時以同一個 `state` commit，只讓版本加 1 |
| `+subscribe(listener)` | listener 只做排程，不做網路傳送；回傳 `Unsubscribe` |

只能在 `CommandQueue.run` 內呼叫 `commit`。005、006 只讀 `current()`。

### `GroupMembership`

| 成員 | 說明 |
| --- | --- |
| `-groupByStudent: Map<string, number>` | `studentToken` → 組別 |
| `-studentBySocket: Map<string, string>` | `socket.id` → `studentToken` |
| `+attach(socket, studentToken?)` | 連線時呼叫；token 存在於 `groupByStudent` 才對應，否則忽略 |
| `+detach(socket)` | 斷線時呼叫；只移除 `studentBySocket`，不影響人數 |
| `+groupOf(socket)` | 這條連線所屬的組別，沒有時 `null`（給 005） |
| `+join(socket, groupNumber)` | 連線沒有 token 時產生新 token 並對應；設定組別；回傳 token |
| `+leave(socket)` | 從 `groupByStudent` 移除這條連線的 token |
| `+memberCounts(groupCount)` | 長度為 `groupCount` 的陣列，第 i 個是第 i+1 組的人數 |
| `+highestOccupiedGroup()` | 有人的最大組別編號，沒有人時為 0 |
| `+reset()` | 取消活動時呼叫：清除 `groupByStudent`；`studentBySocket` 保留（research RA-06） |

`SocketRef` 是 `{ id: string }`，Socket.IO 的 `Socket` 直接符合；`GroupMembership` 不引用 Socket.IO。`join`、`leave`、`reset` 只能在 `CommandQueue.run` 內呼叫。

### `CommandQueue`

| 成員 | 說明 |
| --- | --- |
| `-running: boolean` | 是否正在執行指令 |
| `+run<T>(command: () => T): T` | 同步執行並回傳；`command` 回傳 Promise 時丟出錯誤（防止臨界區內有 `await`）。`running` 為 true 時直接就地執行 |

### `SequenceClock`

| 成員 | 說明 |
| --- | --- |
| `-last: number` | 上一次回傳的值 |
| `+stamp(): number` | `max(last, performance.timeOrigin + performance.now())` |

### `ActivityManager`

| 方法 | 回傳 | 規則 |
| --- | --- | --- |
| `createActivity(settings)` | `ActivitySnapshot \| ValidationError` | 已有活動 → `ACTIVITY_EXISTS`；`ImportStore.latest()` 為 `null` → `NO_IMPORT`；組數不合法 → `ValidationError` |
| `updateSettings(settings)` | `ActivitySnapshot \| ValidationError` | 沒有活動 → `NO_ACTIVITY`；不是 `PREPARING` → `SETTINGS_LOCKED`；組數不合法或少於 `highestOccupiedGroup()` → `ValidationError` |
| `cancelActivity()` | `ActivitySnapshot` | 沒有活動 → 不 commit，回傳目前快照；不是 `PREPARING` → `CANCEL_LOCKED`；否則 `GroupMembership.reset()`、`ActivityStore.commit(null)`（research RA-17） |
| `openQuestion(n)` | `ActivitySnapshot` | 沒有活動 → `NO_ACTIVITY`；依「狀態轉換」；不允許 → `QUESTION_NOT_NEXT` |
| `endQuestion(n)` | `ActivitySnapshot` | 沒有活動 → `NO_ACTIVITY`；依「狀態轉換」；不允許 → `QUESTION_NOT_OPEN`。005 可在自己的 `CommandQueue.run` 內呼叫 |
| `joinGroup(socket, n)` | `GroupAck` | 見下方「組別規則」 |
| `leaveGroup(socket)` | `GroupAck` | 沒加入 → 成功（不變）；已鎖定 → `error` |
| `snapshot(audience)` | `ActivitySnapshot` | 目前狀態，給連線時第一次推送；也給 005 組 `JudgeOutcome.activity`。只讀取、沒有副作用，可以在 `CommandQueue.run` 內呼叫 |

`createActivity`～`leaveGroup`（含 `cancelActivity`）都在 `CommandQueue.run` 內執行；回傳的快照是 `Audience.TEACHER`（REST）或 `Audience.PUBLIC`（學生的 ack）。

### `ActivityRuleError`（規則不允許，REST 回 409）

| `code` | `message` |
| --- | --- |
| `NO_IMPORT` | 請先匯入學習單 |
| `ACTIVITY_EXISTS` | 已經有進行中的活動，不能再建立；要重新開始請重新啟動伺服器 |
| `NO_ACTIVITY` | 目前沒有活動 |
| `SETTINGS_LOCKED` | 第 1 題開放後不能修改設定 |
| `CANCEL_LOCKED` | 第 1 題開放後不能取消活動 |
| `QUESTION_NOT_NEXT` | 現在不能開放第 n 題 |
| `QUESTION_NOT_OPEN` | 第 n 題目前沒有開放，不能結束 |

### `ValidationError` 的內容（REST 以 `200` 回傳 `ValidationError` 本身）

| `field` | `message` | 條件 |
| --- | --- | --- |
| `groupCount` | 組數必須是 2 到 20 之間的整數 | 不是整數，或不在 2–20 |
| `groupCount` | 第 n 組已有學生加入，組數不能少於 n | 修改設定時小於 `highestOccupiedGroup()` |

### 加入與離開組別被拒絕（`GroupAck.error`，前端以 `UnexpectedError` reject）

001 的 `joinGroup` 回傳 `Promise<Activity>`，沒有預期失敗的回傳值，所以這些拒絕以 `UnexpectedError(message)` 顯示在選組頁或等待開放頁的共通錯誤訊息區（001 FR-009）。

| `code` | `message` | 條件 |
| --- | --- | --- |
| `NO_ACTIVITY` | 目前沒有活動 | 加入時沒有活動 |
| `NO_SUCH_GROUP` | 沒有第 n 組 | 不是 1 到 `groupCount` 的整數 |
| `GROUP_LOCKED` | 第 1 題開放後不能換組，你在第 m 組 | 已鎖定且這條連線已在第 m 組（m ≠ n）；離開組別時同樣訊息 |

### 組別規則（`joinGroup`）

```text
沒有活動                         → error NO_ACTIVITY「目前沒有活動」
n 不是 1..groupCount 的整數       → error NO_SUCH_GROUP「沒有第 n 組」
這條連線已在第 n 組               → 成功，不改變人數（重新整理後選回原組）
這條連線已在第 m 組（m ≠ n）：
    PREPARING                     → 從第 m 組移到第 n 組
    其他階段                       → error GROUP_LOCKED「第 1 題開放後不能換組，你在第 m 組」
這條連線還沒加入                  → 加入第 n 組（任何階段都可以）
```

### `Audience` 與 `ActivityView`

| 成員 | 說明 |
| --- | --- |
| `Audience` | `TEACHER`、`PUBLIC` |
| `toActivity(state, counts, audience)` | 產生 001 的 `Activity`：`groupCount`、`phase`、`currentQuestion`、`spreadsheet`、`questions`、`groups`（`{ number: i, memberCount: counts[i-1] }`）。`PUBLIC` 時 `spreadsheet` 為空白值 `{ id: "", title: "", editable: false, worksheets: [], selectedWorksheet: "" }`（REQ-ACT-19、research RA-08） |

### `ActivityBroadcaster`、`ActivityGateway`、`activityRoutes`

| 類別 | 成員 | 說明 |
| --- | --- | --- |
| `ActivityBroadcaster` | `-io`（002 的 `app.io`）、`-flushScheduled`、`+start()`、`-flush()` | 訂閱 `ActivityStore`；commit 時以 `setImmediate` 排程一次 `flush`，送最新快照到 `TEACHER_ROOM`（`'teacher'`）與 `students` 房間 |
| `ActivityGateway` | `+attach(io)`（`io` 為 002 的 `app.io`）、`-onConnection(socket)` | `socket.data.isTeacher` 為 false 的連線加入 `students` 房間（老師連線已由 002 加入 `TEACHER_ROOM`）；`GroupMembership.attach`；送一次 `snapshot`；處理 `group:join`、`group:leave`；斷線時 `detach` |
| `activityRoutes` | 五個 REST 端點 | 見 [contracts/activity-http.md](./contracts/activity-http.md) |

## 3. 前端（`frontend/src/services/`，004 新增）

### `HttpActivityService`（實作 001 的 `ActivityService`）

| 欄位 | 說明 |
| --- | --- |
| `-realtime: RealtimeClient` | 推送、加入與離開組別 |
| `-api: ApiClient` | 老師的指令（002 的 `ApiClient`，自動帶 Bearer） |
| `-latest: ActivitySnapshot \| null` | 手上最新的快照；連線成功時清為 `null` |
| `-lastPhaseKey: string \| null` | 上一次 `onPhaseChange` 通知時的 `phase:currentQuestion:groupCount`；通知 `null`（活動被取消）後為 `null`；重新連線時不清除 |
| `-apply(snapshot): boolean` | `latest` 為 `null` 或 `snapshot.version > latest.version` 時採用並通知，回傳 true；否則忽略 |

十個方法的行為見 [contracts/activity-service.md](./contracts/activity-service.md)。

### `RealtimeClient`（004 建立，005 共用）

| 成員 | 說明 |
| --- | --- |
| `-socket` | `io({ transports: ["websocket"], auth: cb => cb({ teacherToken, studentToken }) })`；`auth` 每次連線時重新讀取：`teacherToken` 取自 002 的 `TeacherCredentialStore.get()`（等於 `rejectedTeacherToken` 時不帶），`studentToken` 取自 `sessionStorage` |
| `-connectedTeacherToken` | 目前連線 handshake 時用的老師憑證；與 002 存放的不同時要 `reconnect()`（[activity-service.md](./contracts/activity-service.md)） |
| `-rejectedTeacherToken` | 被 002 以 `UNAUTHORIZED` 拒絕的老師憑證；之後的 handshake 不再帶它，`TeacherCredentialStore.get()` 等於它時也不觸發重新連線（002 #18 之後作廢的憑證會留在本分頁，research RA-07） |
| `+connect()`、`+reconnect()` | 建立連線；以當下的憑證重新 handshake。`disconnect` 原因為 `io server disconnect`（002 換發老師憑證時中斷舊連線）時自動 `reconnect()` |
| `+on<T>(event, listener)`、`+onConnect(listener)` | 訂閱任一伺服器事件（004 用 `activity:snapshot`，005、006 註冊自己的事件）與連線成功；都回傳 `Unsubscribe` |
| `+emitWithAck<T>(event, payload)` | 送出事件並等 ack（004 用 `group:join`、`group:leave`，005 用自己的事件）；5 秒逾時以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」 reject |
| `+studentToken()`、`+setStudentToken(token)` | 讀寫 `sessionStorage` 的 `quizBuzzer.studentToken` |

### 001 頁面中屬於 004 的部分（research RA-16）

| 頁面 | 004 套用的內容 |
| --- | --- |
| `SetupPage`（T-Setup） | 建立模式的組數初始值 `GROUP_COUNT_DEFAULT`；「−」在 `GROUP_COUNT_MIN`、「+」在 `GROUP_COUNT_MAX` 時不可用；「學生加入」文字（spec「說明文字」） |
| `StudentPlayPage` 的 `WaitView`（S-Wait） | 「這一輪」在題數下方加上 spec「說明文字」的等待開放頁文字 |

### 002 提供的前端模組

| 名稱 | 用法 |
| --- | --- |
| `ApiClient.request<T>(method, path, body?)`（`frontend/src/services/http/ApiClient.ts`） | 五個老師指令；有憑證就帶 `Authorization: Bearer`；非 2xx 以 `ApiError { status, code, message }` reject（符合 `UnexpectedError`），其他欄位不保留，所以 `ValidationError` 一律以 `200` 回傳，`HttpActivityService` 以 001 `shared/src/guards.ts` 的 `isValidationError` 區分 |
| `TeacherCredentialStore.get()`（`frontend/src/services/http/TeacherCredentialStore.ts`） | `RealtimeClient` 每次 handshake 讀取，放進 `auth.teacherToken`。002 #18 之後 401 時不清除，被取代的分頁會一直保留作廢的憑證 |

## 4. 與 spec Key Entities 的對應

| spec 的實體 | 這裡的型別 |
| --- | --- |
| 活動 | `ActivityState`（伺服器）、`Activity`（001，送到前端） |
| 活動階段 | `ActivityPhase`；沒有活動（還沒建立或已取消）為 `ActivitySnapshot.activity = null` |
| 組別 | `Group`（001）；人數來自 `GroupMembership.memberCounts` |
| 學生身分 | `studentToken`（`GroupMembership`、`RealtimeClient`） |
| 活動狀態版本 | `ActivityStore.version`、`ActivitySnapshot.version` |
