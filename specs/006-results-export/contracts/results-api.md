# Contract: 結果查詢與寫回

**Owner**: `006-results-export` | **Types**: 001 `shared/src/entities.ts`（`QuestionResult`、`Submission`、`WriteBackResult`）；非 2xx 的錯誤格式沿用 002 `ErrorBody`（`{ code, message }`）

前端只經由 `ServerResultService`（實作 001 [`ResultService`](../../001-ui-prototype/contracts/service-interfaces.md)）使用下列介面；頁面不直接呼叫。

## Socket.IO 事件（002 的 `app.io`；前端經 004 的 `RealtimeClient`）

讀取不需要老師身分。組別由伺服器以 004 `GroupMembership.groupOf(socket)` 判斷，payload 不帶組別（原則 VI）。

### `result:question`

- **emit**: `{ questionNumber: number }`（正整數；其他值回 `QUESTION_NOT_FOUND`）
- **ack 成功**: `{ ok: true, result: QuestionResult }`
- **ack 失敗**: `{ ok: false, code, message }`

| code | message | 何時 |
| --- | --- | --- |
| `NO_ACTIVITY` | 目前沒有活動 | `ActivityStore.current()` 為 `null` |
| `QUESTION_NOT_FOUND` | 沒有這一題 | 題號不在活動的題目中 |
| `QUESTION_NOT_ENDED` | 這一題還沒結束，結果尚未公布 | 活動還沒結束，且 `ActivityState.endedAt` 沒有這一題（REQ-RES-02） |

### `result:all`

- **emit**: `{}`
- **ack 成功**: `{ ok: true, results: QuestionResult[] }`：依題號排序，只含已結束的題目
- **ack 失敗**: `{ ok: false, code: "NO_ACTIVITY", message: "目前沒有活動" }`

### `QuestionResult` 的公布範圍（兩個事件相同；feature-split 第 4 節）

| 狀態 | `winner` | `submissionCount` | `submissions` | `behindFirstMs` |
| --- | --- | --- | --- | --- |
| 題目未結束 | 不回傳該題 | — | — | — |
| 題目已結束、活動未結束 | 005 `winner(n)`（沒有時不設），`rank` 填 0 | `list(n).length` | 只有呼叫者所屬組別的那一筆，`rank` 填 0；老師與沒有加入組別的連線為 `[]` | 與 `submissions` 同長度，值都是 0 |
| 活動已結束（`FINISHED`） | 005 `winner(n)` | 同上 | 005 `list(n)`：該題所有送出，依 `rank` 遞增 | 每筆 `elapsedMs` − 順位 1 的 `elapsedMs`（001 D23：第一名為最早送出的組別） |

`rank` 填 0 表示不公開順位，與 005 給學生的 `Submission` 相同（001 的 `rank` 改成可選之前的做法）。

`Submission.judgement` 沿用 005：題目結束後只有 `ACCEPTED`、`REJECTED`、`UNJUDGED`。

## HTTP

### `POST /api/results/write-back`

- **註冊**: 002 `buildApp` 中 `app.register(resultsRoutes, …)`；路由 `{ preHandler: app.requireTeacher }`。本路由需加入 002 `server/tests/integration/requireTeacher.test.ts` 的老師專用路由清單（002 T043）。
- **Auth**: `Authorization: Bearer <老師憑證>`（前端由 `ApiClient` 自動帶上）。
- **Request body**: 無。
- **200**: `WriteBackResult`
  - 成功：`{ "ok": true, "cellCount": 6 }`（沒有任何成功組別時 `cellCount` 為 `0`，不建立備份）
  - 預期中的失敗：`{ "ok": false, "cellCount": 0, "failureReason": "<spec「寫回失敗原因」表的訊息>" }`。伺服器內部的失敗代碼（記在 log）：`NOT_FINISHED`、`IMPORT_CHANGED`、`LAYOUT_CHANGED`、`NO_EDIT_PERMISSION`、`SHEET_NOT_FOUND`、`GOOGLE_UNAVAILABLE`、`BACKUP_FAILED`、`WRITE_UNCONFIRMED`、`IN_PROGRESS`
- **非 2xx**（body 為 002 `ErrorBody { code, message }`）：

| status | code | 情況 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 002 `requireTeacher` 拒絕（訊息依 002） |
| 401 | `GOOGLE_AUTH_EXPIRED` | Google 授權失效（002 `isGoogleAuthExpired`、003 `SheetsReadError('AUTH_EXPIRED')`）；`message` 為 spec「寫回失敗原因」表的文字 |
| 500 | （依 002） | 非預期錯誤 |

寫回步驟與每一步的失敗代碼見 [data-model.md](../data-model.md) 第 4 節。伺服器以 pino 記錄每次寫回的代碼與格數，不記錄老師憑證與 Google token（原則 VI）。

## 前端 `ServerResultService` 的行為

| 方法 | 成功 | 失敗 |
| --- | --- | --- |
| `getQuestionResult(q)` | `result:question` 的 `result` | ack `ok: false` → reject `UnexpectedError(message)`；`RealtimeClient.emitWithAck` 逾時（5 秒）→ 由它 reject `UnexpectedError("連不上伺服器")` |
| `getAllResults()` | `result:all` 的 `results` | 同上 |
| `writeBack()` | `200` 的 body（`ok` 為 true 或 false） | `401 GOOGLE_AUTH_EXPIRED` → `{ ok: false, cellCount: 0, failureReason: message }`；`401 UNAUTHORIZED` → `{ ok: false, cellCount: 0, failureReason: "老師登入已失效，請回首頁重新登入。沒有寫入任何格子。" }`；其他（`NETWORK`、500）→ 原樣 reject `ApiError`（符合 `UnexpectedError`） |
