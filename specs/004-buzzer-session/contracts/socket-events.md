# Contract: 即時事件（Socket.IO）

**Owner**: `004-buzzer-session`（005 在同一個伺服器與 `RealtimeClient` 上新增自己的事件） | **Types**: `shared/src/activitySync.ts`

## 連線

- Socket.IO 伺服器是 002 建立的 `app.io`（002 `contracts/socket-handshake.md`）；004 不另建。
- 傳輸只用 WebSocket：伺服器端由 002 設定 `transports: ['websocket']`，004 的前端 `io({ transports: ["websocket"] })`（REQ-ACT-20、001 D22）。
- handshake `auth`：`{ teacherToken?: string, studentToken?: string }`，每次連線（含自動重新連線）由 `RealtimeClient` 重新讀取。

| 條件 | 誰處理 | 伺服器處理 |
| --- | --- | --- |
| `teacherToken` 是有效的老師憑證 | 002 | 加入 `TEACHER_ROOM`（`'teacher'`），`socket.data.isTeacher = true` |
| `teacherToken` 錯誤或已作廢 | 002 | 拒絕連線：`connect_error`，`err.message === 'UNAUTHORIZED'`；`RealtimeClient` 的處理見 research RA-07 |
| 沒有 `teacherToken` | 002 → 004 | `socket.data.isTeacher = false`；004 把連線加入 `students` 房間 |
| 有 `studentToken` | 004 | `GroupMembership.attach(socket, studentToken)`；伺服器不認得時忽略 |
| 所有接受的連線 | 004 | 連上後立即送一次 `activity:snapshot`（`isTeacher` 決定 `Audience`）（REQ-ACT-15） |
| 斷線 | 004 | `GroupMembership.detach(socket)`；人數不變 |
| 任何人以 Google 登入（取代前一位老師） | 002 | `io.in(TEACHER_ROOM).disconnectSockets(true)` 中斷舊老師連線；`RealtimeClient` 以 `io server disconnect` 為訊號重新連線 |

## 伺服器 → 前端

| 事件 | Payload | 送給誰 | 前端要做的事 |
| --- | --- | --- | --- |
| `activity:snapshot` | `ActivitySnapshot` | `TEACHER_ROOM`：`Audience.TEACHER`；`students` 房間：`Audience.PUBLIC` | `HttpActivityService.apply`：版本比手上大才採用（REQ-ACT-14）。`activity: null` 表示沒有活動（還沒建立或已取消），活動被取消時通知 `onPhaseChange(null)` |

推送在 `CommandQueue` 處理完之後排程；同一輪事件迴圈內多次改變只送最新一份（research RA-04）。版本號嚴格遞增但可能跳號。

## 學生 → 伺服器

| 事件 | Payload | Ack | 說明 |
| --- | --- | --- | --- |
| `group:join` | `{ groupNumber: number }` | `GroupAck` | 依 data-model「組別規則」。成功時 `studentToken` 為這個分頁的學生身分，前端存進 `sessionStorage` |
| `group:leave` | `{}` | `GroupAck` | 第 1 題開放後回 `error` |

- `GroupAck.snapshot` 一律是處理後的 `Audience.PUBLIC` 快照（被拒絕時是目前狀態）。
- 被拒絕時 `error` 為 `{ code, message }`（`NO_ACTIVITY`（包括老師剛取消活動）、`NO_SUCH_GROUP`、`GROUP_LOCKED`，data-model「加入與離開組別被拒絕」）；payload 不是物件、`groupNumber` 不是整數時回 `NO_SUCH_GROUP`。前端以 `UnexpectedError(error.message)` reject。
- 老師連線也可以送這兩個事件，效果與學生相同；頁面流程不會這樣做。

## 給 005 的規則

- 005 的學生事件（送出）在 handler 內以 `GroupMembership.groupOf(socket)` 取得組別，不接受 payload 中的組別（原則 VI）。
- 005 推送給 `TEACHER_ROOM` 或特定組別時，自行決定事件名稱；學生組別的房間可用 `group:<n>`，由 005 在 `group:join` 成功後加入（004 不建立，005 需要時在自己的 plan 中決定）。
