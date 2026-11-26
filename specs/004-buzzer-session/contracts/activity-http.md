# Contract: 老師的活動指令（HTTP）

**Owner**: `004-buzzer-session` | **Base**: 002 的 Fastify 伺服器 | **Types**: `shared/src/activitySync.ts`

所有端點都掛 `{ preHandler: app.requireTeacher }`（002；`Authorization: Bearer <老師憑證>`）。沒有或無效的憑證回 `401 UNAUTHORIZED`（由 002 決定內容），活動不變（REQ-ACT-09、AC-07）。五條路由都加進 002 `server/tests/integration/requireTeacher.test.ts` 的「老師專用路由清單」（002 T043）。錯誤回應一律是 002 的 `ErrorBody` `{ code, message }`。每個端點在 `CommandQueue.run` 內處理（REQ-ACT-17）。

## 回應格式

| 狀態碼 | Body | 何時 |
| --- | --- | --- |
| `200` | `ActivitySnapshot`（`Audience.TEACHER`） | 成功，包含重複要求（REQ-ACT-07） |
| `200` | `ValidationError`（`field: "groupCount"`） | 組數不合法（預期中的失敗一律用 `200` 回傳，前端以 `isValidationError` 區分）；`message` 見 data-model「ValidationError 的內容」；活動不變 |
| `409` | `{ code: string, message: string }` | 規則不允許（data-model `ActivityRuleError`） |
| `401` | `{ code: "UNAUTHORIZED", message }`（002） | 沒有老師身分 |

## 端點

| 方法與路徑 | Body | 成功時的狀態改變 | 可能的 `ValidationError`（200）/ 409 |
| --- | --- | --- | --- |
| `POST /api/activity` | `ActivitySettings`（`{ groupCount }`） | `null` → `PREPARING`；題目取自 `ImportStore.latest()` | `groupCount`；409 `ACTIVITY_EXISTS`、`NO_IMPORT` |
| `PUT /api/activity/settings` | `ActivitySettings` | `PREPARING` 的 `groupCount` | `groupCount`；409 `NO_ACTIVITY`、`SETTINGS_LOCKED` |
| `DELETE /api/activity` | — | `PREPARING` → `null`；清除所有組別（`GroupMembership.reset()`）；回應 `{ version, activity: null }`。沒有活動時不改變，回傳目前快照 | 409 `CANCEL_LOCKED` |
| `POST /api/activity/questions/:n/open` | — | `PREPARING`（n=1）或 `QUESTION_ENDED(n-1)` → `OPEN(n)`；記錄 `openedAt[n]` | 409 `NO_ACTIVITY`、`QUESTION_NOT_NEXT` |
| `POST /api/activity/questions/:n/end` | — | `OPEN(n)` → `QUESTION_ENDED(n)`，或最後一題時 → `FINISHED`；記錄 `endedAt[n]` | 409 `NO_ACTIVITY`、`QUESTION_NOT_OPEN` |

body 的 JSON schema 只要求是物件；`groupCount` 不是整數（例如 3.5、字串）由 `ActivityManager` 回 `200 ValidationError`，不用 Fastify 的 schema 錯誤（那會變成非 2xx，`field` 會遺失）。`:n` 不是整數時回 409 `QUESTION_NOT_NEXT`／`QUESTION_NOT_OPEN`。

## 範例

```http
POST /api/activity
Authorization: Bearer <token>
Content-Type: application/json

{ "groupCount": 4 }
```

```json
{
  "version": 1,
  "activity": {
    "groupCount": 4,
    "phase": "PREPARING",
    "spreadsheet": { "id": "1AbC…", "title": "計算機概論基礎 學習單", "editable": true, "worksheets": ["工作表1"], "selectedWorksheet": "工作表1" },
    "questions": [ { "number": 1, "type": "GROUP", "subQuestions": [ { "index": 1, "blankCell": "C5" }, { "index": 2, "blankCell": "C6" } ] } ],
    "groups": [ { "number": 1, "memberCount": 0 }, { "number": 2, "memberCount": 0 }, { "number": 3, "memberCount": 0 }, { "number": 4, "memberCount": 0 } ]
  }
}
```

成功後所有連線另外會收到 `activity:snapshot` 推送（[socket-events.md](./socket-events.md)）；老師分頁會因版本相同而忽略那一份。
