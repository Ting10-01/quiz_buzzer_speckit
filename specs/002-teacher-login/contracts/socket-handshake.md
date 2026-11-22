# Contract: Socket.IO 掛載與老師連線驗證

**Owner**: `002-teacher-login` | **使用者**: 004（活動推播）、005（送出列表推播）

002 只定義「連線是不是老師」；房間、事件名稱與內容由 004、005 定義。

## 掛載

- `attachSocketServer(app, teacherAuth)` 在 `buildApp` 中呼叫，以 Fastify 的 HTTP server 建立 Socket.IO，存為 `app.io`。
- 路徑為預設的 `/socket.io`；`transports: ['websocket']`（只用 WebSocket，001 D22，規則由 004 定義）。
- 開發時 Vite proxy 以 `ws: true` 轉發 `/socket.io`。

## Handshake

| 用戶端送出的 `auth` | 伺服器的處理 | `socket.data.isTeacher` |
| --- | --- | --- |
| 沒有 `teacherToken` | 接受為一般連線（學生、首頁） | `false` |
| `teacherToken` 為目前有效的老師憑證 | 接受，加入 `TEACHER_ROOM`（`'teacher'`） | `true` |
| `teacherToken` 錯誤、格式不對或已作廢 | 拒絕：`next(new Error('UNAUTHORIZED'))`，用戶端收到 `connect_error`，`err.message === 'UNAUTHORIZED'` | — |

前端的老師連線從 `TeacherCredentialStore.get()` 取得憑證放進 `auth.teacherToken`（004 建立連線時使用）。

## 老師憑證換發

任何人登入成功取代前一個老師（同一個帳號或另一個帳號，`TeacherAuth.onRotate`）時，伺服器執行 `io.in(TEACHER_ROOM).disconnectSockets(true)`：此刻在 `TEACHER_ROOM` 的連線都是舊憑證建立的，全部中斷。舊分頁重新連線時帶的是作廢的憑證，會被拒絕（`UNAUTHORIZED`）。新分頁以新憑證連線。

## 其他子功能的使用規則

- 老師專用的推播 MUST 只送到 `io.to(TEACHER_ROOM)`，不得廣播給所有連線（REQ-AUTH-08、SC-003）。
- 若 004、005 需要用戶端經 Socket.IO 送出老師指令，處理函式 MUST 先檢查 `socket.data.isTeacher`；001 RD-03 規定老師指令走 HTTP REST，正常情況不需要。
