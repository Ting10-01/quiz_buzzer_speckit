# Contract: 匯入 API（HTTP）

**Owner**: `001-guided-notes-import` | **Base**: `http://localhost:3000/api/import`

所有請求都要帶老師憑證：`Authorization: Bearer <teacherToken>`（由 002 的老師工作階段 API 發出）。沒有或錯誤的憑證回 `401`。活動已經開始搶答時（phase 不是 `WAITING`），所有匯入請求回 `409 IMPORT_LOCKED`（REQ-IMP-15）。Google 授權相關的錯誤見 [google-auth-http.md](./google-auth-http.md)。

請求與回應一律是 JSON；錯誤格式：

```json
{ "error": { "code": "INVALID_NUMBERING", "message": "第 9 列的題號 2 和第 5 列重複。請修正試算表後重新匯入。", "cell": { "sheetId": 0, "sheetName": "學習單", "row": 9, "col": 2 } } }
```

## POST /api/import/sheets

老師在檔案選擇器挑選試算表後呼叫，取得工作表清單。

**Request**：`{ "spreadsheetId": "1AbC…" }`

**Response 200**

```json
{ "title": "計算機概論基礎 學習單", "sheets": [{ "sheetId": 0, "name": "學習單" }, { "sheetId": 1532, "name": "備註" }], "defaultSheetId": 0, "canEdit": true }
```

## POST /api/import/preview

取得預覽。可重複呼叫；每次都取代上一份暫存預覽。

**Request**

```json
{ "spreadsheetId": "1AbC…", "sheetId": 0 }
```

手動指定欄位時（REQ-IMP-05）另加：`"mapping": { "headerRow": 4, "numberCol": 2, "answerCol": 7, "questionCol": 3 }`

**Response 200**

```json
{
  "status": "READY",
  "source": { "spreadsheetId": "1AbC…", "spreadsheetTitle": "計算機概論基礎 學習單", "sheetId": 0, "sheetName": "學習單" },
  "mapping": { "headerRow": 4, "numberCol": 2, "answerCol": 7, "questionCol": 3, "source": "AUTO", "matchedHeaders": ["題號", "題目", "作答"] },
  "summary": { "questionCount": 4, "groupCount": 2, "slotCount": 6 },
  "questions": [ { "number": 1, "kind": "GROUP", "slots": [ { "slotId": "1-1", "label": "（1）", "questionText": "根據文章第一段…", "marker": "（1）", "oldAnswer": null, "cell": { "sheetId": 0, "sheetName": "學習單", "row": 5, "col": 7 } } ] } ],
  "warnings": [ { "code": "READ_ONLY", "questionNumber": null, "cell": null, "text": "目前連結的帳號只能檢視這份試算表，搶答結束後無法寫回答案。請先複製一份到自己的雲端硬碟再挑選。" } ],
  "expectedHeaders": ["題號／編號／題次", "作答／答案／回答", "題目／問題／題幹（可省略）"]
}
```

找不到表頭時：`status: "NEEDS_MAPPING"`、`mapping: null`、`questions: []`，另附 `grid`（該工作表前 30 列的文字預覽），讓前端畫出供老師點選的表格。

**Errors**

| HTTP | code | 說明 |
| --- | --- | --- |
| 401 | `NOT_LINKED` / `AUTH_EXPIRED` | 還沒連結 Google 帳號，或授權已失效；前端引導重新連結 |
| 403 | `NO_ACCESS` | 無法讀取這份試算表 |
| 504 | `NETWORK_ERROR` | 15 秒內連不上 Google，可重試 |
| 422 | `NO_QUESTIONS` / `INVALID_NUMBERING` / `TOO_MANY_QUESTIONS` | 內容不符規則；附 `cell` |
| 422 | `INVALID_MAPPING` | 手動指定的欄位重複或超出範圍 |

`/sheets` 也可能回傳前四種錯誤。

## POST /api/import/confirm

確認目前的預覽（必須是 `READY`），寫入 `QuestionSetStore`。

**Response 200**：`{ "questionCount": 4, "groupCount": 2, "source": { … } }`

**Errors**：`409 NO_PENDING_PREVIEW`（沒有可確認的預覽，或預覽狀態不是 `READY`）。

## POST /api/import/cancel

清除暫存預覽；`QuestionSetStore` 不變（REQ-IMP-14）。**Response 204**。

## GET /api/import/current

取得目前已確認的題目清單摘要（老師重新整理頁面時使用）。

**Response 200**：與 `confirm` 相同格式；沒有時 `204`。
