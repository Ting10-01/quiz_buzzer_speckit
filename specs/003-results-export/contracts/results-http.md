# Contract: 結果、寫回與匯出（HTTP）

**Owner**: `003-results-export` | **Base**: `http://localhost:3000/api/results` | **Types**: `packages/shared/src/results.ts`

錯誤格式與 001、002 相同：`{ "error": { "code": "...", "message": "...", "questionNumber": null } }`。老師憑證見 [002 session-http](../../002-buzzer-session/contracts/session-http.md)；Google 授權見 [001 google-auth-http](../../001-guided-notes-import/contracts/google-auth-http.md)。

## GET /api/results/teacher

- **Auth**: `Authorization: Bearer <teacherToken>`
- **200**: `TeacherResultView`（活動進行中也可呼叫，只含已結束的題目）
- **204**: 沒有活動，也沒有可還原的紀錄
- **401** `UNAUTHORIZED`

## GET /api/results/student

- **Header**: `X-Participant-Id: <participantId>`（002 `student:join` 取得）
- **200**: `StudentResultView`；活動結束前 `rankings` 為 `[]`
- **401** `NOT_JOINED`：`participantId` 無效

活動結束時，002 推送的 `view:student`／`view:teacher` 的 `phase` 變為 `ENDED`，前端收到後呼叫本 API 取得完整結果（REQ-EXP-13）。

## POST /api/results/write-back

把每題成功組別的答案寫回原試算表（先檢查版面、再建立備份工作表、最後一次批次寫入）。前端在呼叫前先顯示確認畫面（會覆蓋的填空格數、會建立備份）。

- **Auth**: 老師憑證
- **Request**: `{}`
- **200**:

```json
{ "writtenCount": 4, "clearedCount": 2, "backupSheetName": "學習單-備份-20261118-1530", "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/1AbC…/edit#gid=0" }
```

| HTTP | code | 說明 |
| --- | --- | --- |
| 409 | `ACTIVITY_NOT_ENDED` | 活動尚未結束（AC-10） |
| 409 | `NO_RESULTS` | 沒有活動也沒有可還原的紀錄 |
| 409 | `LAYOUT_CHANGED` | 有題號不在匯入時的位置；附 `questionNumber`；未建立備份、未寫入（AC-12） |
| 401 | `NOT_LINKED` / `AUTH_EXPIRED` | 需要重新連結 Google 帳號（AC-14） |
| 403 | `NO_EDIT_PERMISSION` | 目前帳號只能檢視這份試算表（AC-14） |
| 404 | `SHEET_NOT_FOUND` | 工作表或試算表已刪除 |
| 502 | `BACKUP_FAILED` | 無法建立備份工作表，未寫入 |
| 504 | `NETWORK_ERROR` | 15 秒內連不上 Google；學習單不會只寫一部分，可重試（AC-15） |

## GET /api/results/csv

- **Auth**: 老師憑證
- **200**: `Content-Type: text/csv; charset=utf-8`，`Content-Disposition: attachment; filename*=UTF-8''<試算表名稱-搶答結果.csv 的百分比編碼>`，內容格式見 [data-model](../data-model.md) 的 CsvRow
- **409**: `ACTIVITY_NOT_ENDED`、`NO_RESULTS`

前端以 `fetch` 帶老師憑證取得 Blob，再用 `URL.createObjectURL` 觸發下載。

寫回或匯出 CSV 任一個成功後，002 建立新活動時不再出現 `UNEXPORTED_RESULTS`（REQ-BUZ-20）。
