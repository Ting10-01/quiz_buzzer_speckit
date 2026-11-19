# Contract: 老師身分與活動建立（HTTP）

**Owner**: `002-buzzer-session` | **Base**: `http://localhost:3000/api`

錯誤格式與 001 相同：`{ "error": { "code": "...", "message": "..." } }`。

## POST /api/teacher/session

取得老師憑證。001 的匯入 API、本檔的活動 API、Socket.IO 的老師連線都使用它。

首頁選「老師」時呼叫。

- **Request**：`{}`
- **Response 200**：`{ "token": "<base64url, 43 字元>" }`；同時在伺服器終端機印出一次性的取回連結
- **409 `TEACHER_ACTIVE`**：已有其他分頁持有有效的老師憑證（AC-34）；`message` 說明只能以學生身分加入，或用終端機的取回連結

前端只把憑證存在該分頁的 `sessionStorage`（同一分頁重新整理仍有效，其他分頁讀不到）。憑證只存在這個分頁與伺服器記憶體，不寫入檔案或 log（原則 VI）；伺服器重新啟動後所有憑證失效。

## POST /api/teacher/recover

老師分頁關閉後取回老師身分（AC-35）。前端的 `/teacher/recover` 頁面從網址 `#` 之後讀出取回碼並呼叫。

- **Request**：`{ "code": "<取回碼>" }`
- **Response 200**：`{ "token": "<新憑證>" }`；舊憑證與這個取回碼立即失效，終端機印出下一個取回連結
- **400 `INVALID_RECOVERY_CODE`**：取回碼錯誤或已使用過

## POST /api/activity

建立活動（需要老師憑證，且 001 已確認一份題目清單）。

**Request**

```json
{
  "groupCount": 6,
  "fairMode": { "enabled": false, "windowSeconds": 3 },
  "timeLimitSec": 60,
  "confirmReplace": false
}
```

**Response 201**：`{ "activityId": "a_7f3c…", "phase": "WAITING", "questionCount": 4, "groups": [{ "id": "g1", "name": "第 1 組" }] }`

| HTTP | code | 說明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 沒有或錯誤的老師憑證 |
| 409 | `NO_QUESTION_SET` | 還沒匯入題目 |
| 409 | `ACTIVITY_RUNNING` | 已有進行中的活動 |
| 409 | `UNEXPORTED_RESULTS` | 上一輪已結束，但還沒寫回 Google Sheets 也還沒匯出 CSV（003 紀錄的 `writtenBack`、`csvExported` 都是 `false`）；帶 `confirmReplace: true` 重送即可取代（REQ-BUZ-20） |
| 422 | `INVALID_SETTINGS` | 組數、秒數或公平模式視窗超出範圍；`message` 說明哪一項 |

## GET /api/activity/public

學生選組頁使用，不需要憑證，只回公開資訊。

**Response 200**

```json
{ "activityName": "計算機概論基礎 學習單", "phase": "WAITING", "questionCount": 4, "timeLimitSec": 60,
  "groups": [{ "id": "g1", "name": "第 1 組", "onlineCount": 3 }] }
```

沒有活動時 `204`。
