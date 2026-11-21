# Implementation Plan: 畫面與流程原型

**Branch**: `001-ui-prototype` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-ui-prototype/spec.md`

## Summary

001 建立老師端與學生端的全部頁面、按鈕與頁面切換（R1 與 feature-split 3.3）。頁面只透過介面呼叫取得結果；001 為每個介面提供在瀏覽器記憶體中執行的模擬實作，並顯示「模擬模式」標示與模擬控制列。

001 是第一個進入 plan 的子功能，[research.md](research.md) 記錄的技術選擇是整個專案共用的基礎，之後整理成 `docs/architecture.md`：

- 前端 React + TypeScript + Vite；後端 Node.js 24 LTS + TypeScript + Fastify（002 起才建立）
- 指令走 HTTP REST，狀態推播走 WebSocket（Socket.IO）（004、005 起使用）
- 模擬實作放在前端，以 in-memory 的 `Mock*Service` 實作介面
- 活動狀態只存在伺服器記憶體；學習單的來源與寫回目標是 Google Sheets
- 伺服器 logging 使用 pino，並遮蔽機敏欄位（002 起使用）
- 測試：Vitest + Testing Library（單元與元件）、Playwright（端對端，多分頁）
- 樣式：原生 CSS + CSS Modules；`tokens.css` 只放深色主題的 CSS 變數

**以三張圖為藍圖**：本計畫的組件、類別、介面與呼叫順序一律依 [`diagrams/001-component.puml`](../../diagrams/001-component.puml)、[`diagrams/001-class.puml`](../../diagrams/001-class.puml)、[`diagrams/001-sequence.puml`](../../diagrams/001-sequence.puml)，畫面切換依 [`diagrams/001-screen-flow.puml`](../../diagrams/001-screen-flow.puml)。圖中的每個組件對應「Project Structure」中的一個檔案（對照見 [research.md](research.md) RD-10）；[data-model.md](data-model.md) 的實體與介面和類別圖一一對應。規劃時發現的圖表缺漏已補進圖表（commit `71e75ef`），見「圖表的修訂」。

## Technical Context

**Language/Version**: TypeScript 5（strict 模式）；Node.js 24 LTS（開發工具與之後的伺服器）

**Primary Dependencies**: React、React DOM、Vite（含內建的 CSS Modules）。001 不使用路由套件與狀態管理套件（[research.md](research.md) RD-11）

**Storage**: N/A。模擬實作的狀態只存在各分頁的記憶體中，重新整理即重置（M7）

**Testing**: Vitest + @testing-library/react（jsdom）做單元與元件測試；@playwright/test 做端對端測試；人工驗證紀錄寫在 `specs/001-ui-prototype/manual-verification.md`

**Target Platform**: 本機桌面瀏覽器（Chrome 為主）。老師頁面以 1440 px 寬設計；學生頁面在桌面瀏覽器中以 390 px 寬的欄位置中顯示

**Project Type**: Web 應用（npm workspaces）。001 只建立 `frontend/` 與 `shared/`；`server/` 從 002 起建立

**Performance Goals**: 無特定數值。模擬實作即時回傳，頁面切換不應有可察覺的延遲

**Constraints**: 本機執行；金鑰不得進入 repo（001 不使用任何金鑰）；頁面不得直接引用模擬實作（原則 III，以 ESLint 規則強制）；只做深色主題

**Scale/Scope**: 16 個頁面與 2 個確認視窗、5 個服務介面、5 個模擬控制介面（含模擬選擇器）、7 個共用介面元件

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I. PlantUML 設計優先 | 三張圖與 PNG 都存在，計畫以它們為藍圖；規劃時發現的缺漏已先更新圖表並重新產生 PNG（見「圖表的修訂」） | 通過 |
| II. 規格先行與可追溯性 | 計畫沒有加入 spec 沒有的行為；只做深色主題與學生頁面置中（commit `157642e`）、共通錯誤訊息區（FR-009，commit `bcadd80`）都已先修改 spec。每條 FR、AC 在 tasks 階段對應任務與測試 | 通過 |
| III. 分層架構與依賴抽象 | 頁面層 → 介面層 ← 模擬實作。頁面只依賴 `ServiceRegistry` 與介面；只有組合根（`createServiceRegistry`）引用 `Mock*Service`，以 ESLint `no-restricted-imports` 強制。後續子功能新增真正的實作，只修改 `ServiceRegistry` 中的綁定（見「替換模擬實作的方式」） | 通過 |
| IV. 外部資料於執行期解析 | 001 不讀取外部資料；模擬的辨識結果是固定資料，不是解析規則。解析規則由 003 定義 | 不適用 |
| V. 單一權威狀態來源 | 頁面不推導活動階段，只呈現 `ActivityService` 回傳或推播的 `Activity`；001 的權威來源是各分頁的模擬實作，004 起換成伺服器 | 通過 |
| VI. 最小資訊揭露與機敏資料保護 | 學生頁面不呈現其他組別的作答（FR-054，以 E2E 測試 SC-007）；介面中沒有學生取得他組送出的方法；送出與接收判定不傳組別，由服務依 `joinGroup` 記住本分頁的組別，真正的實作由伺服器依連線身分判斷。001 不處理任何機敏資料；`.gitignore` 已排除 `.env`、`credentials/` | 通過 |
| VII. 輸入驗證與錯誤訊息 | 頁面能在欄位旁顯示介面回傳的 `ValidationError`，驗證失敗不切換頁面（FR-008）；非預期錯誤顯示在每頁共通的 `ErrorArea`，不切換頁面、不改變已輸入的內容（FR-009）。驗證規則與錯誤種類由負責的子功能定義 | 通過 |
| VIII. 自動化測試與人工驗證 | 每個 User Story 至少一個正常案例與一個邊界案例；測試以假的 `ServiceRegistry` 取代服務，不依賴外部服務；人工驗證紀錄寫入 `manual-verification.md` | 通過 |
| IX. 程式碼規範 | 共用介面元件只實作一次（組件圖「共用介面元件」）；頁面（呈現）與服務（資料）分離；註解與命名用英文 | 通過 |
| X. 人工把關 | 本計畫經人工審查確認後才執行 `/speckit-tasks` | 待審查 |
| XI. 簡潔 | 不建立伺服器、路由套件、狀態管理套件、前端 logging 框架、淺色主題、響應式版面；`ServiceRegistry` 與介面是 FR-003 要求的抽象，不是預設 | 通過 |

**Phase 1 設計後重新檢查**：data-model、contracts、quickstart 沒有引入新的違反；結果同上表。

## 圖表的修訂

規劃時發現下列設計是 spec 要求、但圖表原本沒有畫出的。經使用者確認，已更新類別圖、組件圖、時序圖與畫面流程圖並重新產生 PNG（commit `71e75ef`）；data-model 與修訂後的類別圖一致。

| 編號 | spec 的要求 | 原本的圖表缺少什麼 | 修訂內容 |
| --- | --- | --- | --- |
| G-1 | M1、M2：點「用 Google 登入」「從 Google 雲端硬碟挑選」後，顯示模擬帳號選擇、模擬檔案選擇器 | 沒有任何組件負責顯示這兩個選擇器。真正的實作（002、003）會由 Google 的視窗負責，所以它們屬於模擬實作，不屬於頁面 | 類別圖新增 mock only 介面 `MockChoicePrompt`（`onRequest`、`answer`）與 `ChoiceRequest`、`ChoiceOption`，由 `MockSession` 實作；`MockAuthService`、`MockGuidedNotesService` 經 `MockSession.requestChoice` 發出選擇請求。`ServiceRegistry` 增加 `choicePrompt [0..1]`；組件圖中由 `MockControlBar` 使用 `ConfirmDialog` 顯示。時序圖第 1、2 段補上這段呼叫 |
| G-2 | M3、M4、M8：控制台的題目、最後一題沒有送出、寫回成功或失敗，都取決於老師匯入了哪一份模擬學習單 | 模擬實作之間只畫了 `MockResultService → MockSubmissionService`，其他模擬實作無從得知匯入了哪份學習單 | 類別圖與組件圖新增 `MockSession`（每個分頁一份的模擬狀態），所有 `Mock*Service` 共用它，取代 `MockResultService → MockSubmissionService` 的關聯；`MockFixtures` 維持只放固定資料。時序圖第 2 段補上寫入 `lastImport` |
| G-3 | FR-009、M9：每頁的共通錯誤訊息區與「模擬：非預期錯誤」（spec 於規劃期間新增，commit `bcadd80`） | 沒有錯誤訊息區、非預期錯誤的型別與觸發它的模擬控制 | 組件圖新增共用元件 `ErrorArea`，所有頁面使用；類別圖新增實體 `UnexpectedError` 與 mock only 介面 `UnexpectedErrorMockControl`（`failNextCall`），由 `MockSession` 實作，`ServiceRegistry` 增加 `unexpectedErrorControl [0..1]`；時序圖新增第 6 段；畫面流程圖以註記說明每頁都可能停留在原頁顯示錯誤 |
| G-4 | R4：T-Lobby、T-Live 在學生加入、送出時即時更新；原則 VI：前端不得指定組別（plan 審查後新增，spec commit `8676808`） | 老師端只有載入時呼叫的方法；`submitAnswer`、`onJudgement`、`leaveGroup` 由頁面傳入組別 | 類別圖新增 `onActivityChange`、`onSubmissionsChange`；`submitAnswer`、`onJudgement`、`leaveGroup` 移除組別參數，`MockSession` 新增 `joinedGroup`；時序圖第 2–4 段補上訂閱與「服務記住本分頁的組別」（commit `d4fa5c2`） |

## 替換模擬實作的方式

- 頁面只透過 `ServiceRegistry` 取得介面，不知道背後是模擬實作還是真正的實作。
- `ServiceRegistry` 的綁定集中在一個組合根函式 `createServiceRegistry()`（`frontend/src/services/createServiceRegistry.ts`）。
- 002–006 替換模擬實作時：**新增**真正的實作（例如 `HttpActivityService`），並**只修改 `createServiceRegistry()` 中該介面的綁定**。這是預期中的修改，不算修改既有且已驗證的實作（原則 III）。頁面、共用元件、介面、其他模擬實作都不修改。
- 綁定換成真正的實作後，對應的模擬控制（`phaseControl` 等）也從組合根移除，模擬控制列就不再顯示該控制（FR-061）。`unexpectedErrorControl` 在仍有任一模擬實作時保留，只影響仍是模擬實作的介面；`choicePrompt` 在 `auth` 與 `guidedNotes` 都換成真正的實作後移除。五個介面都換成真正的實作後，`isMockMode()` 為 false，「模擬模式」標示與控制列消失（FR-005、SC-003）。
- 不再使用的 `Mock*Service` 是否刪除，由該子功能的 plan 決定；保留時只供測試使用。

## Project Structure

### Documentation (this feature)

```text
specs/001-ui-prototype/
├── spec.md
├── plan.md                    # 本檔
├── research.md                # Phase 0：技術選擇（全專案共用）
├── data-model.md              # Phase 1：實體、介面、模擬狀態（與類別圖一致）
├── quickstart.md              # Phase 1：執行與驗證步驟
├── contracts/
│   ├── service-interfaces.md  # 頁面與服務之間的介面契約
│   └── mock-controls.md       # 模擬控制與模擬模式的契約
├── checklists/requirements.md
├── manual-verification.md     # implement 階段產生：人工驗證紀錄
└── tasks.md                   # /speckit-tasks 產生
```

### Source Code (repository root)

```text
package.json                   # npm workspaces: frontend, shared；共用 scripts
.nvmrc                         # 24
shared/
├── package.json
└── src/
    ├── entities.ts            # 類別圖 Entities package（含 UnexpectedError）
    └── guards.ts              # isValidationError、isImportError 等型別判斷
frontend/
├── package.json
├── index.html
├── vite.config.ts             # 含 Vitest 設定
├── playwright.config.ts
├── eslint.config.js           # 含限制頁面引用 services/mock 的規則
├── src/
│   ├── main.tsx
│   ├── app/
│   │   └── AppRouter.tsx      # AppRouter：頁面切換，學生頁面套用置中欄
│   ├── pages/
│   │   ├── HomePage.tsx               # Main
│   │   ├── teacher/
│   │   │   ├── TeacherLoginPage.tsx   # T-Login
│   │   │   ├── PickPage.tsx           # T-Pick
│   │   │   ├── ImportPage.tsx         # T-Import / T-ImportError
│   │   │   ├── SetupPage.tsx          # T-Setup
│   │   │   ├── ConsolePage.tsx        # T-Lobby / T-Live / T-EndConfirm / T-QuestionEnd
│   │   │   └── TeacherResultsPage.tsx # T-Results / T-WriteBack
│   │   └── student/
│   │       ├── JoinPage.tsx           # S-Join
│   │       ├── StudentPlayPage.tsx    # S-Wait / S-Answer / S-Submitted / S-QuestionDone
│   │       └── StudentResultsPage.tsx # S-Results
│   ├── components/            # 共用介面元件與模擬模式元件
│   │   ├── AppHeader.tsx
│   │   ├── QuestionProgress.tsx
│   │   ├── SubmissionTable.tsx
│   │   ├── GroupGrid.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── SheetPreview.tsx
│   │   ├── ErrorArea.tsx      # 共通錯誤訊息區（FR-009）
│   │   ├── MockModeBadge.tsx
│   │   └── MockControlBar.tsx
│   ├── services/
│   │   ├── interfaces.ts              # 5 個服務介面、模擬控制與模擬選擇器介面、Unsubscribe
│   │   ├── ServiceRegistry.ts         # ServiceRegistry 型別與 isMockMode
│   │   ├── ServiceRegistryContext.tsx # React context，頁面由此取得 registry
│   │   ├── createServiceRegistry.ts   # 組合根：唯一綁定實作的地方
│   │   └── mock/
│   │       ├── MockFixtures.ts
│   │       ├── MockSession.ts         # 每個分頁的模擬狀態；實作模擬選擇器與非預期錯誤控制
│   │       ├── MockAuthService.ts
│   │       ├── MockGuidedNotesService.ts
│   │       ├── MockActivityService.ts
│   │       ├── MockSubmissionService.ts
│   │       └── MockResultService.ts
│   └── styles/
│       ├── tokens.css         # 只放深色主題的 CSS 變數
│       └── global.css
└── tests/
    ├── unit/                  # 模擬實作（M1–M8）、ServiceRegistry
    ├── component/             # 各頁面：以假的 ServiceRegistry 驗證按鈕呼叫與切換
    └── e2e/                   # Playwright：畫面流程圖的每個狀態與箭頭
```

**Structure Decision**: 採用 web 應用結構，以 npm workspaces 管理。`shared/` 放會跨越之後網路邊界的實體型別（類別圖 Entities），讓 002 起的 `server/` 與前端共用同一份定義；服務介面只有前端使用，放在 `frontend/src/services/`。`server/` 不在 001 建立（原則 XI）。

## Complexity Tracking

沒有違反憲法的設計，不需要說明。
