# Contract: `HttpActivityService`（001 `ActivityService` 的真正實作）

簽章照 001 的 [contracts/service-interfaces.md](../../001-ui-prototype/contracts/service-interfaces.md)，唯一例外是 `joinGroup` 改為 `Promise<Activity | ValidationError>`（spec「需請 001 修改」C2）。老師指令一律經 002 的 `ApiClient`，學生事件與推送經 004 的 `RealtimeClient`。所有 `UnexpectedError` 的訊息見 research RA-10。

| 方法 | 做什麼 | 回傳／通知 |
| --- | --- | --- |
| `createActivity(settings)` | `ApiClient.request("POST", "/api/activity", settings)` | `200` 的 body 是 `ValidationError`（`isValidationError`）：原樣回傳；否則 `apply` 後回傳 `Activity`；`ApiError`：原樣 reject（符合 `UnexpectedError`） |
| `updateSettings(settings)` | `ApiClient.request("PUT", "/api/activity/settings", settings)` | 同上 |
| `openQuestion(n)` | `ApiClient.request("POST", "/api/activity/questions/{n}/open")` | 成功：`apply` 後回傳 `Activity`；`ApiError`：原樣 reject |
| `endQuestion(n)` | `ApiClient.request("POST", "/api/activity/questions/{n}/end")` | 同上；回傳的 `phase` 是 `QUESTION_ENDED` 或 `FINISHED` |
| `joinGroup(n)` | `RealtimeClient.emitWithAck("group:join", { groupNumber: n })` | 有 `error`：回傳 `ValidationError`；否則存 `studentToken`、`apply(snapshot)`，回傳 `snapshot.activity` |
| `leaveGroup()` | `RealtimeClient.emitWithAck("group:leave", {})` | 有 `error`：reject `UnexpectedError(error.message)`；否則 `apply(snapshot)` 後 resolve |
| `getCurrentActivity()` | 不送請求；來自 `RealtimeClient.on("activity:snapshot", …)` | 手上有快照：回傳其 `activity`（可能是 `null`）；沒有：等下一份 `activity:snapshot`，5 秒逾時 reject |
| `onPhaseChange(listener)` | 訂閱 | 採用新快照、`activity` 不是 `null`，且 `phase:currentQuestion:groupCount` 與上一次通知的不同時呼叫 |
| `onActivityChange(listener)` | 訂閱 | 採用新快照且 `activity` 不是 `null` 時都呼叫 |

## `apply(snapshot)`

```text
if latest == null or snapshot.version > latest.version:
    latest = snapshot
    if snapshot.activity != null:
        通知 onActivityChange
        key = phase:currentQuestion:groupCount
        if key != lastPhaseKey: lastPhaseKey = key；通知 onPhaseChange
    return true
return false
```

- 連線成功（含重新連線）時 `latest = null`，下一份快照一定被採用（伺服器重啟後版本號重新開始）。
- 老師登入後連線要改以老師身分加入 `TEACHER_ROOM`：`RealtimeClient` 記住目前連線用的 `connectedTeacherToken`；`getCurrentActivity()` 與四個老師指令執行前，若 `TeacherCredentialStore.get()` 與它不同，先 `reconnect()`（`latest` 因此清為 `null`），再等新的快照。老師登入後頁面第一個呼叫就是 `getCurrentActivity()`（001 C1），所以控制台一定收到老師版的快照。
- 002 換發老師憑證時中斷舊老師連線（`io server disconnect`），`RealtimeClient` 自動重連；被 `UNAUTHORIZED` 拒絕時的處理見 research RA-07。

## 頁面依回傳值切換

頁面切換不在本契約；依 001 spec「頁面與按鈕」與「階段推動的切換」，以及 spec「需請 001 修改」C1、C2、C5。
