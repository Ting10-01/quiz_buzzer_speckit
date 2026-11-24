# 001 圖表一致性驗證

- 日期：2026-11-24（2026-11-25 依 tasks.md Phase 8.5 重做 F4）
- 分支：`001-ui-prototype-impl`
- 範圍：`frontend/src`、`shared/src` 與 `diagrams/001-component.puml`、`001-class.puml`、`001-sequence.puml`、`001-screen-flow.puml`
- 分類：(a) 圖過時，改圖；(b) 程式偏離設計，改程式；(c) 可接受，不需改
- 每項的處理方式由使用者決定（F4 改為 (b)，其餘依建議分類）

## 結果摘要

| 分類 | 項數 | 狀態 |
| --- | --- | --- |
| (a) 圖過時 | 15（D1–D6、C1–C3、Q1–Q6） | 已改圖並重新產生 PNG |
| (b) 程式偏離設計 | 1（F4） | 已修正：先改 spec 與圖，再依 Phase 8.5 改程式，見「F4 處理紀錄」 |
| (c) 可接受 | 8（D7、D8、C4–C6、F1–F3） | 不需改，理由見各表 |

完全一致、未列入差異的部分：類別圖的實體欄位；`AuthService`、`GuidedNotesService`、`ActivityService`、`SubmissionService`、`ResultService` 與 6 個 mock 控制介面的方法名稱、參數、回傳型別；`ServiceRegistry` 的欄位與 `isMockMode()`；各頁面對服務介面的依賴（D4 除外）；時序圖第 2、5、6 段的呼叫順序。

## 組件圖

| # | 位置 | 圖上（修改前） | 程式 | 分類 | 處理 |
| --- | --- | --- | --- | --- | --- |
| D1 | AppRouter 的箭頭 | 只連到 HomePage、JoinPage、TeacherLoginPage | `renderPage()` 渲染全部 10 個頁面（`app/AppRouter.tsx`） | (a) | 改為 `Router --> 老師端頁面`、`Router --> 學生端頁面`，標註 `renderPage()` |
| D2 | AppRouter → MockModeBadge | 沒有 | `AppRouter` 渲染 `MockModeBadge` | (a) | 新增箭頭 |
| D3 | AppHeader | 沒有箭頭 | 10 個頁面都使用 | (a) | 兩個頁面群組各加一條箭頭（比照 ErrorArea） |
| D4 | JoinPage 的依賴 | 只依賴 ActivityService | `JoinPage` 呼叫 `getGroupSubmission()` | (a) | 新增 `PJoin ..> SubmissionService` |
| D5 | TeacherResultsPage 的元件 | 沒有 QuestionProgress、SubmissionTable | 兩者都使用 | (a) | 新增兩條箭頭 |
| D6 | StudentResultsPage 的元件 | 沒有共用元件 | 使用 SubmissionTable | (a) | 新增箭頭 |
| D7 | 輔助檔 | 未畫 | `errorMessage.ts`、`phaseLabels.ts`、`questionLabels.ts`、`submissionLabels.ts`、`importNavigation.ts` | (c) | 純函式或文字對照；`importNavigation` 只是包裝 `pickSpreadsheet`、`readWorksheet`，依賴的仍是 `GuidedNotesService` 介面 |
| D8 | 連線與啟動 | 未畫 | `ServiceRegistryContext.tsx`、`main.tsx`、`createServiceRegistry.ts` | (c) | React 傳遞 Registry 的方式；`createServiceRegistry` 已寫在圖的註記 |

## 類別圖

| # | 位置 | 圖上（修改前） | 程式 | 分類 | 處理 |
| --- | --- | --- | --- | --- | --- |
| C1 | MockSession | 沒有此方法 | 公開方法 `consumeUnexpectedError(): boolean`，所有 mock 服務呼叫 | (a) | 新增方法，並在 MockSession 註記說明；時序圖第 6 段同步標出方法名稱 |
| C2 | MockFixtures | 6 個欄位 | 另有 `teammateAnswers`（M5）、`viewerSequence: ViewerStep[]`（M7） | (a) | 新增兩個欄位與 `ViewerStep` 類別 |
| C3 | `MockSession.pendingValidationFailure` | 沒有型別 | `{ activity: boolean; submission: boolean }` | (a) | 補上型別 |
| C4 | 屬性與關聯 | `Question.subQuestions`、`Activity` 的 spreadsheet／questions／groups、`QuestionResult.submissions` 畫成關聯線 | 欄位 | (c) | UML 中兩種畫法等價，多重性一致 |
| C5 | `shared/src/guards.ts` | 未畫 | 4 個型別守衛 | (c) | 分辨聯集回傳值的輔助函式 |
| C6 | Fixture 常數、mock 的 private 方法 | 未畫 | `ACCOUNT_CHOICE`、`SPREADSHEET_ID`、`MOCK_UNEXPECTED_ERROR`、`MOCK_VALIDATION_MESSAGE`、`FixtureSubmission`；`stepViewerPhase`、`seed` 等 | (c) | mock 內部實作細節，類別圖只列公開成員 |

## 時序圖

| # | 位置 | 圖上（修改前） | 程式 | 分類 | 處理 |
| --- | --- | --- | --- | --- | --- |
| Q1 | 第 1 段，登入成功 | 直接到挑選學習單頁 | `PickPage` 載入時呼叫 `auth.getCurrentAccount()` | (a) | 新增呼叫 |
| Q2 | 第 3 段，階段訂閱 | 沒有畫 `onPhaseChange` 的訂閱 | Home、Join 與學生端各畫面掛載時訂閱 | (a) | 在選組頁載入後新增 `onPhaseChange(listener)` 與註記 |
| Q3 | 第 3 段，判定「接受」 | 直接 `advanceViewerPhase()` | `simulateJudgement` 先經 `onJudgement` 通知 ACCEPTED（頁面不處理），再推進階段 | (a) | 新增通知訊息 |
| Q4 | 第 3 段，本題結果頁 | 只有 `getQuestionResult(q)` | 另呼叫 `getAllResults()`（各題進度） | (a) | 新增呼叫 |
| Q5 | 第 4 段，控制台・搶答中 | 沒有 `getAllResults()` | 呼叫 `getAllResults()`（各題進度） | (a) | 新增呼叫 |
| Q6 | 第 4 段，結束之後 | 兩種情況都先 `getQuestionResult(n)` | 非最後一題：本題已結束頁呼叫 `getQuestionResult`、`getAllResults`；最後一題：直接到結果頁，只呼叫 `getAllResults` | (a) | 依兩種情況分開畫 |

## 畫面流程圖

除 S10、S11 外，每條箭頭在 `frontend/tests/e2e/us5-screen-flow.spec.ts` 都有一個測試；瀏覽器返回（`backTarget`）與 T3、T6、T9、T11、H3、H4 一致。

| # | 位置 | 圖上 | 程式 | 分類 | 處理 |
| --- | --- | --- | --- | --- | --- |
| F1 | T5「切換工作表（找不到表頭）」、T8「重新讀取（仍找不到表頭）」 | 列為觸發 | 有程式路徑（`readToPage` → `isImportError`），但 M2 的模擬資料無法產生，e2e 只測「重新挑選」 | (c) | 程式路徑存在，只是 mock 觸發不了 |
| F2 | S_Open → S-Results，從「S-Submitted（不接受）」 | 複合狀態的箭頭涵蓋此子狀態 | 與「等待判定」共用 `SubmittedView` → `navigateWhenQuestionEnds`；e2e 沒有這個子狀態的測試 | (c) | 程式路徑存在 |
| F3 | S10 | 001 的模擬實作不觸發 | 有程式路徑（`JoinPage` 的 `getGroupSubmission`），由 component test T079 涵蓋 | (c) | — |
| F4 | S11：S-Join、S-Wait → S-Join（沒有活動） | 修改前：由 004 推動，001 不觸發。修改後（commit `3c121a7`）：`onPhaseChange` 的 listener 收 `Activity \| null`，`null` 表示活動被取消；S11 標註「001 的頁面已處理；001 的模擬實作不觸發」 | 修改前：listener 只收 `Activity`，`JoinPage` 仍顯示組別，`WaitView` 只處理 `OPEN`。修改後：見「F4 處理紀錄」 | **(b)** | **已修正**（2026-11-25） |

## F4 處理紀錄

### 修改順序

依 CLAUDE.md 第 3 節視為行為變更，依序完成：

1. spec：`7ece4a0 spec(001): handle activity cancellation on 001 pages`（FR-010、FR-050、FR-051、FR-026 的處理；SC-002 改為「模擬實作不觸發的切換以元件測試驗證」）。
2. 圖與設計：`3c121a7`（類別圖、時序圖第 2、3 段、畫面流程圖 S11，並重新產生三張 PNG）、`2ae9890`（plan G-8、research RD-12、contracts、data-model、quickstart「自動化測試」的 S11 說明）、`01ea9ca`（tasks.md Phase 8.5：T147–T156）。
3. 程式與測試：`7688b85`（T147、T148）、`65445d2`（T149–T152）、`dc6f30d`（T153）、`7f66733`（T154）、`79bd7c0`（T155）、`239b0f8`（T156）。

### 重新驗證（依 tasks.md Phase 8.5）

| 項目 | 圖 | 程式 | 結果 |
| --- | --- | --- | --- |
| 介面 | 類別圖 `ActivityService.onPhaseChange(listener: (activity: Activity \| null) => void): Unsubscribe` | `services/interfaces.ts` 相同簽章，註解說明 `null` 表示活動被取消；`MockActivityService.onPhaseChange` 同簽章、不通知 `null` | 一致；與 data-model「`ActivityPhase` 與題號」「首頁與學生端」及 contracts 一致 |
| 首頁 | 時序圖第 2 段註記：學生經 `onPhaseChange` 收到 `null`；FR-010 | `HomePage` 把通知直接存成 `activity`，`null` 時顯示「目前沒有活動」，不重新呼叫介面（T149） | 一致 |
| 選組頁 | 時序圖第 3 段 S11：`Act --> Page : 階段：null`，顯示「目前沒有活動」、清除已選組別、不呼叫 `leaveGroup`；畫面流程圖 `S_Join → S_JoinEmpty` | `JoinPage` 的 listener `setActivity(next)`，`null` 時 `setSelected(undefined)`，不呼叫任何介面、不切換頁面（T150） | 一致 |
| 等待開放頁 | 時序圖第 3 段註記：從等待開放頁切換時，選組頁載入時呼叫 `getCurrentActivity()`；畫面流程圖 `S_Wait → S_JoinEmpty` | `WaitView` 收到 `null` 時 `navigate({ id: 'S-Join' })`，不帶 `previousGroup`、不呼叫 `leaveGroup`；`JoinPage` 掛載時呼叫 `getCurrentActivity()`（T151） | 一致 |
| 作答頁、等待判定頁、本題結果頁 | 時序圖第 3 段註記：收到 `null` 時不切換（FR-026） | `AnswerView`、`SubmittedView`、`QuestionDoneView` 收到 `null` 時直接返回，不呼叫 `navigateWhenQuestionEnds`（T152） | 一致 |
| 模擬實作 | 畫面流程圖 S11「001 的模擬實作不觸發」；SC-002 除外項 | 模擬實作不通知 `null`；頁面處理由元件測試 T149–T152 驗證（HomePage 1、JoinPage 2、S-Wait 1、S-Answer 1、S-Submitted 2、S-QuestionDone 1，共 8 個；T156 時 `npm test` 290 個、`npm run test:e2e` 127 個全部通過），不列入人工驗證情境 | 一致 |

`StudentPlayPage.usePhaseChange` 的 handler 型別已改為 `Activity | null`，T147 暫加的 `as Activity` 已移除。組件圖沒有新增或移除元件；組件圖註記「後續子功能只改綁定」現在對 S11 成立：004 只需在真正的實作中通知 `null`。

### 其他項目的複查

Phase 8.5 只修改 `interfaces.ts`、`MockActivityService.ts` 的型別與 `HomePage`、`JoinPage`、`StudentPlayPage` 的 listener，沒有新增元件、類別、方法或呼叫。D1–D8、C1–C6、Q1–Q6、F1–F3 的結論不變；Q2（各畫面掛載時訂閱 `onPhaseChange`）仍成立。上方「除 S10、S11 外，每條箭頭在 e2e 都有一個測試」仍成立：S11 改以元件測試 T149–T152 驗證。

### 與 data-model.md 同步

C1、C2 在類別圖新增的 `MockSession.consumeUnexpectedError()`、`MockFixtures.viewerSequence`、`teammateAnswers`，已依使用者決定同步加入 `data-model.md` 第 3 節（`MockFixtures` 表、`MockSession` 方法表）；C3 的 `pendingValidationFailure` 在 data-model 原本就寫明「活動與送出各一個旗標」，不需改。

## 圖片產生

以 `java -DPLANTUML_LIMIT_SIZE=16384 -jar plantuml.jar -charset UTF-8` 重新產生 `001-component.png`、`001-class.png`、`001-sequence.png`。PlantUML 預設上限為 4096 px，修改前的 `001-component.png` 寬度剛好是 4096 px，右側已被裁切；這次調高上限後輸出完整（4771 × 1281）。`001-screen-flow` 沒有修改，未重新產生。

F4 的設計修改（commit `3c121a7`）重新產生了 `001-class.png`、`001-sequence.png`、`001-screen-flow.png`，三張 PNG 與 `.puml` 在同一個 commit 中更新。
