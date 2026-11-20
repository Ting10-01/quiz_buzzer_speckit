# Data Model: 畫面與流程原型

本文件與 [`diagrams/001-class.puml`](../../diagrams/001-class.puml) 一一對應：類別名稱、欄位、關聯與類別圖相同。類別圖中以關聯表示的部分，在 TypeScript 中寫成欄位（下表「關聯欄位」）。類別圖於規劃期間依 plan「圖表的修訂」更新（commit `71e75ef`）。

型別位置：實體在 `shared/src/entities.ts`；介面在 `frontend/src/services/interfaces.ts`（契約見 [contracts/service-interfaces.md](contracts/service-interfaces.md)）。

## 1. 實體（類別圖 Entities）

| 實體 | 欄位 | 關聯欄位 | 對應 spec Key Entities |
| --- | --- | --- | --- |
| `Role`（enum） | `TEACHER`、`STUDENT` | — | 身分 |
| `TeacherAccount` | `name: string`、`email: string` | — | 老師帳號 |
| `SignInFailure`（enum） | `CANCELLED`、`NOT_TEACHER` | — | — |
| `SignInResult` | `ok: boolean`、`account?: TeacherAccount`、`failure?: SignInFailure` | — | — |
| `Spreadsheet` | `id: string`、`title: string`、`editable: boolean`、`worksheets: string[]`、`selectedWorksheet: string` | — | 學習單 |
| `QuestionType`（enum） | `SINGLE`、`GROUP` | — | — |
| `Question` | `number: number`、`type: QuestionType`、`text?: string` | `subQuestions: SubQuestion[]`（1..*） | 題目 |
| `SubQuestion` | `index: number`、`blankCell: string` | — | 小題 |
| `ImportSuccess` | `spreadsheet: Spreadsheet`、`headerRow: number`、`headerColumns: string[]` | `questions: Question[]`（1..*） | — |
| `ImportError` | `code: string`、`reason: string`、`foundHeaders: string[]`、`acceptedHeaders: string[]`、`fixSteps: string[]` | — | 辨識錯誤 |
| `ActivityPhase`（enum） | `NO_ACTIVITY`、`PREPARING`、`OPEN`、`QUESTION_ENDED`、`FINISHED` | — | 活動階段 |
| `ActivitySettings` | `groupCount: number` | — | — |
| `Activity` | `groupCount: number`、`phase: ActivityPhase`、`currentQuestion?: number` | `spreadsheet: Spreadsheet`、`questions: Question[]`（1..*）、`groups: Group[]`（1..*） | 活動 |
| `Group` | `number: number`、`memberCount: number` | — | 組別 |
| `Judgement`（enum） | `PENDING`、`ACCEPTED`、`REJECTED`、`UNJUDGED` | — | — |
| `Submission` | `questionNumber: number`、`groupNumber: number`、`answers: string[]`、`rank: number`、`elapsedMs: number`、`judgement: Judgement` | — | 送出 |
| `QuestionResult` | `questionNumber: number`、`winner?: Submission`、`submissionCount: number` | `submissions: Submission[]`（0..*） | 題目結果 |
| `WriteBackResult` | `ok: boolean`、`cellCount: number`、`failureReason?: string` | — | 寫回結果 |
| `ValidationError` | `field: string`、`message: string` | — | — |
| `UnexpectedError` | `message: string` | — | 非預期錯誤 |

### 規則與說明

- **題組算一題**：`Question` 是以題號為單位的一題；單題只有一個 `SubQuestion`（spec Key Entities）。`Submission.answers` 的順序對應 `Question.subQuestions` 的順序。
- **活動沒有名稱**（FR-023）：`Activity`、`ActivitySettings` 沒有名稱欄位。
- **`ActivityPhase` 與題號**：`OPEN`、`QUESTION_ENDED` 時 `currentQuestion` 必有值；沒有活動時 `getCurrentActivity()` 回傳 `null`，頁面據此顯示「目前沒有活動」（FR-010、FR-050）。
- **「比第一名慢的秒數」**（FR-040）：由 `QuestionResult.submissions` 中各筆 `elapsedMs` 與第一筆相減得到，屬於呈現邏輯，不另設欄位。
- **判定狀態的種類由 005 定義**（FR-031）：001 的模擬實作使用 `PENDING`、`ACCEPTED`、`REJECTED`；`UNJUDGED` 保留給 005（D12）。
- **驗證規則**（組數範圍、空白答案等）不在 001 定義；實體本身不帶驗證規則（D4–D7、D14）。
- **`UnexpectedError`** 不是回傳值，而是介面 Promise reject 的值；種類與訊息由負責的子功能定義（FR-009）。

## 2. 介面層（類別圖 Service Interfaces）

| 介面 | 方法 | 取代模擬實作的子功能 |
| --- | --- | --- |
| `AuthService` | `signInWithGoogle`、`getCurrentAccount` | 002 |
| `GuidedNotesService` | `pickSpreadsheet`、`readWorksheet` | 003 |
| `ActivityService` | `createActivity`、`updateSettings`、`openQuestion`、`endQuestion`、`joinGroup`、`leaveGroup`、`getCurrentActivity`、`onPhaseChange` | 004 |
| `SubmissionService` | `submitAnswer`、`listSubmissions`、`judge`、`onJudgement` | 005 |
| `ResultService` | `getQuestionResult`、`getAllResults`、`writeBack` | 006 |
| `PhaseMockControl`（mock only） | `advancePhase` | 隨 004 移除 |
| `JudgementMockControl`（mock only） | `simulateJudgement` | 隨 005 移除 |
| `ValidationMockControl`（mock only） | `failNextValidation` | 活動的隨 004、送出的隨 005 移除 |
| `UnexpectedErrorMockControl`（mock only） | `failNextCall` | 五個介面都換成真正的實作後移除 |
| `MockChoicePrompt`（mock only） | `onRequest`、`answer` | `auth` 與 `guidedNotes` 都換成真正的實作後移除 |
| `ChoiceRequest`（mock only） | `title: string`、`options: ChoiceOption[]`（1..*） | 同上 |
| `ChoiceOption`（mock only） | `id: string`、`label: string` | 同上 |

### `ServiceRegistry`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `auth`、`guidedNotes`、`activity`、`submission`、`result` | 對應介面 | 永遠存在 |
| `phaseControl` | `PhaseMockControl \| undefined` | `activity` 為模擬實作時存在 |
| `judgementControl` | `JudgementMockControl \| undefined` | `submission` 為模擬實作時存在 |
| `activityValidationControl` | `ValidationMockControl \| undefined` | `activity` 為模擬實作時存在 |
| `submissionValidationControl` | `ValidationMockControl \| undefined` | `submission` 為模擬實作時存在 |
| `unexpectedErrorControl` | `UnexpectedErrorMockControl \| undefined` | 任一介面為模擬實作時存在 |
| `choicePrompt` | `MockChoicePrompt \| undefined` | `auth` 或 `guidedNotes` 為模擬實作時存在 |
| `isMockMode()` | `boolean` | 任何一個介面為模擬實作時為 true（FR-005） |

`ServiceRegistry` 由組合根 `createServiceRegistry()` 建立；組合根記錄哪些介面綁定了模擬實作，`isMockMode()` 據此回傳。替換方式見 plan「替換模擬實作的方式」。

## 3. 模擬實作（類別圖 Mock Implementations）

### `MockFixtures`（固定資料）

| 欄位 | 內容 | 依據 |
| --- | --- | --- |
| `teacherAccount` | 模擬老師帳號的名稱與電子郵件 | M1 |
| `spreadsheets` | 三份學習單：「題組＋單題範本」（可編輯）、「單題範本」（僅檢視）、「表頭錯誤範例」 | M2 |
| `importResults` | 「題組＋單題範本」：4 題，其中 2 題為題組，共 6 個填空格；「單題範本」：6 題單題，6 個填空格；「表頭錯誤範例」：`ImportError` | M2；內容沿用 `docs/design/dark/T-Import.html`、`T-ImportError.html` |
| `activity` | 首頁與學生頁面看到的固定模擬活動：4 題、6 組 | M3 |
| `groupMembers` | 各組已加入人數，至少一組為 0 人 | M3 |
| `submissionsByQuestion` | 每題開放時的模擬送出列表：除最後一題外每題 2 組以上；最後一題沒有送出 | M4；內容沿用 `docs/design/dark/T-Live.html` |

模擬資料只是展示用的資料，不是預設值（spec Assumptions）。

### `MockSession`

每個分頁一份、重新整理即重置的模擬狀態，由所有 `Mock*Service` 共用。它同時實作 `MockChoicePrompt` 與 `UnexpectedErrorMockControl`，由組合根放進 `ServiceRegistry` 的 `choicePrompt`、`unexpectedErrorControl`。

| 欄位 | 說明 | 寫入者 | 讀取者 |
| --- | --- | --- | --- |
| `lastImport` | 最近一次辨識成功的 `ImportSuccess` | MockGuidedNotesService | MockActivityService（老師端活動的題目）、MockResultService（M8） |
| `teacherActivity` | 老師端建立、開放、結束題目後的 `Activity` | MockActivityService | MockSubmissionService、MockResultService |
| `viewerPhaseIndex` | 首頁與學生頁面看到的階段在 M7 序列中的位置 | MockActivityService（`advancePhase`） | MockActivityService（`getCurrentActivity`、`onPhaseChange`） |
| `submissions` | 各題的送出與判定（老師端的判定、學生端本組的送出） | MockSubmissionService | MockResultService |
| `pendingValidationFailure` | 活動與送出各一個旗標，由「模擬：驗證失敗」設定，下一次送出時消耗 | MockActivityService、MockSubmissionService | 同左 |
| `pendingUnexpectedError` | 由「模擬：非預期錯誤」（`failNextCall`）設定；下一次由按鈕觸發的模擬介面呼叫讀取並清除，以 `UnexpectedError`「模擬：連不上伺服器」reject（M9） | MockSession | 所有 `Mock*Service` |

| 方法 | 說明 |
| --- | --- |
| `requestChoice(request): Promise<string \| null>` | `MockAuthService`（M1）、`MockGuidedNotesService`（M2）發出選擇請求；經 `onRequest` 通知模擬控制列顯示，在 `answer` 被呼叫時以選項 id 或 `null`（關閉）完成 |
| `onRequest(listener)`、`answer(choiceId)` | `MockChoicePrompt` 的實作，見 [contracts/mock-controls.md](contracts/mock-controls.md) |
| `failNextCall()` | `UnexpectedErrorMockControl` 的實作 |

### 老師端與學生端的兩條模擬狀態

依 M3 與 M7，同一個分頁中有兩條互不影響的模擬狀態：

- **老師端**：`createActivity`、`updateSettings`、`openQuestion`、`endQuestion` 改變 `teacherActivity`。題目取自 `lastImport`；沒有 `lastImport` 時取自 `MockFixtures.activity`。
- **首頁與學生端**：`getCurrentActivity`、`onPhaseChange` 只反映 `viewerPhaseIndex`，只在 `advancePhase` 時改變，使用 `MockFixtures.activity`（4 題、6 組）。

### 狀態轉換

**首頁與學生端看到的階段（M7）**：

```text
NO_ACTIVITY → PREPARING → OPEN(1) → QUESTION_ENDED(1) → OPEN(2) → … → QUESTION_ENDED(4) → FINISHED
```

`FINISHED` 之後再推進，階段不變。重新整理回到 `NO_ACTIVITY`。

**老師端的活動**：

```text
（無）--createActivity--> PREPARING --openQuestion(1)--> OPEN(1) --endQuestion(1)--> QUESTION_ENDED(1)
      --openQuestion(2)--> OPEN(2) … --endQuestion(最後一題)--> FINISHED
```

**一筆送出的判定（001 的模擬實作）**：

```text
PENDING --judge / simulateJudgement(ACCEPTED)--> ACCEPTED
PENDING --judge / simulateJudgement(REJECTED)--> REJECTED --（學生重送）--> 新的一筆 PENDING
```

哪些送出可以判定、接受後其他送出如何呈現、重送的順位，由 005 定義（D10、D11、D16）。
