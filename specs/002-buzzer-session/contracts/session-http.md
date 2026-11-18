# Contract: 老師身分與活動建立（HTTP）

**Owner**: `002-buzzer-session` | **Base**: `http://localhost:3000/api`

錯誤格式與 001 相同：`{ "error": { "code": "...", "message": "..." } }`。

## POST /api/teacher/session

取得老師憑證。001 的匯入 API、本檔的活動 API、Socket.IO 的老師連線都使用它。

- **Request**：Body 可帶 `{ "token": "<舊憑證>" }`（同一分頁重新整理時取回身分）。
- **Response 200**：`{ "token": "<base64url, 43 字元>" }`
- **409 `TEACHER_ACTIVE`**：已有其他分頁持有老師身分且活動未結束。

憑證只存在老師瀏覽器的 `localStorage` 與伺服器記憶體，不寫入檔案或 log（原則 VI）。同一個瀏覽器重新開啟老師頁面時，帶著舊憑證呼叫即可取回老師身分；伺服器重啟後舊憑證失效，回 `200` 並發新憑證（沒有進行中的活動時）。

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
| 409 | `UNEXPORTED_RESULTS` | 上一輪已結束但還沒匯出；帶 `confirmReplace: true` 重送即可取代（REQ-BUZ-20） |
| 422 | `INVALID_SETTINGS` | 組數、秒數或公平模式視窗超出範圍；`message` 說明哪一項 |

## GET /api/activity/public

學生選組頁使用，不需要憑證，只回公開資訊。

**Response 200**

```json
{ "activityName": "計算機概論基礎 學習單", "phase": "WAITING", "questionCount": 4, "timeLimitSec": 60,
  "groups": [{ "id": "g1", "name": "第 1 組", "onlineCount": 3 }] }
```

沒有活動時 `204`。
