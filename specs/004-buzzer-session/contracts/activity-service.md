# Contract: `HttpActivityService`（001 `ActivityService` 的真正實作）

簽章照 001 最終版的 [contracts/service-interfaces.md](../../001-ui-prototype/contracts/service-interfaces.md)，不改。老師指令一律經 002 的 `ApiClient`，學生事件與推送經 004 的 `RealtimeClient`。所有 `UnexpectedError` 的訊息見 research RA-10。

| 方法 | 做什麼 | 回傳／通知 |
| --- | --- | --- |
| `createActivity(settings)` | `ApiClient.request("POST", "/api/activity", settings)` | `200` 的 body 是 `ValidationError`（`isValidationError`）：原樣回傳；否則 `apply` 後回傳 `Activity`；`ApiError`：原樣 reject（符合 `UnexpectedError`） |
| `updateSettings(settings)` | `ApiClient.request("PUT", "/api/activity/settings", settings)` | 同上 |
| `cancelActivity()` | `ApiClient.request("DELETE", "/api/activity")` | 成功：`apply` 回應的快照（`activity: null`，因此通知 `onPhaseChange(null)`）後 resolve；`ApiError`（409 `CANCEL_LOCKED`、401 等）原樣 reject。頁面成功後進入 T-Pick（001 FR-026） |
| `openQuestion(n)` | `ApiClient.request("POST", "/api/activity/questions/{n}/open")` | 成功：`apply` 後回傳 `Activity`；`ApiError`：原樣 reject |
| `endQuestion(n)` | `ApiClient.request("POST", "/api/activity/questions/{n}/end")` | 同上；回傳的 `phase` 是 `QUESTION_ENDED` 或 `FINISHED` |
| `joinGroup(n)` | `RealtimeClient.emitWithAck("group:join", { groupNumber: n })` | 有 `error`：`apply(snapshot)` 後以 `UnexpectedError(error.message)` reject（頁面在共通錯誤訊息區顯示，停留在 S-Join）；否則存 `studentToken`、`apply(snapshot)`，回傳 `snapshot.activity`。頁面依 `phase` 切換：`PREPARING` → S-Wait、`OPEN` → 頁面再呼叫 005 的 `getGroupSubmission`、`QUESTION_ENDED` → S-QuestionDone、`FINISHED` → S-Results（001 RD-14） |
| `leaveGroup()` | `RealtimeClient.emitWithAck("group:leave", {})` | 有 `error`：reject `UnexpectedError(error.message)`；否則 `apply(snapshot)` 後 resolve |
| `getCurrentActivity()` | 不送請求；來自 `RealtimeClient.on("activity:snapshot", …)` | 手上有快照：回傳其 `activity`（可能是 `null`）；沒有：等下一份 `activity:snapshot`，5 秒逾時 reject。呼叫者：Main、S-Join（T-Lobby 不呼叫，001 最終版） |
| `onPhaseChange(listener)` | 訂閱 | 採用新快照、`activity` 不是 `null`，且 `phase:currentQuestion:groupCount` 與上一次通知的不同時以 `Activity` 呼叫；採用的快照 `activity` 為 `null` 且上一次通知的是活動（活動被取消）時以 `null` 呼叫（001 RD-12） |
| `onActivityChange(listener)` | 訂閱 | 採用新快照且 `activity` 不是 `null` 時都呼叫。訂閱時 `latest?.activity` 不是 `null`：在下一個 microtask 以當時的 `latest.activity` 呼叫一次（這之前已取消訂閱、或已收到新快照的通知則不呼叫），補上頁面訂閱之前的變化（001 C-1，issue #22） |

## `apply(snapshot)`

```text
if latest == null or snapshot.version > latest.version:
    latest = snapshot
    if snapshot.activity != null:
        通知 onActivityChange
        key = phase:currentQuestion:groupCount
        if key != lastPhaseKey: lastPhaseKey = key；通知 onPhaseChange(activity)
    else if lastPhaseKey != null:
        lastPhaseKey = null；通知 onPhaseChange(null)      # 活動被取消
    return true
return false
```

- 連線成功（含重新連線）時 `latest = null`，下一份快照一定被採用（伺服器重啟後版本號重新開始）。`lastPhaseKey` 不清除，所以斷線期間活動被取消，重新連線後仍會通知 `null`。
- 老師登入後連線要改以老師身分加入 `TEACHER_ROOM`：`RealtimeClient` 記住目前連線用的 `connectedTeacherToken`；`getCurrentActivity()` 與五個老師指令執行前，若 `TeacherCredentialStore.get()` 與它不同、且不是 `rejectedTeacherToken`，先 `reconnect()`（`latest` 因此清為 `null`），再等新的快照。001 完成 C1（2026-11-27）後，老師登入後的第一個活動呼叫是登入頁的 `getCurrentActivity()`；沒有活動時之後是 T-Setup 的 `createActivity`。兩者都會先重新連線，所以控制台收到的一定是老師版的快照。
- 任何人登入時 002 換發老師憑證、中斷舊老師連線（`io server disconnect`），`RealtimeClient` 自動重連；被 `UNAUTHORIZED` 拒絕時的處理見 research RA-07。002 #18 之後被取代的分頁保留作廢的憑證，所以比較時要排除 `rejectedTeacherToken`，否則每次呼叫都會多一次被拒絕的重新連線。

## 頁面依回傳值切換

頁面切換不在本契約；依 001 spec「頁面與按鈕」與「階段推動的切換」，以及 001 research RD-14（加入後依階段切換）。老師登入後依階段回到控制台是 spec「需請 001 修改」C1（001 FR-015，2026-11-27 完成）。
