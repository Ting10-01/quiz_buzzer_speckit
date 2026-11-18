# Contract: QuestionSet（001 → 002、003 共用）

**Owner**: `001-guided-notes-import` | **Location**: `packages/shared/src/guided-notes.ts`

001 匯入成功後產出 `QuestionSet`，002 用它開題與驗證送出，003 用它的來源與填空格位置把答案直接寫回同一份 Google 試算表。這份契約改動時，三個子功能都要跟著檢查（原則 II），並在 PR 描述中標示。

```ts
export type QuestionKind = 'SINGLE' | 'GROUP';
export type MappingSource = 'AUTO' | 'MANUAL';

export interface GuidedNotesSource {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;   // stable even if the sheet is renamed
  sheetName: string; // name at import time, for display
}

export interface CellRef {
  sheetId: number;
  sheetName: string;
  row: number; // 1-based
  col: number; // 1-based
}

export interface ColumnMapping {
  headerRow: number;
  numberCol: number;
  answerCol: number;
  questionCol: number | null;
  source: MappingSource;
  matchedHeaders: string[];
}

export interface AnswerSlot {
  slotId: string;              // "3" | "1-1"
  label: string;               // "（1）" | "" for SINGLE
  questionText: string | null;
  marker: string | null;       // kept in front of the answer on write-back
  oldAnswer: string | null;
  cell: CellRef;
}

export interface Question {
  number: number;
  kind: QuestionKind;
  slots: AnswerSlot[];
}

export interface QuestionSet {
  source: GuidedNotesSource;
  mapping: ColumnMapping;
  questions: Question[];
}
```

## 不變式（Invariants）

1. `questions` 依 `number` 嚴格遞增；`number` 為正整數，可跳號；1–200 題。
2. `kind === 'SINGLE'` ⇒ `slots.length === 1` 且 `slots[0].slotId === String(number)`。
3. `kind === 'GROUP'` ⇒ `slots.length >= 1`，`slotId` 為 `${number}-${i}`（i 從 1 起算，依列序）。
4. 同一份 `QuestionSet` 中每個 `cell` 都不重複。
5. 每個 `cell.sheetId === source.sheetId`。

## 使用方式

| 使用者 | 讀什麼 | 用途 |
| --- | --- | --- |
| 002 搶答活動 | `questions[].number`、`kind`、`slots[].slotId`、`label`、`questionText` | 依題號逐題開放；驗證題組小題都有填；學生畫面顯示題目 |
| 003 結果與匯出 | `source`、`slots[].cell`、`marker`、`oldAnswer` | 用同一個 Google 授權把答案寫回原試算表的填空格；CSV 檔名 |

002 與 003 不得修改 `QuestionSet`，只能讀取（`QuestionSetStore.current()` 回傳唯讀物件）。
