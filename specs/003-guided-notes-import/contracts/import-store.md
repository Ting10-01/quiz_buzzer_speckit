# Contract: ImportStore 與讀取工具（003 → 004、006）

**Owner**: `003-guided-notes-import` | **Location**: `server/src/guided-notes/`

伺服器記住最近一次成功讀取的學習單。001 的確認辨識結果頁「確認匯入，下一步」沒有介面呼叫，所以「老師確認的那一份」就是最近一次 `readWorksheet` 成功的結果（REQ-IMP-15）。

## 取得方式

002 的 `buildApp(config, deps)` 建立**一個** `ImportStore` 與**一個** `GoogleSheetsReader(app.googleClients)`（測試時可由 `deps.spreadsheetReader` 注入替身），以 `app.decorate` 提供：

| 名稱 | 型別 | 使用者 |
| --- | --- | --- |
| `app.importStore` | `ImportStore` | 003（寫入）、004、006（只讀） |
| `app.spreadsheetReader` | `SpreadsheetReader` | 003、006 |

`GuidedNotesParser` 沒有狀態，使用者自行 `new GuidedNotesParser()`。

## ImportStore

```ts
// server/src/guided-notes/ImportStore.ts
/** The sub-question marker of a blank cell ("（1）", "(2)" or ""); inBlankCell is false when it is in the cell on the left (REQ-IMP-10). */
export interface BlankMarker { marker: string; inBlankCell: boolean }
/** blankCell (A1, e.g. "H5") -> its marker. */
export type BlankMarkers = Readonly<Record<string, BlankMarker>>;

export class ImportStore {
  // Only GuidedNotesImporter.read() calls this; result and markers are replaced together.
  save(result: ImportSuccess, markers: BlankMarkers): void;
  latest(): Readonly<ImportSuccess> | null;   // null until the first successful read
  latestMarkers(): BlankMarkers | null;       // markers of the same read as latest(); null when latest() is null
}
```

### 保證（Invariants）

1. 只有 `readWorksheet` 成功（`GuidedNotesImporter.read()` 回傳 `ImportSuccess`）時內容才改變；任何錯誤、取消、`describe` 都不改變（D2、D3）。
2. `questions` 有 1～200 題，`number` 嚴格遞增、可跳號。
3. `type === 'SINGLE'` ⇒ `subQuestions.length === 1`；`type === 'GROUP'` ⇒ `subQuestions.length >= 1`；`index` 從 1 連號。
4. 每個 `blankCell` 是 A1 表示法，在同一份結果中不重複，都位於 `spreadsheet.selectedWorksheet`。
5. `latestMarkers()` 與 `latest()` 來自同一次讀取：`latest()` 中每個 `blankCell` 在 `latestMarkers()` 都恰好有一筆，值的 `marker` 是填空格開頭原有的小題標記（原樣保留全形、半形寫法）或 `""`，`inBlankCell` 為 true；填空格是標記右邊的格子（REQ-IMP-10）時，`marker` 是左邊標記格的標記，`inBlankCell` 為 false。沒有其他鍵。標記只存在伺服器，不在 001 的 `SubQuestion` 中，也不回傳給前端。
6. 只存在記憶體；伺服器重新啟動後 `latest()` 為 `null`。
7. 004、006 不得修改 `latest()` 回傳的物件，也不得呼叫 `save()`。

## 給 006 的讀取工具（寫回前的版面檢查）

006 寫回前要確認填空格位置與匯入時一致。做法：以下面兩個方法重新讀取、解析同一個工作表，比對每個 `blankCell`。**這兩個方法都不讀寫 `ImportStore`**；只有 `GuidedNotesImporter.read()` 會呼叫 `ImportStore.save()`，006 不經過 `GuidedNotesImporter`。

```ts
// server/src/guided-notes/SpreadsheetReader.ts
export interface SpreadsheetReader {
  // Reads every worksheet (cells + merges) and the edit capability. Read-only.
  load(spreadsheetId: string): Promise<LoadedSpreadsheet>;
}
export interface LoadedSpreadsheet {
  id: string;
  title: string;
  editable: boolean;
  sheets: SheetGrid[];        // sheet order; SheetGrid.name, SheetGrid.sheetId
}
export class SheetsReadError extends Error {
  kind: 'NO_ACCESS' | 'UNAVAILABLE' | 'AUTH_EXPIRED';
}

// server/src/guided-notes/GuidedNotesParser.ts
export class GuidedNotesParser {
  // Pure function of the grid; `spreadsheet` is only copied into the result.
  parse(grid: SheetGrid, spreadsheet: Spreadsheet): ImportSuccess | ImportError;
}
```

| 方法 | 失敗時 | 006 的用法 |
| --- | --- | --- |
| `app.spreadsheetReader.load(latest.spreadsheet.id)` | 丟 `SheetsReadError`（403／404 → `NO_ACCESS`；逾時 15 秒、網路、5xx → `UNAVAILABLE`；`isGoogleAuthExpired` → `AUTH_EXPIRED`）；沒有老師登入時丟 002 的 `TeacherNotSignedInError` | 以 `sheets.find(s => s.name === latest.spreadsheet.selectedWorksheet)` 取得工作表；找不到視為版面不一致；`SheetGrid.sheetId` 可用於複製備份工作表 |
| `new GuidedNotesParser().parse(grid, latest.spreadsheet)` | 回傳 `ImportError`（不丟例外） | 回傳 `ImportError`，或任何題目的 `blankCell` 與 `latest()` 不同，就視為版面不一致 |

## 使用方式

| 使用者 | 讀什麼 | 用途 |
| --- | --- | --- |
| 004 建立活動 | `app.importStore.latest()` 的 `spreadsheet`、`questions`（不需要標記） | 活動的題目與題數；`latest()` 為 `null` 時建立活動應回驗證錯誤（由 004 定義） |
| 006 寫回 | `app.importStore.latest()` 的 `spreadsheet.id`、`spreadsheet.selectedWorksheet`、`questions[].subQuestions[].blankCell`；`app.importStore.latestMarkers()[blankCell]`；`app.spreadsheetReader.load()`、`GuidedNotesParser.parse()` | 版面檢查後寫入原填空格：`inBlankCell` 為 true 時「`marker` ＋答案」，false 時只寫答案；寫回預覽顯示不含標記的答案（006 定義） |
