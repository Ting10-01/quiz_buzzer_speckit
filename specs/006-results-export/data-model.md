# Data Model: 結果與寫回

**Feature**: `006-results-export` | **Date**: 2026-11-21 | **Blueprint**: [`diagrams/006-class.puml`](../../diagrams/006-class.puml)

本文件與 006 類別圖一一對應：類別名稱、欄位、方法與關聯相同。其他子功能的類別名稱與簽章依各自的 contracts：002 `server-extension.md`、003 `import-store.md` 與 data-model、004 `server-modules.md` 與 data-model、005 `submission-store.md`。

## 1. 沿用 001 的實體與介面（006 不修改）

型別位置：`shared/src/entities.ts`、`frontend/src/services/interfaces.ts`（001 data-model）。

| 實體／介面 | 欄位或方法 | 006 的用法 |
| --- | --- | --- |
| `QuestionResult` | `questionNumber`、`winner?: Submission`、`submissionCount`、`behindFirstMs: number[]`、`submissions: Submission[]` | `ResultQuery` 的回傳值；`submissions`、`behindFirstMs` 依公布範圍過濾（第 3 節） |
| `Submission` | `questionNumber`、`groupNumber`、`answers`、`rank`、`elapsedMs`、`judgement` | 由 005 產生，006 只讀取 |
| `SubQuestion` | `index`、`blankCell` | `blankCell` 是寫入位置；小題標記不在這裡，取自 003 `ImportStore.latestMarkers()`（第 5 節） |
| `WriteBackResult` | `ok`、`cellCount`、`failureReason?` | 寫回的回傳值；`failureReason` 為 spec「寫回失敗原因」表的訊息 |
| `ResultService` | `getQuestionResult`、`getAllResults`、`writeBack` | 由 `ServerResultService` 實作 |
| `UnexpectedError` | `message` | `ServerResultService` 遇到非預期錯誤時 reject 的值（002 的 `ApiError` 符合這個形狀） |

## 2. 前端（`frontend/src/services/ServerResultService.ts`）

### `ServerResultService`（實作 `ResultService`）

| 成員 | 說明 |
| --- | --- |
| `realtime: RealtimeClient` | 004 建立、各服務共用的 Socket.IO 連線 |
| `api: ApiClient` | 002 提供；自動帶本分頁的老師憑證 |
| `getQuestionResult(questionNumber)` | `realtime.emitWithAck('result:question', { questionNumber })`；ack `{ ok: true, result }` → 回傳；`{ ok: false, code, message }` → reject `UnexpectedError(message)`；逾時由 `RealtimeClient` reject |
| `getAllResults()` | `realtime.emitWithAck('result:all', {})`，處理方式同上 |
| `writeBack()` | `api.request('POST', '/api/results/write-back')`。`200` → 回傳 body（`WriteBackResult`，成功或預期中的失敗）。`ApiError` `401 GOOGLE_AUTH_EXPIRED` → `{ ok: false, cellCount: 0, failureReason: error.message }`；`401 UNAUTHORIZED` → `{ ok: false, cellCount: 0, failureReason: "老師登入已失效，請回首頁重新登入。沒有寫入任何格子。" }`；其他 → 原樣 reject |

## 3. 伺服器：結果查詢（`server/src/results/`）

### `ResultQuery`

| 成員 | 說明 |
| --- | --- |
| `activities: ActivityStore` | 004 |
| `submissions: SubmissionStore` | 005 |
| `questionResult(questionNumber, viewerGroup): QuestionResult` | `state = activities.current()`；`null` → `NO_ACTIVITY`；題號不在 `state.questions` → `QUESTION_NOT_FOUND`；`isEnded` 為 false → `QUESTION_NOT_ENDED`；否則回傳 `visible(full, state.phase === FINISHED, viewerGroup)` |
| `allResults(viewerGroup): QuestionResult[]` | `state` 為 `null` → `NO_ACTIVITY`；否則依 `state.questions` 的順序，只含 `isEnded` 為 true 的題目，每題經 `visible` 過濾 |
| `isEnded(state, questionNumber)` | `state.phase === FINISHED \|\| state.endedAt.has(questionNumber)`（research RD-03） |
| `visible(full, finished, viewerGroup)` | `finished` → `full`；否則 `own = full.submissions.filter(s => s.groupNumber === viewerGroup)`（`viewerGroup` 為 `null` 時為空陣列），回傳 `{ questionNumber, submissionCount, winner: hide(full.winner), submissions: own.map(hide), behindFirstMs: own.map(() => 0) }`；`hide(s) = { ...s, rank: 0 }`（research RD-02） |

`full` 的組成：`submissions = submissions.list(n)`（依 `rank` 排序）、`winner = submissions.winner(n) ?? undefined`、`submissionCount = submissions.list(n).length`、`behindFirstMs = list.map(s => s.elapsedMs - list[0].elapsedMs)`（第一名為最早送出的組別，001 D23，research RD-12；沒有送出時為 `[]`）。

### `ResultQueryError`、`ResultQueryErrorCode`

| code | message |
| --- | --- |
| `NO_ACTIVITY` | 目前沒有活動 |
| `QUESTION_NOT_FOUND` | 沒有這一題 |
| `QUESTION_NOT_ENDED` | 這一題還沒結束，結果尚未公布 |

### `registerResultHandlers(io, query, members)`

在 002 的 `app.io` 上註冊 `result:question`、`result:all`（[contracts/results-api.md](contracts/results-api.md)）。`viewerGroup = members.groupOf(socket)`；`ResultQueryError` 轉成 ack `{ ok: false, code, message }`（欄位同 002 的 `ErrorBody`）。

## 4. 伺服器：寫回（`server/src/results/`）

### `WriteBackService`

| 成員 | 說明 |
| --- | --- |
| `inProgress: boolean` | 有寫回正在進行時為 true（research RD-08） |
| `activities` | 004 `ActivityStore` |
| `imports` | 003 `ImportStore` |
| `reader` | 003 `SpreadsheetReader`（`app.spreadsheetReader`） |
| `parser` | 003 `GuidedNotesParser`（`new GuidedNotesParser()`） |
| `query` | `ResultQuery` |
| `writer` | `SpreadsheetWriter` |
| `now` | 取得目前時間（測試可替換） |
| `writeBack(): Promise<WriteBackResult>` | 依「寫回步驟」執行；成功回 `{ ok: true, cellCount }`；失敗丟出 `WriteBackFailure`，由 `resultsRoutes` 轉成 HTTP 回應（見下表） |
| `firstLayoutMismatch(stored, current): number \| null` | research RD-04；`current` 為 `ImportError` 時回 `stored` 的第一題題號 |
| `planCells(stored, markers, results): CellText[]` | 對每個有 `winner` 的題目、每個小題 `i`：`cell = subQuestions[i].blankCell`、`{ cell, text: composeCellText(markers[cell]?.inBlankCell ? markers[cell].marker : '', winner.answers[i]) }`（標記在左邊另一格時只寫答案，REQ-RES-08）；沒有 `winner` 的題目不產生 |
| `mapGoogleError(error, step): WriteBackFailure` | research RD-07 的對應表 |

**寫回步驟**（與時序圖第 3 段一致）：

1. `inProgress` 為 true → `IN_PROGRESS`；否則設為 true（`finally` 清除）。
2. `state = activities.current()`；為 `null` 或 `phase !== FINISHED` → `NOT_FINISHED`。
3. `stored = imports.latest()`、`markers = imports.latestMarkers()`；`stored` 為 `null`，或 `stored.spreadsheet.id`、`stored.spreadsheet.selectedWorksheet` 與 `state.spreadsheet` 不同 → `IMPORT_CHANGED`。
4. `cells = planCells(stored, markers, query.allResults(null))`；為空 → 回 `{ ok: true, cellCount: 0 }`，不讀取、不備份、不寫入。
5. `loaded = reader.load(id)`（錯誤 → `mapGoogleError(·, READ)`）；`grid` 為 `loaded.sheets` 中名稱等於 `selectedWorksheet` 的一個，沒有 → `SHEET_NOT_FOUND`；`loaded.editable === false` → `NO_EDIT_PERMISSION`；`current = parser.parse(grid, stored.spreadsheet)`；`firstLayoutMismatch(stored, current)` 有題號 → `LAYOUT_CHANGED`。
6. `writer.duplicateSheet(id, grid.sheetId, backupName(selectedWorksheet, now(), loaded.sheets.map(s => s.name)), loaded.sheets.indexOf(grid) + 1)`（錯誤 → `BACKUP`）。003 的 `GoogleSheetsReader` 依 Google 的工作表順序排列 `loaded.sheets`，所以 `indexOf(grid) + 1` 是學習單的下一個位置。
7. `writer.writeTexts(id, selectedWorksheet, cells)`（錯誤 → `WRITE`）。
8. 回 `{ ok: true, cellCount: cells.length }`。

### `WriteBackFailure`、`WriteBackErrorCode`

欄位為 `code`、`message`；`message` 是 spec「寫回失敗原因」表的文字。`resultsRoutes` 的轉換：預期中的失敗一律回 `200` 與 `WriteBackResult { ok: false, cellCount: 0, failureReason: message }`；只有 `GOOGLE_AUTH_EXPIRED` 回 `401` 與 002 `ErrorBody { code, message }`（002 的 `ApiClient` 遇到非 2xx 只保留 `status`、`code`、`message`）：

| code | HTTP 回應 | spec 的情況 |
| --- | --- | --- |
| `NOT_FINISHED` | 200 `ok: false` | 活動還沒結束或沒有活動 |
| `IMPORT_CHANGED` | 200 `ok: false` | 目前匯入的學習單不是活動使用的學習單 |
| `LAYOUT_CHANGED` | 200 `ok: false` | 版面與匯入時不一致（訊息帶題號） |
| `NO_EDIT_PERMISSION` | 200 `ok: false` | 沒有編輯權限 |
| `SHEET_NOT_FOUND` | 200 `ok: false` | 試算表或工作表找不到、無法開啟 |
| `GOOGLE_AUTH_EXPIRED` | 401 `ErrorBody` | Google 授權失效（代碼沿用 002） |
| `GOOGLE_UNAVAILABLE` | 200 `ok: false` | 讀取、備份或寫入時連不上 Google（Google 已回應失敗） |
| `BACKUP_FAILED` | 200 `ok: false` | 備份失敗 |
| `WRITE_UNCONFIRMED` | 200 `ok: false` | 寫入要求已送出，但 15 秒沒有回應 |
| `IN_PROGRESS` | 200 `ok: false` | 寫回進行中 |

「老師憑證無效」由 002 的 `app.requireTeacher` 回 `401 UNAUTHORIZED`，不在此列舉（前端轉換見第 2 節）。非預期錯誤（程式錯誤、`READ` 步驟無法分類的錯誤）由 Fastify 回 `500`，前端以 `ApiError` reject。

### `WriteBackStep`

`READ`、`BACKUP`、`WRITE`：`mapGoogleError` 用來區分同一種錯誤在不同步驟的意義。

### `CellText`

| 欄位 | 說明 |
| --- | --- |
| `cell: string` | 003 匯入時的填空格位置（A1，例如 `G5`，不含工作表名稱） |
| `text: string` | 要寫入的文字 |

### `cellTextRules`（純函式，`cellText.ts`）

| 函式 | 規則 |
| --- | --- |
| `composeCellText(marker, answer)` | `marker === ''` → `answer`；否則 `marker + answer`（例：`（1）` + `CPU` → `（1）CPU`） |
| `backupName(worksheet, now, existing)` | `base = ${worksheet}-備份-${YYYYMMDD}-${HHmm}`（`now` 的本機時間）；`base` 不在 `existing` → `base`；否則第一個不在 `existing` 的 `${base}-2`、`${base}-3`… |

### `SpreadsheetWriter`（介面）與 `GoogleSheetsWriter`

| 方法 | `GoogleSheetsWriter` 的做法 |
| --- | --- |
| `duplicateSheet(spreadsheetId, sheetId, newTitle, insertIndex): Promise<void>` | `spreadsheets.batchUpdate` 一個 `duplicateSheet` 請求（`sourceSheetId: sheetId`、`newSheetName: newTitle`、`insertSheetIndex: insertIndex`） |
| `writeTexts(spreadsheetId, worksheet, cells): Promise<void>` | 一次 `spreadsheets.values.batchUpdate`，`valueInputOption: 'RAW'`，`data` 每格一個 `{ range: "'<worksheet>'!<cell>", values: [[text]] }`；工作表名稱中的 `'` 改為 `''` |

`GoogleSheetsWriter` 用 `@googleapis/sheets`；`clients` 為 002 的 `app.googleClients`（`GoogleClientProvider`），每次呼叫前取 `authorizedClient()`；所有請求 `timeout: 15000`。錯誤原樣丟出，由 `WriteBackService.mapGoogleError` 對應。

### `resultsRoutes`（Fastify plugin）

在 002 的 `buildApp` 以 `app.register(resultsRoutes, { writeBack })` 註冊。`POST /api/results/write-back`，`{ preHandler: app.requireTeacher }`；呼叫 `WriteBackService.writeBack()`，成功回 `200` 與 `WriteBackResult`；`WriteBackFailure` 依上表轉換（[contracts/results-api.md](contracts/results-api.md)）。

## 5. 依賴的其他子功能（伺服器端）

| 類別 | 子功能 | 006 用到的部分 |
| --- | --- | --- |
| `ActivityStore` | 004 | `current(): ActivityState \| null`：`phase`、`questions`、`spreadsheet`（`id`、`selectedWorksheet`）、`endedAt: Map<number, number>` |
| `GroupMembership` | 004 | `groupOf(socket: { id: string }): number \| null` |
| `SubmissionStore` | 005 | `list(questionNumber): Submission[]`（依 `rank` 排序）、`winner(questionNumber): Submission \| null` |
| `ImportStore` | 003 | `latest(): Readonly<ImportSuccess> \| null`；`latestMarkers(): BlankMarkers \| null`（`blankCell` → `{ marker, inBlankCell }`，與 `latest()` 同一次讀取；只在伺服器）；以 `app.importStore` 提供 |
| `SpreadsheetReader` | 003 | `load(spreadsheetId): Promise<LoadedSpreadsheet>`（`id`、`title`、`editable`、`sheets: SheetGrid[]`）；錯誤為 `SheetsReadError`（`kind`：`NO_ACCESS`、`UNAVAILABLE`、`AUTH_EXPIRED`），沒有老師登入時丟 002 的 `TeacherNotSignedInError`；以 `app.spreadsheetReader` 提供；不讀寫 `ImportStore` |
| `SheetGrid` | 003 | `sheetId`、`name` |
| `GuidedNotesParser` | 003 | `parse(grid: SheetGrid, spreadsheet: Spreadsheet): ImportSuccess \| ImportError`（沒有狀態，自行 `new`；不碰網路、不讀寫 `ImportStore`；失敗以回傳 `ImportError` 表示，不丟例外） |
| `GoogleClientProvider` | 002 | `authorizedClient()`，經 `app.googleClients`；沒有老師登入時丟 `TeacherNotSignedInError` |
| `isGoogleAuthExpired` | 002 | `(error: unknown) => boolean` |
| `app.requireTeacher` | 002 | Fastify preHandler |
| `app.io` | 002 | Socket.IO 伺服器 |
| `ErrorBody` | 002 | `{ code, message }` |

前端：004 `RealtimeClient.emitWithAck<T>(event, payload)`；002 `ApiClient.request<T>(method, path, body?)`、`ApiError { status, code, message }`。

## 6. 狀態

006 只有一個自己的狀態：`WriteBackService.inProgress`。結果不另外保存，每次查詢都從 004、005 的權威狀態組出（原則 V）；伺服器重啟後結果隨活動一起消失（spec 範圍）。
