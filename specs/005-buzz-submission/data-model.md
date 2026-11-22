# Data Model: 搶答與判定

**Feature**: `005-buzz-submission` | **Date**: 2026-11-21（2026-11-22 配合 001 最終版修訂） | **Blueprint**: [`diagrams/005-class.puml`](../../diagrams/005-class.puml)

類別名稱、欄位、方法、關聯與類別圖一一對應。001 的實體（`Submission`、`Judgement`、`ValidationError`、`JudgeOutcome`、`Activity`）與介面（`SubmissionService`）定義在 001 最終版的 [data-model.md](../001-ui-prototype/data-model.md)，005 不改欄位。`Submission.rank` 是必填，在 001 改成可選之前，學生視角一律填 0（spec「需請 001 修改」）。

## 1. 001 的實體（只列 005 使用的部分）

| 實體 | 欄位 | 005 的規則 |
| --- | --- | --- |
| `Judgement`（enum） | `PENDING`、`ACCEPTED`、`REJECTED`、`UNJUDGED` | 四種都使用（REQ-SUB-14） |
| `Submission` | `questionNumber`、`groupNumber`、`answers: string[]`、`rank: number`、`elapsedMs: number`、`judgement` | 老師視角 `rank` 為真正的順位；學生視角 `rank` 一律 0（REQ-SUB-16）。`answers` 順序對應 `Question.subQuestions` |
| `JudgeOutcome` | `submissions: Submission[]`、`activity: Activity` | `judge` 的回傳：判定後本題的完整列表（老師視角）與目前的活動（REQ-SUB-11、REQ-SUB-12） |
| `ValidationError` | `field: string`、`message: string` | 沿用 001 模擬實作的寫法：某一格為 `answers.<i>`（i 從 0 開始），不屬於某一格為 `answers`。001 頁面一律顯示在第一個答案欄旁 |

## 2. 共用事件型別（`shared/src/submissionEvents.ts`）

| 型別 | 欄位 | 說明 |
| --- | --- | --- |
| `SubmitRequest` | `questionNumber: number`、`answers: string[]`、`requestId: string` | 學生 → 伺服器。沒有組別欄位（REQ-SUB-02）；`requestId` 為 UUID |
| `SubmitReply` | `ok: boolean`、`submission?: Submission`、`error?: ValidationError` | `ok = true` 時有 `submission`（學生視角）；否則有 `error` |
| `OwnSubmissionRequest` | `questionNumber: number` | 學生 → 伺服器（`getGroupSubmission`） |
| `OwnSubmissionReply` | `submission: Submission \| null` | 本組第 n 題的送出（學生視角），沒有時為 `null`（REQ-SUB-21） |
| `JudgeRequest` | `groupNumber: number`、`judgement: Judgement` | 老師 → 伺服器；`judgement` 只接受 `ACCEPTED`、`REJECTED` |
| `SubmissionsChanged` | `questionNumber: number`、`submissions: Submission[]` | 伺服器 → 老師；完整列表，依 `rank` 排序 |
| `GroupSubmitted` | `submission: Submission` | 伺服器 → 該組；學生視角（REQ-SUB-20） |
| `SubmissionJudged` | `submission: Submission` | 伺服器 → 該組；學生視角（REQ-SUB-15） |

事件名稱常數：`SUBMIT = "submission:submit"`、`OWN = "submission:own"`、`SUBMISSIONS_CHANGED = "submissions:changed"`、`GROUP_SUBMITTED = "submission:groupSubmitted"`、`JUDGED = "submission:judged"`。

## 3. 前端

### `ServerSubmissionService`（實作 001 的 `SubmissionService`）

| 成員 | 說明 |
| --- | --- |
| `inFlight: Map<number, Promise<Submission \| ValidationError>>` | 題號 → 進行中的送出；連點時回傳同一個 Promise（REQ-SUB-06） |
| `lastRequest: SubmitRequest [0..1]` | 上一次因逾時或斷線失敗的送出；題號與答案相同時沿用其 `requestId` |
| `lastQuestion: number [0..1]` | 最近一次 `submitAnswer`／`getGroupSubmission` 的題號；重新連線時用來補發學生的通知 |
| `submitAnswer(q, answers)` | 004 `RealtimeClient.emitWithAck(SUBMIT, request)`；`ok` 回 `submission`，否則回 `error` |
| `listSubmissions(q)` | 002 `ApiClient.request("GET", "/api/questions/:q/submissions")` |
| `onSubmissionsChange(q, listener)` | `RealtimeClient.on(SUBMISSIONS_CHANGED, …)`，只轉交題號為 q 的列表；`RealtimeClient.onConnect` 時重新 `listSubmissions(q)` 並通知 |
| `judge(q, group, judgement)` | `ApiClient.request("POST", "/api/questions/:q/judgements", { groupNumber, judgement })`，回傳 `JudgeOutcome` |
| `getGroupSubmission(q)` | `RealtimeClient.emitWithAck(OWN, { questionNumber: q })`，回傳 `submission`（或 `null`） |
| `onGroupSubmitted(listener)` | `RealtimeClient.on(GROUP_SUBMITTED, …)`；`onConnect` 時以 `getGroupSubmission(lastQuestion)` 補發 |
| `onJudgement(listener)` | `RealtimeClient.on(JUDGED, …)`；`onConnect` 時以 `getGroupSubmission(lastQuestion)` 補發 `REJECTED` |

`emitWithAck` 逾時由 `RealtimeClient` 以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」reject；HTTP 失敗由 `ApiClient` 轉成 `ApiError`（符合 `UnexpectedError`）reject（001 contracts 共通規則）。

## 4. 伺服器（`server/src/submission/`）

### `SubmissionRecord`

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `questionNumber` | number | 被接受時的開放題號 |
| `groupNumber` | number | 由 `GroupMembership.groupOf(socket)` 取得 |
| `answers` | string[] | 每格去除前後空白、非空、≤ 200 字；數量等於小題數 |
| `rank` | number | 本題從 1 開始，連續不重複（REQ-SUB-08） |
| `elapsedMs` | number | `acceptedAt − ActivityState.openedAt.get(n)`，取整數（REQ-SUB-09） |
| `judgement` | Judgement | 建立時 `PENDING` |
| `requestId` | string | 重複抵達時用來辨識（REQ-SUB-06） |
| `acceptedAt` | number | 004 `SequenceClock.stamp()` |

### `QuestionSubmissions`

| 成員 | 說明 |
| --- | --- |
| `questionNumber: number` | 題號；第一筆送出時建立（開放時間讀 004 的 `ActivityState.openedAt`，不另存） |
| `records: SubmissionRecord[]` | 依 `rank` 排列；只新增，不刪除；只有 `judgement` 會改變 |
| `winnerGroup: number [0..1]` | 被接受的組別 |
| `closed: boolean` | 本題已結束 |
| `byGroup(group)` | 該組的紀錄（每組最多一筆） |
| `firstPending()` | `rank` 最小的 `PENDING` 紀錄 |

### `SubmissionStore`

| 方法 | 說明 |
| --- | --- |
| `question(q)` | 取得第 q 題（沒有則為空） |
| `append(record)` | 加入一筆；第 q 題還沒有 `QuestionSubmissions` 時先建立 |
| `closeQuestion(q)` | `closed = true`；其餘 `PENDING` 改為 `UNJUDGED`（REQ-SUB-14） |
| `list(q)` | 老師視角的 `Submission[]`，依 `rank`；沒有該題時為空陣列（006 使用） |
| `winner(q)` | 被接受的 `Submission`（老師視角）或空（006 使用） |

### `SubmissionEngine`

| 成員 | 說明 |
| --- | --- |
| `processed: number` | 每處理一筆送出（不論結果）加 1，寫進 log 的 `seq`；只在 `CommandQueue.run` 內遞增，順序與佇列相同（research RD-01） |
| `submit(group, request): SubmitReply` | 在 004 的 `CommandQueue.run` 內執行。依序檢查：`group` 存在（否則 `answers`「請先加入組別」）→ 請求格式（`answers`「送出的資料格式不正確」）→ `request.questionNumber` 是 `ActivityStore` 目前開放的題（`answers`「這一題目前不能作答」）→ 本組已有紀錄（`requestId` 相同回第一次的結果；否則 `answers`「本組已送出此題」）→ 格數等於小題數（`answers`「送出的資料格式不正確」）→ 每格非空白（`answers.<i>`「每一格都填才能送出」）→ 每格 ≤ 200 字（`answers.<i>`「每一格最多 200 字」）→ 建立紀錄。建立後通知 `SubmissionNotifier.groupSubmitted`、`submissionsChanged` |
| `ownSubmission(group, q): Submission [0..1]` | 本組第 q 題的紀錄，以 `forStudent` 產生；`group` 為空或沒有紀錄時為空（REQ-SUB-21） |
| `judge(q, group, judgement): JudgeOutcome` | 在 004 的 `CommandQueue.run` 內執行；`ACCEPTED` 時就地呼叫 004 `ActivityManager.endQuestion(n)`；規則見 research RD-07；回傳 `{ submissions: SubmissionStore.list(q), activity: ActivityManager.snapshot(Audience.TEACHER).activity }` |
| `onActivityChange(activity)` | 以 004 `ActivityStore.subscribe` 註冊的 listener（在 `commit` 當下、仍在 `CommandQueue.run` 內被呼叫）：先前開放的第 n 題不再是 `OPEN(n)`（`QUESTION_ENDED`、`FINISHED`、活動消失）→ `closeQuestion(n)` 並通知老師列表 |
| `validate(group, request)` | 上述 `submit` 的檢查，回傳第一個錯誤或空 |

### 其他

| 類別 | 成員 | 說明 |
| --- | --- | --- |
| `SubmissionVisibility` | `forTeacher(record)`、`forStudent(record)` | `forStudent` 的 `rank` 一律為 0（REQ-SUB-16）；001 改成可選後改為不放 |
| `SubmissionNotifier` | `pending: Set<number>`、`timer`；`submissionsChanged(q)`、`groupSubmitted(record)`、`judged(record)`、`flush()` | 老師列表 200 ms 合併後送 `app.io.to(TEACHER_ROOM)`；組員送出與判定立刻送給 `GroupMembership.groupOf(socket) === n` 的連線（research RD-05） |
| `SubmissionGateway` | `register(io)`、`onSubmit(socket, request, ack)`、`onOwn(socket, request, ack)` | 在 002 的 `app.io` 上註冊；取得組別後 `commandQueue.run(() => engine.submit(group, request))`、`engine.ownSubmission(group, q)`，ack 回覆 |
| `SubmissionRoutes` | `register(app)`、`list(q)`、`judge(q, request)` | 以 `app.register` 註冊在 002 的 `buildApp`；兩個路由都掛 `{ preHandler: app.requireTeacher }`，錯誤回應 `{ code, message }`；見 [contracts/submission-api.md](./contracts/submission-api.md) |

## 5. 狀態轉換

**一筆送出的判定**：

```text
（建立）→ PENDING --老師接受（必須是 firstPending）--> ACCEPTED   → 本題結束（004 ActivityManager.endQuestion）
         PENDING --老師不接受（必須是 firstPending）--> REJECTED   → 該組本題不能再送出；學生停在等待判定頁（不接受）
         PENDING --本題結束（老師結束或其他組被接受）--> UNJUDGED
```

ACCEPTED、REJECTED、UNJUDGED 都不再改變。

**一題的送出清單**：

```text
（無）--004 開放第 n 題--> 開放中（可送出、可判定）--接受或 004 結束第 n 題--> closed（不能送出、不能判定）
```

## 6. 驗證規則摘要

| 規則 | 來源 |
| --- | --- |
| 只接受目前開放中的題目 | REQ-SUB-01 |
| 組別由伺服器判斷；未加入組別拒絕 | REQ-SUB-02 |
| 同組同題只接受一筆；同一 `requestId` 回第一次的結果 | REQ-SUB-03、REQ-SUB-06 |
| 格數等於小題數 | REQ-SUB-04 |
| 每格去除前後空白後非空、≤ 200 字 | REQ-SUB-05 |
| 只能判定 `firstPending()`，且本題開放中、沒有 `ACCEPTED` | REQ-SUB-11 |
| 列出送出與判定需老師憑證 | REQ-SUB-17 |
| 學生只能取得本組的送出 | REQ-SUB-16、REQ-SUB-21 |

## 7. 使用 004、002 的伺服器模組（不屬於 005，只列 005 用到的部分）

| 模組 | 005 用到的成員 | 來源 |
| --- | --- | --- |
| `CommandQueue`（004） | `run<T>(command: () => T): T` | 004 contracts/server-modules.md |
| `SequenceClock`（004） | `stamp(): number` | 同上 |
| `ActivityStore`（004） | `current()`（`phase`、`currentQuestion`、`questions`、`openedAt`）、`subscribe(listener)` | 同上 |
| `GroupMembership`（004） | `groupOf(socket): number \| null` | 同上 |
| `ActivityManager`（004） | `endQuestion(n)`、`snapshot(audience)`（`Audience.TEACHER`） | 004 data-model `ActivityManager` |
| `RealtimeClient`（004，前端） | `on`、`emitWithAck`、`onConnect` | 004 contracts/server-modules.md |
| `app.io`、`TEACHER_ROOM`、`app.requireTeacher`、`buildApp`、`ErrorBody`（002）；`ApiClient`（002，前端） | — | 002 contracts/server-extension.md、socket-handshake.md |
