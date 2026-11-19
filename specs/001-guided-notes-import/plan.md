# Implementation Plan: Guided Notes 匯入

**Branch**: `001-guided-notes-import` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-guided-notes-import/spec.md`

## Summary

老師先以自己的 Google 帳號登入授權（範圍只限挑選過的檔案），再用 Google 檔案選擇器挑選雲端上的學習單。系統以 Sheets API 讀取該工作表的儲存格與合併範圍，在執行期依同義詞清單找出表頭列與題號、作答、題目三欄（找不到時拒絕匯入並列出可用的表頭寫法），再依題號儲存格的合併範圍分出單題與題組，產出 `QuestionSet`（題號、小題、題目敘述、填空格位置與來源試算表）。預覽確認後保存，供 002 開題、003 直接寫回同一份試算表。Google 的部分包在 `SpreadsheetReader` 介面與 `GoogleAuthService` 後面，解析邏輯是不碰網路的純函式，用 Vitest 測試。

## Technical Context

**Language/Version**: TypeScript 5（`strict`），Node.js 24 LTS

**Primary Dependencies**: Express 5（HTTP）、`google-auth-library`（OAuth）、`@googleapis/sheets`、`@googleapis/drive`（讀取試算表、判斷可否編輯）、Google Picker（瀏覽器端，`apis.google.com/js/api.js`）、React 19 + Vite + Tailwind CSS 4

**Storage**: 題目清單在記憶體（`QuestionSetStore`）；老師的 Google 授權在 `credentials/google-token.json`（不進版控）；活動紀錄由 003 負責

**Testing**: Vitest（單元、轉換、授權服務）；React Testing Library（前端元件）；連線 Google 的流程以人工驗證（research R10）

**Target Platform**: 本機 macOS／Windows，單一 Node 程序，需能連上 Google；瀏覽器 Chrome／Edge／Safari 最新版

**Project Type**: Web application（npm workspaces monorepo：`packages/shared`、`packages/server`、`packages/web`）

**Performance Goals**: 200 題以內，從挑選完成到看到預覽 ≤ 5 秒（SC-004）；Google 請求逾時 15 秒（AC-14）

**Constraints**: 憑證只放在 `.env` 與 `credentials/`，不得進入 repo、文件或 log（原則 VI、SC-006）；授權範圍只有 `drive.file`；不得寫死任何儲存格位置（原則 IV）；匯入只讀不寫

**Scale/Scope**: 一次一份學習單、一位老師；1 個頁面（匯入，含連結帳號、挑選與選工作表、預覽三種狀態）；只有老師身分能進入

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查（結果相同）。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I 圖表優先 | `diagrams/001-component/class/sequence` 三張圖與 PNG 已依 Google Sheets 版本重畫；下方「藍圖對照」把每個元件與類別對應到程式路徑 | ✅ |
| II 規格先行與可追溯 | 先以 specify、clarify 改 spec（助教公告、授權方式、檔案選擇器），再改 plan；每個 REQ-IMP 都有 AC；tasks 階段會為每個 AC 建立測試任務 | ✅ |
| III 分層與依賴抽象 | 解析器只依賴 `Sheet` 介面；Google 只出現在 `GoogleSheetsReader`、`GoogleAuthService`；HTTP 路由只呼叫服務；`TokenStore` 介面讓授權服務可用假物件測試 | ✅ |
| IV 外部資料於執行期解析 | 表頭以同義詞清單在執行期辨識；位置一律來自解析結果；找不到時拒絕匯入並說明可用寫法，不猜測欄位 | ✅ |
| V 單一權威狀態來源 | 題目清單只存在伺服器的 `QuestionSetStore`；前端只顯示 API 回傳的預覽 | ✅ |
| VI 最小資訊揭露與機敏資料 | 用戶端設定只在環境變數；老師授權只在本機憑證檔；範圍只有 `drive.file`；`picker-session` 只回給老師；token 不寫入 log；學生端與 Google 無關 | ✅ |
| VII 輸入驗證與錯誤訊息 | 驗證老師身分、`spreadsheetId`、工作表、表頭、題號；Google 錯誤轉成具體原因與修正方式；失敗不改動既有狀態 | ✅ |
| VIII 自動化測試與人工驗證 | 自動化測試不需網路（假 `Sheet`、API 回應 fixture、假 `OAuth2Client`）；quickstart 列出 17 個人工情境，含真實連線 | ✅ |
| IX 程式碼規範 | 預覽表格、警告、錯誤卡片、帳號狀態做成共用元件；頁面只透過 `lib/api.ts`；命名與註解用英文 | ✅ |
| X 人工把關 | 本 plan 需人工審查後才能進入 tasks | ⏳ 待審查 |
| XI 簡潔 | 用官方拆分套件而非完整 `googleapis`；兩個介面（`SpreadsheetReader`、`TokenStore`）各有正式實作與測試替身，都是為了原則 III 與測試 | ✅ |

沒有需要說明的違反項目，所以不需要 Complexity Tracking。

## 藍圖對照（diagrams → 程式）

plan 以三張圖為主要藍圖（原則 I）。實作完成後的圖表一致性驗證，以這張表為檢查清單。

| 圖上的元件／類別 | 程式位置 | 來源圖 |
| --- | --- | --- |
| ImportPage | `packages/web/src/pages/teacher/ImportPage.tsx`（連結帳號、挑選、選工作表、預覽、錯誤） | component、sequence |
| Google 檔案選擇器 | `packages/web/src/lib/googlePicker.ts`（載入 Google 腳本並開啟選擇器） | component、sequence |
| GoogleAuthService、AuthState、AuthStatus、LinkedAccount、PickerSession | `packages/server/src/google/GoogleAuthService.ts` | component、class、sequence |
| TokenStore、LocalTokenStore、StoredToken | `packages/server/src/google/TokenStore.ts` | component、class |
| ImportService、PendingImport | `packages/server/src/import/ImportService.ts` | component、class、sequence |
| GuidedNotesParser | `packages/server/src/import/GuidedNotesParser.ts` | class、sequence |
| HeaderLocator | `packages/server/src/import/HeaderLocator.ts` | class、sequence |
| QuestionScanner、ScanResult、MarkerSplit | `packages/server/src/import/QuestionScanner.ts` | class、sequence |
| SpreadsheetInfo、SheetInfo、ImportPreview、ImportWarning、ImportError（含 codes） | `packages/server/src/import/types.ts` | class |
| QuestionSet、GuidedNotesSource、Question、AnswerSlot、CellRef、ColumnMapping | `packages/shared/src/guided-notes.ts` | class；契約見 `contracts/question-set.md` |
| QuestionSetStore、QuestionSetProvider | `packages/server/src/store/QuestionSetStore.ts`（唯讀方法 `current()` 即 provider） | component、class |
| SpreadsheetReader、Sheet、RowRange | `packages/server/src/spreadsheet/types.ts` | class |
| GoogleSheetsReader | `packages/server/src/spreadsheet/GoogleSheetsReader.ts` | component、class |
| 匯入 API | `packages/server/src/http/importRoutes.ts`；契約見 `contracts/import-http.md` | sequence |
| Google 授權 API | `packages/server/src/http/googleRoutes.ts`；契約見 `contracts/google-auth-http.md` | sequence |

## Project Structure

### Documentation (this feature)

```text
specs/001-guided-notes-import/
├── spec.md
├── plan.md                  # 本文件
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── question-set.md      # 001 → 002、003 的共用資料契約
│   ├── import-http.md       # 匯入 API
│   └── google-auth-http.md  # Google 授權 API 與環境變數
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks 產生
```

### Source Code (repository root)

三個子功能共用同一個 monorepo；標 `001` 的是本功能負責的部分，其餘由 002、003 的 plan 定義。

```text
.env.example                     # 只列變數名稱（GOOGLE_CLIENT_ID 等），不含值
credentials/                     # 執行期產生 google-token.json，已在 .gitignore
packages/
├── shared/src/
│   └── guided-notes.ts          # 001：QuestionSet 等共用型別
├── server/
│   ├── src/
│   │   ├── google/              # 001（003 寫回時沿用）
│   │   │   ├── GoogleAuthService.ts
│   │   │   └── TokenStore.ts
│   │   ├── spreadsheet/         # 001（003 會加上 Writer）
│   │   │   ├── types.ts
│   │   │   └── GoogleSheetsReader.ts
│   │   ├── import/              # 001
│   │   │   ├── ImportService.ts
│   │   │   ├── GuidedNotesParser.ts
│   │   │   ├── HeaderLocator.ts
│   │   │   ├── QuestionScanner.ts
│   │   │   └── types.ts
│   │   ├── store/QuestionSetStore.ts
│   │   └── http/{importRoutes,googleRoutes}.ts
│   └── tests/
│       ├── fixtures/sheets/     # 兩份範本與變形學習單的 spreadsheets.get 回應（JSON）
│       ├── unit/import/         # 以假 Sheet 測解析規則
│       ├── unit/google/         # 授權服務：state、存檔、解除連結、log 不含 token
│       └── unit/spreadsheet/    # GoogleSheet 轉換：合併範圍、數字題號
└── web/src/
    ├── pages/teacher/ImportPage.tsx
    ├── components/              # SheetPreview、WarningCard、GoogleAccountBadge…
    └── lib/{api,googlePicker}.ts
```

### 共用骨架（三個子功能共用，兩人一起建立）

tasks.md 的 Phase 1、2 建立下列檔案；之後依 `docs/work-split.md` 的檔案歸屬修改，改動前先告知對方。

```text
package.json、tsconfig.base.json、.env.example、.gitignore
packages/
├── shared/
│   ├── src/index.ts                      # 只匯出型別
│   ├── src/{activity,socket-events,results}.ts   # 002、003 的共用型別（依各自 data-model）
│   └── fixtures/                         # 範例 QuestionSet 與已結束活動的結果
├── server/src/
│   ├── index.ts                          # 建立 Express 與 Socket.IO，掛上所有路由與 gateway
│   ├── http/{errors,requireTeacher}.ts   # 統一錯誤格式；老師憑證驗證（由 002 換成正式版）
│   └── results/ResultsService.ts         # 空實作，由 003 換成正式版
└── web/src/
    ├── main.tsx、App.tsx                 # 路由列出所有頁面
    ├── styles/tokens.css                 # 由 docs/design 的色彩變數而來
    └── pages/HomePage.tsx                # 設計稿 00：選擇身分
```

**Structure Decision**: 採 npm workspaces 的 web application 結構。`shared` 放三個子功能共用的型別，`server` 是唯一的權威來源（原則 V），`web` 只負責顯示與送出操作。所有和 Google 有關的程式集中在 `server/src/google`、`server/src/spreadsheet` 與 `web/src/lib/googlePicker.ts`，解析邏輯在 `server/src/import`，不依賴 Google。

## Complexity Tracking

無。
