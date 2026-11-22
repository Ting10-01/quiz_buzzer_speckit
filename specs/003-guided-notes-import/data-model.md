# Data Model: 匯入學習單

**Feature**: `003-guided-notes-import` | **Date**: 2026-11-21 | **Blueprint**: [`diagrams/003-class.puml`](../../diagrams/003-class.puml)

本文件與 003 類別圖一一對應：類別名稱、欄位、方法與關聯相同。實體沿用 001 的 [data-model.md](../001-ui-prototype/data-model.md)（`shared/src/entities.ts`），本文件只定義 003 填入的值與規則，不新增或修改 001 的實體欄位。小題標記只存在伺服器的 `ImportStore`（§3、[contracts/import-store.md](contracts/import-store.md)）。

## 1. 實體（001，003 定義欄位的值）

### Spreadsheet

| 欄位 | 型別 | 003 的規則 |
| --- | --- | --- |
| `id` | string | Google 試算表 ID（Picker 的 `docs[0].id`） |
| `title` | string | `spreadsheets.get` 的 `properties.title` |
| `editable` | boolean | Drive `capabilities.canEdit`（REQ-IMP-11） |
| `worksheets` | string[] | 所有工作表名稱，依 `sheets[].properties.index` 排序（REQ-IMP-03） |
| `selectedWorksheet` | string | `describe`：第一個找得到表頭的工作表，都沒有時為第一個；`read`：這次讀取的工作表 |

### Question

| 欄位 | 型別 | 003 的規則 |
| --- | --- | --- |
| `number` | number | 正整數；同一份結果內嚴格遞增，可跳號（REQ-IMP-06） |
| `type` | QuestionType（`SINGLE`／`GROUP`） | 題號儲存格跨多列合併時為 `GROUP`（REQ-IMP-08） |
| `text` | string [0..1] | 單題：題目欄文字；題組：每行「標記＋文字」以 `\n` 連接；沒有文字時不設（REQ-IMP-07） |
| `subQuestions` | SubQuestion[]（1..*） | `SINGLE` 恰好 1 個；`GROUP` 至少 1 個，依列序 |

### SubQuestion

| 欄位 | 型別 | 003 的規則 |
| --- | --- | --- |
| `index` | number | 從 1 起算，依列序 |
| `blankCell` | string | A1 表示法（例如 `G5`）；合併範圍取左上角（REQ-IMP-10） |

### ImportSuccess

| 欄位 | 型別 | 003 的規則 |
| --- | --- | --- |
| `spreadsheet` | Spreadsheet | `selectedWorksheet` 為這次讀取的工作表 |
| `headerRow` | number | 表頭列，從 1 起算 |
| `headerColumns` | string[] | 依「題號欄、題目欄（有才列）、作答欄」順序的欄字母，例如 `["B","C","G"]` 或 `["B","G"]` |
| `questions` | Question[]（1..200） | 依 `number` 遞增 |

### ImportError

| 欄位 | 型別 | 003 的規則 |
| --- | --- | --- |
| `code` | string | `ImportErrorCode` 的 7 個值之一 |
| `reason` | string | 給老師看的原因；能指出位置時附工作表、列與題號 |
| `foundHeaders` | string[] | 只有 `NO_HEADER` 有值（research R3）；其他為 `[]` |
| `acceptedHeaders` | string[] | 只有 `NO_HEADER` 有值：`["題號欄：題號、編號、題次", "作答欄：作答、答案、回答", "題目欄（可以沒有）：題目、問題、題幹"]`；其他為 `[]` |
| `fixSteps` | string[] | 至少 1 條（SC-003） |

### ImportErrorCode（`code` 的值）

| 值 | 何時 | 需求 |
| --- | --- | --- |
| `NO_HEADER` | 工作表找不到表頭列 | REQ-IMP-05 |
| `NO_QUESTIONS` | 表頭以下沒有題號 | REQ-IMP-12 |
| `INVALID_NUMBERING` | 題號重複或不遞增 | REQ-IMP-06、12 |
| `TOO_MANY_QUESTIONS` | 超過 200 題 | REQ-IMP-06、12 |
| `NO_BLANK` | 某題沒有獨立的填空格 | REQ-IMP-10、12 |
| `NO_ACCESS` | `read` 時 Google 回 403／404 | REQ-IMP-12 |
| `NO_WORKSHEET` | 沒有指定名稱的工作表 | REQ-IMP-12 |

### UnexpectedError

`message: string`。錯誤回應與連不上伺服器由 002 的 `ApiClient` 以 `ApiError { status, code, message }` reject，符合這個形狀，003 不另外轉換（research R7）。Picker 腳本載入失敗時由 `GooglePickerLauncher` 丟出。

## 2. 前端（`frontend/src/services/`）

| 類別 | 成員 | 說明 |
| --- | --- | --- |
| `GuidedNotesService`（001 介面） | `pickSpreadsheet(): Promise<Spreadsheet \| null>`、`readWorksheet(spreadsheetId, worksheet): Promise<ImportSuccess \| ImportError>` | 不修改 |
| `HttpGuidedNotesService` | `-api: ApiClient`、`-picker: GooglePickerLauncher`；實作上面兩個方法 | 003 新增；`readWorksheet` 把 200 的內容（`ImportSuccess` 或 `ImportError`）原樣回傳；`createServiceRegistry()` 改綁定它 |
| `GooglePickerLauncher` | `-api: ApiClient`、`pick(): Promise<string \| null>` | 經 `ApiClient` 取 picker token、開 Picker；取消回 `null`（research R2） |

## 3. 伺服器（`server/src/guided-notes/`）

| 類別 | 成員 | 說明 |
| --- | --- | --- |
| `guidedNotesRoutes`（Fastify plugin） | `GET /api/guided-notes/spreadsheets/:spreadsheetId`、`POST /api/guided-notes/read` | 在 `buildApp` 以 `app.register` 註冊，加 `{ preHandler: app.requireTeacher }`；契約見 [contracts/guided-notes-http.md](contracts/guided-notes-http.md) |
| `GuidedNotesImporter` | `describe(spreadsheetId): Promise<Spreadsheet>`、`read(spreadsheetId, worksheet): Promise<ImportSuccess \| ImportError>` | `read` 成功時呼叫 `ImportStore.save()`；失敗不呼叫 |
| `SpreadsheetReader`（介面） | `load(spreadsheetId): Promise<LoadedSpreadsheet>` | 讓測試用假物件（原則 III、VIII） |
| `LoadedSpreadsheet` | `id`、`title`、`editable`、`sheets: SheetGrid[]`（1..*） | 一份試算表的完整內容 |
| `SheetGrid` | `sheetId`、`name`、`rowCount`、`colCount`、`fromApi(sheet)`（static）、`text(row, col)`、`textA1(a1)`、`number(row, col)`、`mergeAt(row, col)`、`toA1(row, col)` | `textA1('G5')` 等於 `text(5, 7)`；`fromApi` 由 `spreadsheets.get` 的一個 `sheets[]`（`ApiSheet`，即 `@googleapis/sheets` 的 `sheets_v4.Schema$Sheet`）建立；`toA1(5, 7)` 為 `G5`；列欄從 1 起算；`text` 用 `formattedValue`；`number` 用 `effectiveValue.numberValue` |
| `CellRange` | `startRow`、`endRow`、`startCol`、`endCol` | 合併範圍，從 1 起算、含結尾（API 的 GridRange 是 0 起算、結尾不含） |
| `SheetsReadError` | `kind: 'NO_ACCESS' \| 'UNAVAILABLE' \| 'AUTH_EXPIRED'` | `GoogleSheetsReader` 丟出（research R1）；`AUTH_EXPIRED` 依 002 的 `isGoogleAuthExpired` |
| `GoogleSheetsReader` | `-clients: GoogleClientProvider`、`load(spreadsheetId)` | 實作 `SpreadsheetReader`；`buildApp` 以 `app.googleClients` 建立，提供為 `app.spreadsheetReader`。每次 `load` 都重新呼叫 `authorizedClient()`，不保存 client：任何人登入都會換成新帳號的授權（002 REQ-AUTH-03），新帳號沒有權限時回 `NO_ACCESS` |
| `GuidedNotesParser` | `parse(grid, spreadsheet): ImportSuccess \| ImportError`、`markersOf(grid, result): BlankMarkers` | 不碰網路，不讀寫 `ImportStore`；`markersOf` 對 `result` 的每個 `blankCell` 以 `QuestionScanner.extractMarker(grid.textA1(blankCell))` 取得標記 |
| `HeaderLocator` | `NUMBER_HEADERS`、`ANSWER_HEADERS`、`QUESTION_HEADERS`、`locate(grid): HeaderMatch \| null`、`currentHeaderTexts(grid): string[]` | research R3 |
| `HeaderMatch` | `row`、`numberCol`、`answerCol`、`questionCol?` | 欄號從 1 起算 |
| `QuestionScanner` | `scan(grid, header): ScannedQuestion[] \| ImportError`、`extractMarker(text): string`（static） | research R4；`scan` 只會回傳 `NO_BLANK`；`extractMarker` 回傳開頭的「（n）」「(n)」或 `""` |
| `ScannedQuestion` | `row`、`question: Question` | `row` 是題號所在列，供錯誤訊息使用 |
| `importErrors`（模組） | `noHeader`、`noQuestions`、`invalidNumbering`、`tooManyQuestions`、`noBlank`、`noAccess`、`noWorksheet` | 產生 `ImportError`（research R5） |
| `ImportStore` | `-latestResult: ImportSuccess \| null`、`-latestBlankMarkers: BlankMarkers \| null`、`save(result, markers)`、`latest(): ImportSuccess \| null`、`latestMarkers(): BlankMarkers \| null` | 伺服器記憶體；`buildApp` 建立一個，提供為 `app.importStore`；004 只呼叫 `latest()`，006 呼叫 `latest()`、`latestMarkers()` |
| `BlankMarkers` | `Readonly<Record<string, string>>` | 鍵為 `blankCell`（A1），值為填空格開頭原有的小題標記或 `""`；`latest()` 的每個 `blankCell` 恰好一筆（REQ-IMP-09） |

002 提供、003 只引用（`specs/002-teacher-login/contracts/server-extension.md`）：`buildApp(config, deps)`、`app.requireTeacher`、`app.googleClients`（`GoogleClientProvider.authorizedClient()`）、`isGoogleAuthExpired(error)`、`TeacherNotSignedInError`、`ErrorBody`、`loggerOptions`、`GET /api/auth/picker-token`（`{ accessToken, apiKey, appId }`）、前端的 `ApiClient.request(method, path, body?)` 與 `ApiError`。

## 4. 狀態

```text
ImportStore: null --read() 成功--> 結果 A --read() 成功--> 結果 B …
             任何狀態 --read() 回傳 ImportError / 丟出錯誤、describe()、pick 取消--> 不變
             伺服器重新啟動 --> null
```

`ImportStore.latest()` 回傳的物件不得被 004、006 修改；`save()` 存入前以 `structuredClone` 複製，`latest()` 回傳 `Readonly` 型別。
