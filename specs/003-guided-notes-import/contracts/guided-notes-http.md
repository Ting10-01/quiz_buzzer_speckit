# Contract: 匯入學習單的伺服器 API（HTTP）

**Owner**: `003-guided-notes-import` | **Base**: `/api/guided-notes`（本機伺服器，由 002 建立）

只有 003 的 `HttpGuidedNotesService` 經 002 的 `ApiClient.request(method, path, body?)` 呼叫。實體欄位見 [data-model.md](../data-model.md)；002 的擴充點見 `specs/002-teacher-login/contracts/server-extension.md`。

## 共通規則

- 兩支路由都在 002 的 `buildApp(config, deps)` 以 `app.register(guidedNotesRoutes)` 註冊，並加上 `{ preHandler: app.requireTeacher }`；也加入 002 T043 的「老師專用路由清單」測試。沒有或失效的老師憑證回 `401 UNAUTHORIZED`（002），不讀取任何試算表（REQ-IMP-02）。
- 請求與回應都是 JSON。錯誤回應一律是 002 的 `ErrorBody`：`{ "code": "...", "message": "..." }`。
- 學習單內容的問題（`ImportError`）**不是**錯誤回應：`POST /read` 以 200 回傳 `ImportSuccess` 或 `ImportError`，前端以 001 `shared/src/guards.ts` 的 `isImportError` 區分。原因：`ApiClient` 對非 2xx 只保留 `{ status, code, message }`，`ImportError` 的 `foundHeaders`、`acceptedHeaders`、`fixSteps` 會遺失。
- 伺服器對 Google 的每個請求逾時 15 秒（REQ-IMP-13、SC-006）。
- 匯入只讀取試算表，不修改任何儲存格（REQ-IMP-17）。

## 錯誤回應（兩支路由共用）

| HTTP | `code` | `message` | 何時 |
| --- | --- | --- | --- |
| 400 | `BAD_REQUEST` | 讀取學習單的請求格式錯誤 | `spreadsheetId`、`worksheet` 不符格式，或有多餘欄位 |
| 401 | `UNAUTHORIZED` | （002 共通） | `requireTeacher` 拒絕 |
| 401 | `NOT_SIGNED_IN` | 老師登入已失效，請回首頁重新登入 | `app.googleClients.authorizedClient()` 丟 `TeacherNotSignedInError` |
| 401 | `GOOGLE_AUTH_EXPIRED` | Google 授權已失效，請回首頁重新登入 | Google API 失敗且 002 的 `isGoogleAuthExpired(error)` 為 true（`SheetsReadError('AUTH_EXPIRED')`） |
| 403 | `NO_ACCESS` | 無法讀取這份試算表，請用「重新挑選」再挑一次 | 只有 `GET /spreadsheets/:id`：Google 回 403、404 |
| 502 | `GOOGLE_UNAVAILABLE` | 連不上 Google，請稍後再試 | 15 秒內連不上 Google、網路錯誤、Google 5xx（與 002 相同） |
| 500 | `INTERNAL` | （002 共通） | 其他未預期的錯誤 |

## GET /api/guided-notes/spreadsheets/:spreadsheetId

`pickSpreadsheet()` 在 Picker 挑選後呼叫，取得 `Spreadsheet`。不改變 `ImportStore`。

**Path**：`spreadsheetId` 符合 `^[A-Za-z0-9_-]{10,200}$`。

**200**

```json
{ "id": "1AbC…", "title": "計算機概論基礎 學習單", "editable": true, "worksheets": ["說明", "學習單"], "selectedWorksheet": "學習單" }
```

## POST /api/guided-notes/read

`readWorksheet(spreadsheetId, worksheet)` 呼叫。回傳 `ImportSuccess` 時以它取代 `ImportStore`；回傳 `ImportError` 或錯誤回應時 `ImportStore` 不變（REQ-IMP-14、REQ-IMP-15）。

**Request**

```json
{ "spreadsheetId": "1AbC…", "worksheet": "學習單" }
```

`spreadsheetId` 同上；`worksheet` 為 1～100 字元的字串。多餘的欄位拒絕。

**200 ImportSuccess**（題組範本）

```json
{
  "spreadsheet": { "id": "1AbC…", "title": "計算機概論基礎 學習單", "editable": true, "worksheets": ["學習單"], "selectedWorksheet": "學習單" },
  "headerRow": 4,
  "headerColumns": ["B", "C", "G"],
  "questions": [
    { "number": 1, "type": "GROUP", "text": "（1）根據文章第一段，…其英文簡稱是什麼？\n（2）而他安裝的 Windows …統稱為什麼？",
      "subQuestions": [ { "index": 1, "blankCell": "G5", "marker": "（1）" }, { "index": 2, "blankCell": "G6", "marker": "（2）" } ] },
    { "number": 3, "type": "SINGLE", "text": "無論小明寫的高階語言多麼複雜，…二進位訊號？",
      "subQuestions": [ { "index": 1, "blankCell": "G11", "marker": "" } ] }
  ]
}
```

（範例省略第 2、4 題）

**200 ImportError**

```json
{
  "code": "NO_HEADER",
  "reason": "在「學習單」工作表找不到同時寫著題號欄與作答欄表頭的列，所以沒有匯入任何題目。",
  "foundHeaders": ["No.", "內容", "學生填寫"],
  "acceptedHeaders": ["題號欄：題號、編號、題次", "作答欄：作答、答案、回答", "題目欄（可以沒有）：題目、問題、題幹"],
  "fixSteps": ["把題號欄的表頭改成「題號」「編號」或「題次」。", "把作答欄的表頭改成「作答」「答案」或「回答」。", "改好後按「重新讀取」。"]
}
```

其他 `code`（`NO_QUESTIONS`、`INVALID_NUMBERING`、`TOO_MANY_QUESTIONS`、`NO_BLANK`、`NO_ACCESS`、`NO_WORKSHEET`）格式相同，`foundHeaders`、`acceptedHeaders` 為 `[]`。各 code 的 `reason` 範例：

| `code` | `reason` 範例 | `fixSteps` 範例 |
| --- | --- | --- |
| `NO_QUESTIONS` | 「學習單」工作表的表頭（第 4 列）以下沒有任何題號。 | 在題號欄填上正整數題號後按「重新讀取」。 |
| `INVALID_NUMBERING` | 第 9 列的題號 2 和第 5 列重複。／第 9 列的題號 2 比上一題（第 7 列的題號 3）小，題號必須由上到下遞增。 | 修正題號，讓題號不重複且由上到下遞增（可以跳號），再按「重新讀取」。 |
| `TOO_MANY_QUESTIONS` | 這份學習單有 201 題，超過上限 200 題。 | 把學習單拆成兩份，各自匯入。 |
| `NO_BLANK` | 第 3 題（第 11 列）沒有自己的填空格，作答欄的儲存格和上一列合併在一起。 | 取消作答欄的合併，讓每題（每個小題）都有自己的填空格，再按「重新讀取」。 |
| `NO_ACCESS` | 目前登入的 Google 帳號讀不到這份試算表。 | 確認試算表還在你的雲端硬碟中，按「重新挑選」從 Google 雲端硬碟再挑一次。 |
| `NO_WORKSHEET` | 試算表中找不到「學習單」工作表，可能已被改名或刪除。 | 按「重新挑選」重新選擇這份試算表。 |

## 前端對應（`HttpGuidedNotesService`）

| 方法 | 呼叫 | 回傳 |
| --- | --- | --- |
| `pickSpreadsheet()` | `GooglePickerLauncher.pick()`；`null` 時直接回 `null`，不呼叫伺服器；否則 `ApiClient.request('GET', '/api/guided-notes/spreadsheets/' + id)` | `Spreadsheet` |
| `readWorksheet(id, ws)` | `ApiClient.request('POST', '/api/guided-notes/read', { spreadsheetId: id, worksheet: ws })` | 回應原樣回傳（`ImportSuccess` 或 `ImportError`） |

錯誤回應與連不上伺服器由 `ApiClient` 以 `ApiError { status, code, message }` reject（符合 001 的 `UnexpectedError`，`message` 取 `ErrorBody.message`；`401 UNAUTHORIZED` 與連不上伺服器的訊息由 002 決定）。`HttpGuidedNotesService` 不另外轉換，直接往上丟。

`GooglePickerLauncher` 以 `ApiClient.request('GET', '/api/auth/picker-token')` 取得 002 的 `{ accessToken, apiKey, appId }`；失敗時同樣是 `ApiError`。Picker 腳本載入失敗或 15 秒內沒載入完成時，丟出 `UnexpectedError`「無法載入 Google 檔案選擇器，請確認網路連線」。
