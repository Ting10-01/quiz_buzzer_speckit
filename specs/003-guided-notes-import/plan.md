# Implementation Plan: 匯入學習單

**Branch**: `003-guided-notes-import` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-guided-notes-import/spec.md`

## Summary

003 新增 001 `GuidedNotesService` 的真正實作 `HttpGuidedNotesService`，並在 `createServiceRegistry()` 換掉 `MockGuidedNotesService`；001 的頁面不改。

- `pickSpreadsheet()`：`GooglePickerLauncher` 以 002 的 picker token 開啟 Google Picker（只顯示 Google 試算表）；挑選後呼叫伺服器 `GET /api/guided-notes/spreadsheets/:id` 取得 `Spreadsheet`；關閉選擇器回傳 `null`（D3）。
- `readWorksheet()`：呼叫伺服器 `POST /api/guided-notes/read`。伺服器以 002 的 Google 授權，用 Sheets API `spreadsheets.get`（`includeGridData`）讀取儲存格與合併範圍，以 `HeaderLocator`（同義詞表頭）、`QuestionScanner`（題號、題組、填空格、標記、敘述）、`GuidedNotesParser`（題號規則、上限）在執行期解析，回傳 `ImportSuccess` 或 `ImportError`。成功時存入 `ImportStore`，失敗時不變（D2）。
- `ImportStore.latest()` 提供給 004、006。

**以三張圖為藍圖**：本計畫的組件、類別、方法與呼叫順序一律依 [`diagrams/003-component.puml`](../../diagrams/003-component.puml)、[`diagrams/003-class.puml`](../../diagrams/003-class.puml)、[`diagrams/003-sequence.puml`](../../diagrams/003-sequence.puml)。下方「藍圖對照」把圖上每個組件與類別對應到檔案；[data-model.md](data-model.md) 與類別圖一一對應；實作後的圖表一致性驗證以這張表為檢查清單。

## Technical Context

**Language/Version**: TypeScript 5（strict），Node.js 24 LTS（沿用 001 RD-01、RD-02）

**Primary Dependencies**: 伺服器：Fastify（002 建立）、`@googleapis/sheets`、`@googleapis/drive`（003 新增）、002 的 `app.googleClients`；前端：002 的 `ApiClient`；前端：React + Vite（001）、Google Picker（瀏覽器端載入 `https://apis.google.com/js/api.js`，不加 npm 套件）

**Storage**: `ImportStore` 在伺服器記憶體；學習單本身在老師的 Google 試算表（沿用 001 RD-05）

**Testing**: Vitest（伺服器單元與 Fastify `inject()`；前端單元）；Google API 以 `vi.mock` 與假物件取代；真實連線依 quickstart 人工驗證（沿用 001 RD-08）

**Target Platform**: 本機 Chrome；伺服器在本機，需能連上 Google

**Project Type**: Web 應用（npm workspaces：`frontend/`、`shared/`、`server/`）

**Performance Goals**: 200 題以內，從挑選完成到看到辨識結果 ≤ 5 秒（SC-004）

**Constraints**: 伺服器對 Google 的請求逾時 15 秒（SC-006）；不得寫死任何儲存格位置（原則 IV）；匯入只讀不寫（REQ-IMP-17）；不讀取或修改 `.env`、`credentials/`；token 不進 log（原則 VI）

**Scale/Scope**: 一位老師、一次一份學習單、最多 200 題；2 支伺服器 API；前端 2 個新類別；不新增頁面

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計後重新檢查，結果相同。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 003 三張圖與 PNG 都存在；本計畫以它們為藍圖（「藍圖對照」）；data-model 與類別圖一致 | 通過 |
| II. 規格先行與可追溯性 | 計畫沒有 spec 以外的行為；每條 REQ-IMP 都有 AC，tasks 會有需求追溯表 | 通過 |
| III. 分層架構與依賴抽象 | 頁面 → `GuidedNotesService` ← `HttpGuidedNotesService`；只改 `createServiceRegistry()` 的綁定，不改 001 的頁面與介面。伺服器：路由 → `GuidedNotesImporter` → `SpreadsheetReader`（介面）← `GoogleSheetsReader`；解析不依賴 Google | 通過 |
| IV. 外部資料於執行期解析 | 表頭、題號、題組、填空格位置都在執行期依 research R3、R4 的規則解析；無法解析時回 `ImportError`，不猜測 | 通過 |
| V. 單一權威狀態來源 | 匯入結果只存在伺服器的 `ImportStore`；004、006 只讀取 | 通過 |
| VI. 最小資訊揭露與機敏資料保護 | 003 的 API 只接受老師（`app.requireTeacher`，並列入 002 的老師專用路由清單測試）；前端經 `ApiClient` 帶憑證，不自行處理憑證；Google 授權與金鑰都在 002 的伺服器端；picker token 只給老師分頁；log 不含 token 與儲存格內容 | 通過 |
| VII. 輸入驗證與錯誤訊息 | `spreadsheetId`、`worksheet` 以 JSON schema 驗證；學習單內容依規則驗證，7 種 `ImportError` 都有原因與修正方式；失敗不改變 `ImportStore` | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 都有正常與邊界案例的測試，不連網；quickstart 列出 15 個人工情境 | 通過 |
| IX. 程式碼規範 | 不新增介面元件（沿用 001 的頁面）；資料存取（`GoogleSheetsReader`）與解析、路由分離；命名與註解用英文 | 通過 |
| X. 人工把關 | 本計畫需人工審查後才進入 tasks | 待審查 |
| XI. 簡潔 | 沒有預覽／確認 API、舊答案與唯讀警告、手動指定欄位；`SpreadsheetReader` 是唯一的介面，為了原則 III、VIII；`ImportStore` 沒有另設介面 | 通過 |

## 藍圖對照（diagrams → 程式）

| 圖上的組件／類別 | 程式位置 | 來源圖 |
| --- | --- | --- |
| HttpGuidedNotesService | `frontend/src/services/http/HttpGuidedNotesService.ts` | component、class、sequence |
| GooglePickerLauncher | `frontend/src/services/google/GooglePickerLauncher.ts` | component、class、sequence |
| createServiceRegistry()（綁定 guidedNotes） | `frontend/src/services/createServiceRegistry.ts`（001，只改綁定） | component |
| ApiClient、picker-token、buildApp、app.requireTeacher、GoogleClientProvider（`app.googleClients`）、isGoogleAuthExpired、ErrorBody | 002 提供，003 只引用（`specs/002-teacher-login/contracts/server-extension.md`） | component、class、sequence |
| guidedNotesRoutes | `server/src/guided-notes/guidedNotesRoutes.ts` | component、class、sequence |
| GuidedNotesImporter | `server/src/guided-notes/GuidedNotesImporter.ts` | component、class、sequence |
| SpreadsheetReader、LoadedSpreadsheet、SheetsReadError | `server/src/guided-notes/SpreadsheetReader.ts` | component、class |
| SheetGrid、CellRange | `server/src/guided-notes/SheetGrid.ts` | component、class |
| GoogleSheetsReader | `server/src/guided-notes/GoogleSheetsReader.ts` | component、class、sequence |
| GuidedNotesParser | `server/src/guided-notes/GuidedNotesParser.ts` | component、class、sequence |
| HeaderLocator、HeaderMatch | `server/src/guided-notes/HeaderLocator.ts` | component、class、sequence |
| QuestionScanner、ScannedQuestion | `server/src/guided-notes/QuestionScanner.ts` | component、class、sequence |
| importErrors | `server/src/guided-notes/importErrors.ts` | component、class |
| ImportStore | `server/src/guided-notes/ImportStore.ts`；契約見 [contracts/import-store.md](contracts/import-store.md) | component、class、sequence |
| Entities（含 `SubQuestion.marker`） | `shared/src/entities.ts`（001 擁有，`marker` 由 001 加入） | class |

## 替換模擬實作

- 依 001 plan「替換模擬實作的方式」：新增 `HttpGuidedNotesService`，只修改 `createServiceRegistry()` 中 `guidedNotes` 的綁定。
- 002 已把 `auth` 換成真正的實作，003 完成後 `auth` 與 `guidedNotes` 都不是模擬實作，所以同時從組合根移除 `choicePrompt`（001 plan）。
- `MockGuidedNotesService` 保留，只供 001 的測試使用。
- 伺服器端：在 002 的 `buildApp(config, deps)`（`server/src/app.ts`）建立一個 `ImportStore` 與一個 `GoogleSheetsReader(app.googleClients)`（`deps.spreadsheetReader` 可注入替身），以 `app.decorate` 提供為 `app.importStore`、`app.spreadsheetReader`，再 `app.register(guidedNotesRoutes)`；路由加 `{ preHandler: app.requireTeacher }`，並加入 002 T043 的「老師專用路由清單」測試（research R8）。這是 002 預期的擴充點，不算修改既有實作（原則 III）。

## Project Structure

### Documentation (this feature)

```text
specs/003-guided-notes-import/
├── spec.md
├── plan.md                       # 本檔
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── guided-notes-http.md      # 003 的伺服器 API
│   └── import-store.md           # 003 → 004、006
├── checklists/requirements.md
├── analyze-report.md
├── manual-verification.md        # implement 階段產生
└── tasks.md
```

### Source Code (repository root)

```text
shared/src/entities.ts                       # 001 擁有；SubQuestion.marker 由 001 加入
server/
├── package.json                             # 003 新增 @googleapis/sheets、@googleapis/drive
├── src/
│   ├── app.ts                               # 002 的 buildApp；003 只加：建立 ImportStore 與 GoogleSheetsReader、decorate、register
│   └── guided-notes/
│       ├── guidedNotesRoutes.ts
│       ├── GuidedNotesImporter.ts
│       ├── SpreadsheetReader.ts
│       ├── SheetGrid.ts
│       ├── GoogleSheetsReader.ts
│       ├── GuidedNotesParser.ts
│       ├── HeaderLocator.ts
│       ├── QuestionScanner.ts
│       ├── importErrors.ts
│       └── ImportStore.ts
├── tests/integration/requireTeacher.test.ts  # 002 T043；003 把兩支路由加入老師專用路由清單
└── tests/guided-notes/
    ├── fixtures/                            # spreadsheets.get 回應格式的 JSON
    ├── helpers/gridBuilder.ts               # 以二維陣列與合併範圍產生 SheetGrid
    ├── SheetGrid.test.ts
    ├── ImportStore.test.ts
    ├── importErrors.test.ts
    ├── HeaderLocator.test.ts
    ├── QuestionScanner.test.ts
    ├── GuidedNotesParser.test.ts
    ├── GoogleSheetsReader.test.ts
    ├── GuidedNotesImporter.test.ts
    └── guidedNotesRoutes.test.ts
frontend/
├── src/services/
│   ├── createServiceRegistry.ts             # 001；只改 guidedNotes 綁定、移除 choicePrompt
│   ├── http/HttpGuidedNotesService.ts
│   └── google/GooglePickerLauncher.ts
└── tests/unit/HttpGuidedNotesService.test.ts
```

**Structure Decision**: 沿用 001 的 npm workspaces 結構。伺服器端所有 003 的程式放在 `server/src/guided-notes/`；解析規則（`HeaderLocator`、`QuestionScanner`、`GuidedNotesParser`）只依賴 `SheetGrid`，不碰網路；只有 `GoogleSheetsReader` 接觸 Google。前端只新增服務實作，不新增頁面或元件。

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
