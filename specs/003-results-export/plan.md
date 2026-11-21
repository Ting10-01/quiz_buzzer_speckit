# Implementation Plan: 搶答結果與匯出

**Branch**: `003-results-export` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-results-export/spec.md`

## Summary

002 每結束一題就通知 `ResultsService`，它把該題的送出與結果寫進本機 JSON 紀錄檔（原子寫入，重開後可還原）。活動結束後，老師與學生的結果頁透過 HTTP 取得依角色過濾的結果。老師按「寫回 Google Sheets」時，`GuidedNotesWriter` 先用 001 的 `SpreadsheetReader` 重新讀取工作表確認版面沒變，再複製一個備份工作表，最後以 Sheets API 一次批次、純文字寫入所有填空格；Google 授權沿用 001。CSV 則以 UTF-8 BOM 下載到本機。

## Technical Context

**Language/Version**: TypeScript 5（`strict`），Node.js 24 LTS

**Primary Dependencies**: `@googleapis/sheets`、`@googleapis/drive`（寫回、複製工作表、確認可編輯）與 001 的 `GoogleAuthService`；Express 5（結果、寫回、下載 API）；React 19 + Vite + Tailwind CSS 4；CSV 自行輸出（research R4）

**Storage**: 本機 JSON 檔 `data/activity-*.json`（research R5、[record-file](./contracts/record-file.md)）；寫回的對象是老師雲端上的原試算表

**Testing**: Vitest（假的 Reader／Writer、HTTP 回應替身、暫存目錄）；React Testing Library；真正寫回 Google 以人工驗證（research R8）

**Target Platform**: 本機單一 Node 程序，需能連上 Google；瀏覽器 Chrome／Edge／Safari 最新版；CSV 以 Excel 與 Google Sheets 開啟

**Project Type**: Web application（npm workspaces monorepo，與 001、002 相同）

**Performance Goals**: 200 題以內，確認寫回後 5 秒內完成（SC-004）；按下匯出 CSV 後 3 秒內開始下載；結果出現在學生畫面 ≤ 1 秒（AC-05，由 002 推送）

**Constraints**: 填空格以外不得改變（REQ-EXP-06）；寫回全有或全無（REQ-EXP-10）；先檢查版面、再備份、最後寫入（REQ-EXP-09、15）；紀錄檔不得含憑證或 Google 授權（原則 VI）；寫檔不得在 002 的臨界區內

**Scale/Scope**: 200 題以內；老師結果頁 1 個（含寫回確認與結果）、學生結果頁 1 個

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查（結果相同）。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I 圖表優先 | `diagrams/003-component/class/sequence` 三張圖與 PNG 已依直接寫回 Google Sheets 重畫；下方「藍圖對照」對應到程式路徑 | ✅ |
| II 規格先行與可追溯 | 先以 specify、clarify 改 spec（助教公告、寫回前備份），再改 plan；每個 REQ-EXP 都有 AC 或 SC；tasks 階段為每個 AC 建立測試任務 | ✅ |
| III 分層與依賴抽象 | `GuidedNotesWriter` 只依賴 `SpreadsheetReader`、`SpreadsheetWriter` 介面；Google 只出現在 `GoogleSheetsWriter`；`CsvExporter` 是純函式；路由只呼叫 `ResultsService` | ✅ |
| IV 外部資料於執行期解析 | 寫入位置只用 001 解析出的 `AnswerSlot.cell`；工作表以 `sheetId` 辨識；寫回前檢查版面，對不上就拒絕而不是猜 | ✅ |
| V 單一權威狀態來源 | 結果只由 002 的 `QuestionResult` 產生，003 不重新判定；紀錄檔是它的持久化副本 | ✅ |
| VI 最小資訊揭露與機敏資料 | 學生結果在伺服器端過濾；寫回與匯出需老師憑證；沿用 001 的 `drive.file` 授權；紀錄檔不含憑證、participantId 或 Google 授權 | ✅ |
| VII 輸入驗證與錯誤訊息 | 寫回前檢查活動狀態、版面、編輯權限；每種失敗都有具體原因與解決方式；失敗時學習單不變；CSV 跳脫與公式前綴 | ✅ |
| VIII 自動化測試與人工驗證 | 版面檢查、備份、寫入內容、錯誤對應、CSV、紀錄檔、權限過濾都有不需網路的測試；quickstart 12 個人工情境含真實寫回 | ✅ |
| IX 程式碼規範 | 結果表格、寫回確認、下載按鈕做成共用元件；頁面只透過 `lib/api.ts`；英文命名 | ✅ |
| X 人工把關 | 本 plan 需人工審查後才能進入 tasks | ⏳ 待審查 |
| XI 簡潔 | 不用資料庫與 CSV 套件；全有或全無靠單一 `batchUpdate`，不自己做回復；唯一新介面 `SpreadsheetWriter` 有正式實作與測試替身 | ✅ |

沒有需要說明的違反項目，所以不需要 Complexity Tracking。

## 藍圖對照（diagrams → 程式）

| 圖上的元件／類別 | 程式位置 | 來源圖 |
| --- | --- | --- |
| TeacherResultsPage | `packages/web/src/pages/teacher/ResultsPage.tsx`（含寫回確認與結果） | component、sequence |
| StudentResultsPage | `packages/web/src/pages/student/ResultsPage.tsx` | component、sequence |
| ResultsService | `packages/server/src/results/ResultsService.ts` | component、class、sequence |
| TeacherResultView、StudentResultView、WinnerRow、RankingRow、WriteBackResult | `packages/shared/src/results.ts` | class；契約見 `contracts/results-http.md` |
| ActivityRecordStore、ActivityRecord、QuestionRecord | `packages/server/src/record/ActivityRecordStore.ts`、`record/types.ts` | component、class；格式見 `contracts/record-file.md` |
| GuidedNotesWriter、CellText、WriteBackError、WriteBackErrorCode | `packages/server/src/writeback/GuidedNotesWriter.ts`、`writeback/types.ts` | component、class、sequence |
| SpreadsheetWriter | `packages/server/src/spreadsheet/types.ts`（與 001 的 Reader 同檔） | class |
| GoogleSheetsWriter | `packages/server/src/spreadsheet/GoogleSheetsWriter.ts` | component、class |
| CsvExporter、CsvRow、ExportFile | `packages/server/src/csv/CsvExporter.ts` | component、class、sequence |
| 結果、寫回、CSV API | `packages/server/src/http/resultsRoutes.ts` | sequence |
| 001 SpreadsheetReader、QuestionSetStore、GoogleAuthService（上游） | 直接引用 001 的實作，不另寫 | component、class、sequence |
| 002 ActivityService、SessionGateway（上游） | `ActivityService` 呼叫 `onActivityCreated`／`onQuestionClosed`／`onActivityEnded`；活動結束的推送沿用 002 的 view | component、sequence |

## Project Structure

### Documentation (this feature)

```text
specs/003-results-export/
├── spec.md
├── plan.md               # 本文件
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── results-http.md   # 結果、寫回、CSV API
│   └── record-file.md    # 本機紀錄檔格式
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks 產生
```

### Source Code (repository root)

```text
data/                          # 執行期產生，.gitignore
packages/
├── shared/src/results.ts      # 003
├── server/
│   ├── src/
│   │   ├── results/ResultsService.ts
│   │   ├── record/{ActivityRecordStore,types}.ts
│   │   ├── writeback/{GuidedNotesWriter,types}.ts
│   │   ├── csv/CsvExporter.ts
│   │   ├── spreadsheet/GoogleSheetsWriter.ts   # Writer 介面加在 001 的 spreadsheet/types.ts
│   │   └── http/resultsRoutes.ts
│   └── tests/
│       ├── unit/writeback/    # 版面檢查、備份名稱、composeCellText、失敗不寫入
│       ├── unit/spreadsheet/  # GoogleSheetsWriter：RAW、範圍跳脫、錯誤對應
│       ├── unit/csv/          # 跳脫、公式前綴、排序
│       └── unit/record/       # 原子寫入、中斷還原、壞檔略過
└── web/src/pages/
    ├── teacher/ResultsPage.tsx
    └── student/ResultsPage.tsx
```

**Structure Decision**: 沿用同一個 monorepo。`spreadsheet/` 同時放 001 的 Reader 與 003 的 Writer，讓對 Google Sheets 的依賴集中在一處；`writeback/`、`csv/`、`record/` 分開，紀錄檔格式改變不影響寫回與 CSV。

## Complexity Tracking

無。
