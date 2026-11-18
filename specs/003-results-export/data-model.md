# Data Model: 搶答結果與匯出

**Feature**: `003-results-export` | **Date**: 2026-11-18 | **Blueprint**: [`diagrams/003-class.puml`](../../diagrams/003-class.puml)

名稱與欄位與類別圖一一對應。`QuestionSet`、`AnswerSlot`、`CellRef`、`SheetInfo`、`Sheet`、`SpreadsheetReader`、`QuestionSetStore`、`GoogleAuthService` 來自 001；`Activity`、`QuestionResult`、`Submission`、`Group`、`Phase`、`CloseReason` 來自 002（[data-model](../002-buzzer-session/data-model.md)）。標示「共用」的型別放在 `packages/shared/src/results.ts`。

## 結果檢視（共用）

### TeacherResultView

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `questions` | QuestionResult[] | 依題號排序；每題 `ranking` 依順位排序 |
| `winsByGroup` | Record<groupId, number> | 各組搶答成功題數；沒有成功的組別為 0 |
| `writtenBack` | boolean | 這一輪是否已寫回 Google Sheets |
| `csvExported` | boolean | 這一輪是否已匯出 CSV |
| `restored` | boolean | 是否為重開後從紀錄檔還原的結果（R6） |

### StudentResultView

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `phase` | Phase | |
| `ownGroupId` | string | |
| `winners` | WinnerRow[] | 已結束的題目才有 |
| `rankings` | RankingRow[] | `phase !== ENDED` 時一律為空陣列（REQ-EXP-03） |

### WinnerRow

`questionNumber`、`winnerGroupName: string | null`（`null` 表示無人搶答）、`answers: Record<slotId, string>`。

### RankingRow

`questionNumber`、`groupName`、`answers`、`rank`（該題內的順位，從 1 開始）、`isWinner`、`isOwnGroup`。

## 寫回（packages/server/src/writeback）

### GuidedNotesWriter

`writeBack(questionSet, results): WriteBackResult`；私有 `verifyLayout(sheet, questionSet)`、`composeCellText(slot, answer)`、`backupName(sheetName, now)`。

### composeCellText(slot, answer)

| 該題情況 | 填空格內容 |
| --- | --- |
| 有成功組別，slot 有標記 | `marker + answer`，例如「（1）CPU」 |
| 有成功組別，slot 無標記 | `answer` |
| 無人搶答（含活動結束時尚未開放的題目） | `marker`；沒有標記則為空字串（清掉舊答案） |
| 還原的那一輪中斷時未完成的題目 | 不寫入，保留試算表原內容 |

### CellText

`cell: CellRef`、`text: string`。

### WriteBackResult（共用）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `writtenCount` | number | 寫入答案的填空格數 |
| `clearedCount` | number | 清成只剩標記或空白的填空格數 |
| `backupSheetName` | string | 備份工作表名稱 |
| `spreadsheetUrl` | string | 開啟試算表的連結 |

### WriteBackError

`code: WriteBackErrorCode`、`message`（給老師看的原因與解決方式）、`questionNumber: number | null`（`LAYOUT_CHANGED` 時必有）。

| WriteBackErrorCode | 何時發生 | 對應 |
| --- | --- | --- |
| `ACTIVITY_NOT_ENDED` | 活動尚未結束 | AC-10 |
| `LAYOUT_CHANGED` | 有題號不在匯入時的位置 | AC-12 |
| `NOT_LINKED` / `AUTH_EXPIRED` | 沒有連結 Google 帳號或授權已失效 | AC-14 |
| `NO_EDIT_PERMISSION` | 目前帳號只能檢視 | AC-14 |
| `SHEET_NOT_FOUND` | 工作表或試算表已刪除 | Edge Cases |
| `BACKUP_FAILED` | 無法建立備份工作表 | REQ-EXP-15 |
| `NETWORK_ERROR` | 15 秒內連不上 Google | AC-15 |

### SpreadsheetWriter（介面）

`duplicateSheet(spreadsheetId, sheetId, newName): SheetInfo`、`writeTexts(spreadsheetId, cells: CellText[]): void`。實作：`GoogleSheetsWriter`（R1、R3）、測試用假物件。

## 活動紀錄（packages/server/src/record）

### ActivityRecord

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `activityId` | string | 與 002 的 `Activity.id` 相同 |
| `questionSet` | QuestionSet | 含學習單來源（試算表 ID、工作表 ID）與填空格位置 |
| `groups` | Group[] | |
| `startedAt` | string（ISO 8601） | |
| `ended` | boolean | `false` 且已載入 → 視為中斷 |
| `writtenBack` | boolean | 寫回成功過後為 `true` |
| `csvExported` | boolean | 匯出過 CSV 後為 `true` |
| `questions` | QuestionRecord[] | 依題號；只放已結束的題目 |

`writtenBack` 與 `csvExported` 都是 `false` 時，002 建立新活動前會提醒（REQ-BUZ-20）。

### QuestionRecord

`questionNumber`、`openedAt`、`closedAt`、`closeReason: CloseReason`、`submissions: Submission[]`（依 `seq`）、`result: QuestionResult`。

### ActivityRecordStore

`create`、`appendQuestion`、`markEnded`、`markWrittenBack`、`markCsvExported`、`loadLatest`。原子寫入、依序完成（R5）。檔案格式見 [contracts/record-file.md](./contracts/record-file.md)。

## CSV（packages/server/src/csv）

### CsvRow

| 欄位 | CSV 標題 | 規則 |
| --- | --- | --- |
| `questionNumber` | 題號 | |
| `slotLabel` | 小題 | 單題為空白；題組為 `（1）` 等標記 |
| `groupName` | 組別 | |
| `answer` | 答案 | 以 `=`、`+`、`-`、`@` 開頭時加前置 `'` |
| `rank` | 搶答順位 | 該題內的順位 |
| `receivedAt` | 送出時間 | 本地時間 `YYYY-MM-DD HH:mm:ss.SSS` |
| `isWinner` | 是否成功 | 「是」／「否」 |

一筆題組送出有幾個小題就產生幾列；排序為題號 → 順位 → 小題順序。

### ExportFile

`fileName`（「試算表名稱-搶答結果.csv」）、`contentType`（`text/csv; charset=utf-8`）、`bytes`。

## 服務

| 類別 | 主要成員 | 說明 |
| --- | --- | --- |
| `ResultsService` | `onActivityCreated`、`onQuestionClosed`、`onActivityEnded`、`teacherResults`、`studentResults(groupId)`、`writeBack`、`exportCsv`、`restoreLatest` | 002 呼叫前三個；HTTP 呼叫其餘 |
| `CsvExporter` | `export(questionSet, results): string` | 純函式 |

## 驗證規則摘要

| 規則 | 來源 |
| --- | --- |
| 寫回與 CSV 只在 `phase = ENDED` 或還原的紀錄上執行 | AC-10 |
| 只有老師憑證能寫回、匯出與取得老師結果 | REQ-EXP-12 |
| 學生結果在活動結束前不含 `rankings` | REQ-EXP-03、AC-04 |
| 寫入位置只來自 `AnswerSlot.cell`；寫入前通過版面檢查 | REQ-EXP-06、09 |
| 先備份、再寫入；任一步失敗，學習單工作表不變 | REQ-EXP-10、15 |
