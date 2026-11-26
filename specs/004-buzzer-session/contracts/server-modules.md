# Contract: 004 提供給 005、006 的伺服器模組

**Owner**: `004-buzzer-session` | **位置**: `server/src/activity/`；`createActivityModule(app, deps)`（`server/src/activity/index.ts`）在 002 的 `buildApp(config, deps)` 中以 `app.register(...)` 註冊，建立以下物件，每個伺服器只有一份。

| 提供什麼 | 簽章 | 使用者 | 規則 |
| --- | --- | --- | --- |
| `ActivityStore` | `current(): ActivityState \| null`、`version(): number`、`subscribe(listener): Unsubscribe` | 005、006 | 唯一權威的活動狀態（階段、目前題號、組數、題目、每題 `openedAt`、`endedAt`）。005、006 只讀，不得 `commit`。準備中取消活動後 `current()` 回到 `null`（這時還沒有任何送出） |
| `GroupMembership.groupOf(socket)` | `groupOf(socket: { id: string }): number \| null` | 005 | 伺服器依連線判斷組別（原則 VI）；`null` 表示這條連線還沒加入 |
| `ActivityManager.endQuestion(n)` | `endQuestion(n: number): ActivitySnapshot` | 005 | 老師接受某組後自動結束；與老師按鈕效果相同。已結束時不改變、不報錯（REQ-ACT-07）；不是目前開放的題目時丟出 `ActivityRuleError(QUESTION_NOT_OPEN)` |
| `CommandQueue.run(command)` | `run<T>(command: () => T): T` | 005 | 005 的送出與判定必須放在這裡面，與 004 的開放、結束共用同一個順序（REQ-ACT-17）。`command` 不得 `await`；在裡面呼叫 `endQuestion` 會就地執行 |
| `SequenceClock.stamp()` | `stamp(): number` | 005 | 送出時間與 `openedAt` 用同一個時鐘，經過時間 = 送出時間 − `openedAt[n]` |
| `activity:snapshot` 廣播與 `students` 房間 | 見 [socket-events.md](./socket-events.md) | 005 | Socket.IO 伺服器本身是 002 的 `app.io`；004 負責學生連線加入 `students` 房間與推送活動快照，005 在同一個 `app.io` 上新增事件 |
| 前端 `RealtimeClient`（`frontend/src/services/RealtimeClient.ts`） | `on<T>(event: string, listener: (payload: T) => void): Unsubscribe`；`emitWithAck<T>(event: string, payload: object): Promise<T>`（5 秒逾時以 `UnexpectedError`「連不上伺服器，請確認伺服器已啟動」reject）；`onConnect(listener: () => void): Unsubscribe` | 005、006 | 每個分頁只有一條連線：組合根建立一個 `RealtimeClient`，傳給 `HttpActivityService` 與 005、006 的服務。005、006 用 `on` 監聽自己的推送、用 `emitWithAck` 送學生事件，不得另建 Socket.IO 連線。重新連線後伺服器不補送舊事件；需要目前狀態的服務在 `onConnect` 時自行重新取得 |

## 005 需要注意

- 一題結束時（`ActivityStore` 的 `phase` 從 `OPEN(n)` 變成 `QUESTION_ENDED(n)` 或 `FINISHED`），005 要把該題尚未判定的送出標為 `UNJUDGED`（001 D12）。做法由 005 決定，可以在 `ActivityStore.subscribe` 的 listener 中同步處理（listener 在 `commit` 當下、仍在 `CommandQueue.run` 內被呼叫），或讀取時依階段判斷。
- 送出時要確認 `ActivityStore.current()` 是 `OPEN` 且 `currentQuestion` 等於送出的題號。
