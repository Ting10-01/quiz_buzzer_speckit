# Contract: 即時事件（Socket.IO）

**Owner**: `002-buzzer-session` | **Endpoint**: `ws://localhost:3000`（Socket.IO 預設路徑）| **Types**: `packages/shared/src/socket-events.ts`

## 連線

| 角色 | `io(url, { auth })` | 伺服器處理 |
| --- | --- | --- |
| 老師 | `{ teacherToken }` | 驗證憑證；加入老師專用房間；立即推送一次 `view:teacher` |
| 學生 | `{ participantId? }` | 有 `participantId` 且有效 → 回到原組別並推送 `view:student`；沒有 → 等待 `student:join` |

## 學生 → 伺服器

| 事件 | Payload | Ack（回呼） | 說明 |
| --- | --- | --- | --- |
| `student:join` | `{ groupId }` | `{ ok: true, participantId, groupId }` 或 `{ ok: false, code, message }` | 選組；`participantId` 存到 `sessionStorage` |
| `student:changeGroup` | `{ groupId }` | 同上 | 第 1 題開放後回 `GROUP_LOCKED` |
| `student:submit` | `{ submissionId, questionNumber, answers: Record<slotId, string> }` | `SubmitResult` | 進入 `CommandQueue`；回覆不含順位 |

`SubmitResult`：`{ status: "ACCEPTED" | "DUPLICATE" | "REJECTED", reason?: string, receivedAt?: number }`

`REJECTED` 的 `reason`：`QUESTION_NOT_OPEN`（未開放或已結束）、`ALREADY_SUBMITTED`（本組已送過）、`INCOMPLETE_GROUP`（題組有小題沒填）、`EMPTY_ANSWER`、`ANSWER_TOO_LONG`、`NOT_JOINED`。

## 老師 → 伺服器

| 事件 | Payload | Ack | 說明 |
| --- | --- | --- | --- |
| `teacher:openNext` | `{}` | `CommandResult` | 開放下一題；有題目開放中時回 `QUESTION_STILL_OPEN` |
| `teacher:closeQuestion` | `{}` | `CommandResult` | 結束目前的題目（`reason = TEACHER`） |
| `teacher:endActivity` | `{ confirm: true }` | `CommandResult` | 結束活動；未開放的題目記為無人搶答 |

非老師連線送出這些事件一律回 `{ ok: false, code: "FORBIDDEN" }`（AC-06）。

## 伺服器 → 前端

| 事件 | Payload | 前端要做的事 |
| --- | --- | --- |
| `view:teacher` | `TeacherView` | 以收到的資料重畫控制台；呼叫 ack 表示已處理 |
| `view:student` | `StudentView` | 以收到的資料重畫學生畫面；呼叫 ack |
| `activity:replaced` | `{}` | 老師建立了新活動；學生清除 `participantId`，回到選組頁 |

規則：

1. view 一律帶 ack；同一連線在前一份 view 被 ack 之前，伺服器只保留最新一份待送（research R4）。
2. `remainingSec` 是伺服器算好的剩餘秒數，前端以收到的時間為基準本地倒數，下一份 view 到達時校正。
3. 前端不得自行推導階段或題目狀態，一切以最新收到的 view 為準（原則 V）。

## 型別

`TeacherView`、`StudentView`、`QuestionOutline`、`OwnSubmission`、`PublicResult`、`GroupStatus`、`SubmitResult`、`QuestionResult` 的欄位定義見 [data-model.md](../data-model.md)，程式碼放在 `packages/shared/src/activity.ts`。
