# Data Model: Guided Notes 匯入

**Feature**: `001-guided-notes-import` | **Date**: 2026-11-18 | **Blueprint**: [`diagrams/001-class.puml`](../../diagrams/001-class.puml)

本文件與類別圖一一對應：每個類別的名稱、欄位與關係都與 `diagrams/001-class.puml` 相同。標示「共用」的型別放在 `packages/shared`，002 與 003 直接引用（契約見 [contracts/question-set.md](./contracts/question-set.md)）。

## 共用（packages/shared）

### QuestionSet

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `source` | GuidedNotesSource | 來源試算表與工作表 |
| `mapping` | ColumnMapping | 這次解析使用的欄位對應 |
| `questions` | Question[] | 依題號由小到大排序；1–200 題 |

衍生值：`questionCount()` = `questions.length`；`groupCount()` = `kind === 'GROUP'` 的題數。

### GuidedNotesSource

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `spreadsheetId` | string | Google 試算表 ID（由檔案選擇器取得） |
| `spreadsheetTitle` | string | 試算表名稱，顯示與匯出檔名用 |
| `sheetId` | number | 工作表 ID（改名後仍不變） |
| `sheetName` | string | 匯入當下的工作表名稱 |

### Question

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `number` | number | 正整數；同一份 QuestionSet 內不重複、遞增，可跳號 |
| `kind` | QuestionKind（`'SINGLE' \| 'GROUP'`） | 題號儲存格跨多列合併時為 `GROUP` |
| `slots` | AnswerSlot[] | `SINGLE` 恰好 1 個；`GROUP` 至少 1 個 |

### AnswerSlot

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `slotId` | string | 單題為 `"3"`；題組小題為 `"1-1"`、`"1-2"`（依列序） |
| `label` | string | 小題標籤；有標記用標記（`"（1）"`），沒有就依序產生；單題為 `""` |
| `questionText` | string \| null | 題目欄的文字；沒有題目欄或該格為空時為 `null` |
| `marker` | string \| null | 填空格原有的小題標記，寫回時保留在答案前面 |
| `oldAnswer` | string \| null | 標記以外的舊答案；有值時會產生 `OLD_ANSWER` 警告 |
| `cell` | CellRef | 填空格位置（合併範圍取左上角） |

### CellRef

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `sheetId` | number | 工作表 ID |
| `sheetName` | string | 工作表名稱（顯示用） |
| `row` | number | 1 起算 |
| `col` | number | 1 起算 |

衍生值：`toA1()`，例如 `{ row: 9, col: 7 }` → `"G9"`。

### ColumnMapping

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `headerRow` | number | 表頭列 |
| `numberCol` | number | 題號欄 |
| `answerCol` | number | 作答欄（合併範圍的最左欄） |
| `questionCol` | number \| null | 題目欄，可以沒有 |
| `matchedHeaders` | string[] | 找到的表頭文字，例如 `["題號","題目","作答"]`，預覽時顯示給老師 |

規則：`numberCol` 與 `answerCol` 不可相同；`questionCol` 不可等於前兩者。

### QuestionSetStore

`save(questionSet)`、`current(): QuestionSet | null`（唯讀）。記憶體保存，同一時間只有一份。

## Google 授權（packages/server/src/google）

| 類別 | 成員 | 說明 |
| --- | --- | --- |
| `GoogleAuthService` | `authUrl()`、`handleCallback(code, state)`、`status()`、`unlink()`、`pickerSession()`、`authorizedClient()` | 見 research R2、R3 |
| `AuthState` | `status: AuthStatus`、`account: LinkedAccount \| null` | |
| `AuthStatus` | `'UNLINKED' \| 'LINKED' \| 'EXPIRED'` | 授權被撤銷或 refresh 失敗時為 `EXPIRED` |
| `LinkedAccount` | `email: string` | 只供顯示 |
| `PickerSession` | `accessToken`、`appId`、`apiKey` | 只回給老師的瀏覽器開啟選擇器 |
| `TokenStore`（介面） | `load()`、`save(token)`、`clear()` | 實作：`LocalTokenStore`（`credentials/google-token.json`）、測試用假物件 |
| `StoredToken` | refresh token、access token、到期時間、帳號 email | 只存在本機憑證檔，不得寫入 log |

### 授權狀態

```text
UNLINKED --handleCallback(同意)--> LINKED
UNLINKED --handleCallback(拒絕或 state 錯誤)--> UNLINKED
LINKED --refresh 失敗或被撤銷--> EXPIRED --重新連結--> LINKED
LINKED | EXPIRED --unlink()--> UNLINKED（撤銷授權並刪除憑證檔）
```

## 001 內部（packages/server/src/import）

### SpreadsheetInfo、SheetInfo

`SpreadsheetInfo`：`title`、`sheets: SheetInfo[]`、`defaultSheetId`（第一個找得到表頭列的工作表，都找不到時為第一個工作表）、`canEdit`。
`SheetInfo`：`sheetId`、`name`。

### ImportPreview

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `source` | GuidedNotesSource | 這次預覽的來源 |
| `mapping` | ColumnMapping | |
| `questionSet` | QuestionSet | |
| `warnings` | ImportWarning[] | 不阻止匯入的提醒 |

### PendingImport

`ImportService` 暫存的預覽：`source`、`preview`。同一時間最多一份；`confirm()` 或 `cancel()` 後清除。

### ImportWarning

| 欄位 | 型別 | 規則 |
| --- | --- | --- |
| `code` | WarningCode（`'OLD_ANSWER' \| 'READ_ONLY'`） | |
| `questionNumber` | number \| null | `OLD_ANSWER` 時必有 |
| `cell` | CellRef \| null | `OLD_ANSWER` 時必有 |
| `text` | string | 舊答案內容，或無法寫回的說明 |

### ImportError

| ImportErrorCode | 何時發生 | 對應 |
| --- | --- | --- |
| `NOT_LINKED` | 還沒連結 Google 帳號 | AC-05 |
| `AUTH_EXPIRED` | 授權被撤銷或已失效 | Edge Cases |
| `NO_ACCESS` | 無法讀取挑選的試算表 | REQ-IMP-11 |
| `NETWORK_ERROR` | 15 秒內連不上 Google | AC-14 |
| `NO_HEADER` | 選定的工作表找不到表頭列 | AC-15 |
| `NO_QUESTIONS` | 表頭以下沒有任何正整數題號 | REQ-IMP-11 |
| `INVALID_NUMBERING` | 題號重複或沒有遞增 | AC-16 |
| `TOO_MANY_QUESTIONS` | 超過 200 題 | REQ-IMP-11 |

`ImportError` 另有 `message`（給老師看的中文說明，含修正方式）、`cell: CellRef | null` 與 `expectedHeaders: string[]`（只有 `NO_HEADER` 時有值，列出各欄接受的表頭寫法）。

### 匯入狀態

```text
（無） --preview() 成功--> PendingImport
（無） --preview() 失敗（含 NO_HEADER）--> 回傳 ImportError，不建立 PendingImport
PendingImport --confirm()--> QuestionSetStore 更新，PendingImport 清除
PendingImport(*) --cancel() 或錯誤--> PendingImport 清除，QuestionSetStore 不變（REQ-IMP-14）
```

沒有老師身分（002 發出的老師憑證）時一律拒絕；活動開始搶答後（002 的 phase 不是 `WAITING`），`listSheets`、`preview`、`confirm` 一律拒絕（REQ-IMP-15）。

## Spreadsheet 抽象（packages/server/src/spreadsheet）

| 型別 | 成員 | 說明 |
| --- | --- | --- |
| `SpreadsheetReader`（介面） | `info(spreadsheetId)`、`open(spreadsheetId, sheetId)` | 實作：`GoogleSheetsReader`（Sheets API v4）、測試用假物件 |
| `Sheet`（介面） | `id()`、`name()`、`maxRow()`、`maxCol()`、`textAt(row, col)`、`valueAt(row, col)`、`mergedRangeAt(row, col)` | `valueAt` 用來分辨數字題號 |
| `RowRange` | `firstRow`、`lastRow`、`firstCol`、`lastCol` | 合併範圍，1 起算、含結尾 |
