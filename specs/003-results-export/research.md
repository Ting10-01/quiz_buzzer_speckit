# Research: 搶答結果與匯出

**Feature**: `003-results-export` | **Date**: 2026-11-18 | **Plan**: [plan.md](./plan.md)

技術棧沿用 001、002（TypeScript、Node.js 24 LTS、Express、React、Vitest）。連線 Google 的授權、讀取與錯誤對應沿用 001（[research R2–R4](../001-guided-notes-import/research.md)）。本文件處理 003 特有的問題：直接寫回雲端試算表、寫回前備份、CSV 相容性、本機紀錄與重開還原。

## R1. 寫回 Google Sheets（REQ-EXP-04～10）

- **Decision**: `GoogleSheetsWriter` 用 `@googleapis/sheets`，沿用 001 的 `GoogleAuthService.authorizedClient()`（範圍 `drive.file`，老師挑選過的檔案可讀寫）：
  - `writeTexts`：一次 `spreadsheets.values.batchUpdate`，`valueInputOption: 'RAW'`，每個填空格一個 `ValueRange`（A1 表示法，工作表名稱由 `sheetId` 在寫入當下查出，加單引號跳脫）。`RAW` 讓「=1+1」存成文字，不會被當成公式（AC-11）。
  - 一個 `batchUpdate` 由 Google 整批套用，失敗時不會只寫入一部分；寫入的內容只由搶答結果決定，所以重試的結果與寫一次相同（AC-15）。
  - 寫入前用 Drive `files.get`（`capabilities/canEdit`）確認可編輯，否則回 `NO_EDIT_PERMISSION`。
- **Rationale**: `RAW` 與單一批次直接滿足「純文字」「全有或全無」兩個需求，不需要自己實作回復機制。只寫填空格的值，不動格式與合併範圍（REQ-EXP-06）。
- **Alternatives considered**: `USER_ENTERED`（會把 = 開頭當公式）；每格一個請求（慢，而且中途失敗會留下寫一半的工作表）；Apps Script（要另外部署）。

## R2. 寫回前的版面檢查（REQ-EXP-09、AC-12）

- **Decision**: `verifyLayout` 用 001 的 `SpreadsheetReader.open()` 重新讀取同一個工作表（依 `sheetId`，改名也找得到），逐題檢查：
  1. 匯入時該題第一個填空格所在的列，題號欄仍是同一個題號；
  2. 題組的題號儲存格合併範圍列數與匯入時相同。

  任一題不符就丟出 `LAYOUT_CHANGED`（附題號），不建立備份、不寫入。工作表或試算表已刪除 → `SHEET_NOT_FOUND`。
- **Rationale**: 插入或刪除列是最常見會讓位置錯開的改動，題號與合併範圍是 001 判斷位置的依據，檢查它們就能確定填空格還在原位，不用寫死任何位置（原則 IV）。
- **Alternatives considered**: 寫回前重新跑一次 001 的完整解析並比對（更嚴格，但老師只改了題目敘述也會被擋）；不檢查（可能把答案寫進錯的格子）。

## R3. 寫回前的備份工作表（REQ-EXP-15，2026-11-18 釐清）

- **Decision**: 版面檢查通過後，用 `spreadsheets.batchUpdate` 的 `duplicateSheet` 請求複製學習單工作表，`newSheetName` 為「原工作表名-備份-YYYYMMDD-HHmm」（本地時間），名稱已存在時加上「-2」「-3」。複製失敗（含沒有編輯權限）就不寫入，回 `BACKUP_FAILED` 或 `NO_EDIT_PERMISSION`。
- **Rationale**: `duplicateSheet` 會連同格式與合併範圍一起複製，備份與寫回前完全相同（SC-008）；放在同一份試算表，`drive.file` 範圍就夠，不需要建立新檔案。
- **Alternatives considered**: 複製整份試算表（需要建立新檔案，老師的雲端硬碟會多出檔案）；把寫回前的值存在本機（老師在 Google 那邊看不到）。

## R4. CSV 格式（REQ-EXP-11、AC-17、AC-19）

- **Decision**: UTF-8 加 BOM（`﻿`），換行 CRLF，欄位依 RFC 4180：含逗號、雙引號、換行時整欄加雙引號，內部雙引號重複一次。以 `=`、`+`、`-`、`@` 開頭的答案前面加 `'`。送出時間以伺服器本地時間 `YYYY-MM-DD HH:mm:ss.SSS` 輸出；是否成功輸出「是」／「否」。標題列為 `題號,小題,組別,答案,搶答順位,送出時間,是否成功`。檔名為「試算表名稱-搶答結果.csv」。
- **Rationale**: Excel 沒有 BOM 時會把 UTF-8 當成 Big5 而出現亂碼；自己寫約 20 行，不需要 CSV 套件。
- **Alternatives considered**: `csv-stringify` 套件（功能多於所需）。

## R5. 本機活動紀錄檔（REQ-EXP-14、SC-006）

- **Decision**: 每輪活動一個 JSON 檔：`<DATA_DIR>/activity-<startedAt>-<activityId>.json`，`DATA_DIR` 預設為專案根目錄的 `data/`（列入 `.gitignore`）。建立活動時寫入第一版（含 `QuestionSet`，其中有學習單來源與填空格位置），之後每題結束、活動結束、寫回、匯出 CSV 時更新。寫檔一律「寫到暫存檔 → `rename` 取代」；所有寫入串成一條 Promise 鏈，依呼叫順序完成。紀錄檔不含任何 Google 授權資料。
- **Rationale**: 檔案小，每次重寫整份最簡單；`rename` 在同一個磁碟上是原子操作。寫檔在 002 的 `CommandQueue` 處理完之後才排程，不影響搶答延遲。不再保存原始檔案：寫回的對象就是雲端上的原試算表。
- **Alternatives considered**: SQLite（需要原生套件）；只追加的 JSON Lines（還原時要重播）。

## R6. 重開後還原（AC-16）

- **Decision**: 伺服器啟動時 `ActivityRecordStore.loadLatest()` 讀取 `startedAt` 最新的紀錄檔。還原的那一輪只能檢視、寫回與匯出：`ended = false` 時視為中斷，已結束的題目照常處理，中斷時開放中的那一題記為未完成（寫回時不改動該題、不出現在 CSV）。還原時把 `QuestionSet` 放回 001 的 `QuestionSetStore`；Google 授權由 001 從本機憑證檔載入，不需要重新登入。
- **Rationale**: 符合 spec「系統重開後可以檢視、寫回並匯出最近一輪的結果」，不需要支援從中斷處繼續搶答。

## R7. 結果的權限（REQ-EXP-03、12）

- **Decision**: 老師結果、寫回與 CSV 需要老師憑證（`Authorization: Bearer`）。學生結果以 `X-Participant-Id` 識別組別：活動未結束時只回已結束題目的 `winners`，`rankings` 一律為空陣列；結束後才填入所有組別的答案與順位。過濾在 `ResultsService.studentResults()` 執行。
- **Rationale**: 隔離在伺服器端做（原則 VI），前端拿不到不該看的資料。

## R8. 測試策略

- **Decision**: `GuidedNotesWriter` 用假的 `SpreadsheetReader`、`SpreadsheetWriter` 測：版面檢查、備份名稱、`composeCellText`、失敗時不呼叫 `writeTexts`；`GoogleSheetsWriter` 用假的 HTTP 回應測 `RAW`、A1 範圍跳脫與錯誤對應；`CsvExporter` 是純函式；紀錄檔用暫存目錄測原子寫入與還原。真正寫回 Google 只做人工驗證（quickstart）。
- **Rationale**: 自動化測試不需網路與憑證（原則 VIII），連線部分由人工驗證補足。
