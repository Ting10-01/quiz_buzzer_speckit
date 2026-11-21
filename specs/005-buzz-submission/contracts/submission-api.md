# Contract: 送出與判定的 Socket.IO 事件與 HTTP API

**Owner**: `005-buzz-submission` | **Types**: `shared/src/submissionEvents.ts`（欄位見 [data-model.md](../data-model.md) 第 2 節） | **前端實作**: `ServerSubmissionService`，對應 001 [contracts/service-interfaces.md](../../001-ui-prototype/contracts/service-interfaces.md) 的 `SubmissionService`

Socket.IO 只使用 WebSocket 傳輸（004 D22）。伺服器端事件註冊在 002 建立的 `app.io`；前端經 004 的 `RealtimeClient`。連線本身、老師連線的驗證與 `TEACHER_ROOM`（002）、加入組別（004 `group:join`）都不屬於 005。HTTP 路由以 `app.register` 註冊在 002 的 `buildApp`。

## 1. 學生 → 伺服器（Socket.IO）

| 事件 | Payload | Ack | 說明 |
| --- | --- | --- | --- |
| `submission:submit` | `SubmitRequest` `{ questionNumber, answers, requestId }` | `SubmitReply` | 組別由 `GroupMembership.groupOf(socket)` 判斷；payload 中其他欄位一律忽略。在 004 的 `CommandQueue.run` 內處理 |

`SubmitReply`：

| 情況 | 回覆 |
| --- | --- |
| 接受 | `{ ok: true, submission }`，`submission.judgement = "PENDING"`，**沒有 `rank`** |
| 同一個 `requestId` 再次抵達 | 與第一次相同的回覆 |
| 沒有加入組別 | `{ ok: false, error: { field: "submit", message: "請先加入組別" } }` |
| payload 格式錯誤（題號不是正整數、`answers` 不是字串陣列、`requestId` 不是字串）或格數不等於小題數 | `{ ok: false, error: { field: "submit", message: "送出的資料格式不正確" } }` |
| 題目不在開放中 | `{ ok: false, error: { field: "submit", message: "這一題目前不能作答" } }` |
| 本組本題已有送出（同組另一人、被拒絕後再送） | `{ ok: false, error: { field: "submit", message: "本組已送出此題" } }` |
| 第 i 格去除前後空白後是空字串 | `{ ok: false, error: { field: "answers[i]", message: "每一格都填才能送出" } }`（回報第一個有問題的格） |
| 第 i 格超過 200 字 | `{ ok: false, error: { field: "answers[i]", message: "每一格最多 200 字" } }` |

`ServerSubmissionService.submitAnswer` 以 `RealtimeClient.emitWithAck` 送出，把 `ok` 轉成 `Submission`、把 `error` 轉成 `ValidationError` 回傳；5 秒沒有 ack 時由 `RealtimeClient` 以 `UnexpectedError("連不上伺服器")` reject。

## 2. 伺服器 → 前端（Socket.IO）

| 事件 | 送給 | Payload | 前端要做的事 |
| --- | --- | --- | --- |
| `submissions:changed` | `app.io.to(TEACHER_ROOM)`（002，值為 `teacher`） | `SubmissionsChanged` `{ questionNumber, submissions }`（老師視角，有 `rank`） | `onSubmissionsChange(q, …)` 只轉交 `questionNumber === q` 的列表，頁面以它取代目前列表 |
| `submission:judged` | `GroupMembership.groupOf(socket) === n` 的每條連線（004 不建立組別房間，research RD-05） | `SubmissionJudged` `{ submission }`（學生視角，沒有 `rank`） | `onJudgement` 轉交頁面：`ACCEPTED` 顯示「老師已接受本組答案」；`REJECTED` 回到作答頁被拒絕狀態 |

規則：

1. `submissions:changed` 每 200 ms 最多一次，內容一律是最新的完整列表（research RD-05）。
2. `submission:judged` 只在老師判定 `ACCEPTED` 或 `REJECTED` 時送出；變成 `UNJUDGED` 不送（REQ-SUB-15）。
3. 學生連線收不到任何其他組的送出資料（REQ-SUB-16）；老師推播不得用 `io.emit` 廣播（002 REQ-AUTH-08）。

## 3. 老師 → 伺服器（HTTP）

兩個路由都加 `{ preHandler: app.requireTeacher }`；沒有或錯誤的老師憑證由 `app.requireTeacher` 回應（格式依 002）。兩個路由都加進 002 T043 的老師路由清單測試。錯誤回應一律為 002 的 `ErrorBody` `{ code, message }`。

### `GET /api/questions/:n/submissions`

| 項目 | 內容 |
| --- | --- |
| 路徑參數 | `n`：正整數 |
| 200 | `Submission[]`（老師視角，依 `rank` 排序）。第 n 題沒有任何送出或還沒開放時為 `[]` |
| 400 | `n` 不是正整數：`{ code: "INVALID_QUESTION_NUMBER", message: "題號格式不正確" }` |

### `POST /api/questions/:n/judgements`

| 項目 | 內容 |
| --- | --- |
| Body | `JudgeRequest` `{ groupNumber, judgement }` |
| 200 | `Submission[]`：判定後（或沒有改變時）第 n 題的完整列表 |
| 400 | `n`、`groupNumber` 不是正整數，或 `judgement` 不是 `ACCEPTED`／`REJECTED`：`{ code: "INVALID_JUDGEMENT", message: "判定的資料格式不正確" }` |

判定只在下列條件都成立時生效，否則不改變任何狀態，仍回 200 與目前列表（REQ-SUB-11、research RD-07）：

1. 第 n 題是目前開放中的題目；
2. 第 n 題沒有 `ACCEPTED`；
3. `groupNumber` 的紀錄是 `rank` 最小的 `PENDING`。

生效時：

- `ACCEPTED`：在同一個 `CommandQueue.run` 內呼叫 004 的 `ActivityManager.endQuestion(n)`，其餘 `PENDING` 改為 `UNJUDGED`；004 廣播階段改變（REQ-SUB-12）。
- `REJECTED`：下一筆 `PENDING` 成為可判定（REQ-SUB-13）。

之後送出 `submissions:changed` 給老師、`submission:judged` 給該組。

## 4. 與 001 介面的對應

| 001 方法 | 本契約 |
| --- | --- |
| `submitAnswer(q, answers)` | `submission:submit`（第 1 節） |
| `listSubmissions(q)` | `GET /api/questions/:q/submissions` |
| `onSubmissionsChange(q, listener)` | `submissions:changed`；重新連線後再呼叫一次 `GET` |
| `judge(q, group, judgement)` | `POST /api/questions/:q/judgements` |
| `onJudgement(listener)` | `submission:judged` |
