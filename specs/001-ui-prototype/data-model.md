# Data Model: 畫面與流程原型

本文件與 [`diagrams/001-class.puml`](../../diagrams/001-class.puml) 一一對應：類別名稱、欄位、關聯與類別圖相同。類別圖中以關聯表示的部分，在 TypeScript 中寫成欄位（下表「關聯欄位」）。類別圖於規劃期間依 plan「圖表的修訂」更新（commit `spec(001): clarify spec and diagrams`）。

型別位置：實體在 `shared/src/entities.ts`；介面在 `frontend/src/services/interfaces.ts`（契約見 [contracts/service-interfaces.md](contracts/service-interfaces.md)）。

## 1. 實體（類別圖 Entities）

| 實體 | 欄位 | 關聯欄位 | 對應 spec Key Entities |
| --- | --- | --- | --- |
| `Role`（enum） | `TEACHER`、`STUDENT` | — | 身分 |
| `TeacherAccount` | `name: string`、`email: string` | — | 老師帳號 |
| `SignInFailure`（enum） | `CANCELLED` | — | — |
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
| `QuestionResult` | `questionNumber: number`、`winner?: Submission`、`submissionCount: number`、`behindFirstMs: number[]` | `submissions: Submission[]`（0..*） | 題目結果 |
| `WriteBackResult` | `ok: boolean`、`cellCount: number`、`failureReason?: string` | — | 寫回結果 |
| `JudgeOutcome` | — | `submissions: Submission[]`（0..*）、`activity: Activity` | — |
| `ValidationError` | `field: string`、`message: string` | — | — |
| `UnexpectedError` | `message: string` | — | 非預期錯誤 |

### 規則與說明

- **題組算一題**：`Question` 是以題號為單位的一題；單題只有一個 `SubQuestion`（spec Key Entities）。`Submission.answers` 的順序對應 `Question.subQuestions` 的順序。
- **以 Google 登入的人即為老師**（FR-013）：Google 帳號無法提供是否為老師的資訊，`SignInFailure` 只有 `CANCELLED`；其他失敗種類（例如授權失敗）由 002 新增。
- **活動沒有名稱**（FR-023）：`Activity`、`ActivitySettings` 沒有名稱欄位。
- **`ActivityPhase` 與題號**：`OPEN`、`QUESTION_ENDED` 時 `currentQuestion` 必有值；沒有活動時 `getCurrentActivity()` 回傳 `null`，活動被取消時 `onPhaseChange` 通知 `null`，頁面據此顯示「目前沒有活動」（FR-010、FR-050、FR-051）。介面不以 `phase: NO_ACTIVITY` 的 `Activity` 表示沒有活動；`NO_ACTIVITY` 只用於 M7 模擬序列的起點與階段文字（research RD-12）。
- **「比第一名慢的秒數」**（FR-040）：由結果介面計算後放在 `QuestionResult.behindFirstMs`，與 `submissions` 同順序、單位為毫秒；頁面只換算成秒顯示，不自行計算（FR-003）。「第一名」的定義由 006 決定（D23）；001 的模擬實作以最早送出（`rank` 1）的 `elapsedMs` 為基準，第一名自己為 0。
- **判定狀態的種類由 005 定義**（FR-031）：001 的模擬實作使用 `PENDING`、`ACCEPTED`、`REJECTED`；`UNJUDGED` 保留給 005（D12）。
- **驗證規則**（組數範圍、空白答案等）不在 001 定義；實體本身不帶驗證規則（D4–D7、D14）。
- **`UnexpectedError`** 不是回傳值，而是介面 Promise reject 的值；種類與訊息由負責的子功能定義（FR-009）。

## 2. 介面層（類別圖 Service Interfaces）

| 介面 | 方法 | 取代模擬實作的子功能 |
| --- | --- | --- |
| `AuthService` | `signInWithGoogle`、`getCurrentAccount` | 002 |
| `GuidedNotesService` | `pickSpreadsheet`、`readWorksheet` | 003 |
| `ActivityService` | `createActivity`、`updateSettings`、`cancelActivity`、`openQuestion`、`endQuestion`、`joinGroup`、`leaveGroup`、`getCurrentActivity`、`onPhaseChange`、`onActivityChange` | 004 |
| `SubmissionService` | `submitAnswer`、`listSubmissions`、`onSubmissionsChange`、`judge`、`getGroupSubmission`、`onGroupSubmitted`、`onJudgement` | 005 |
| `ResultService` | `getQuestionResult`、`getAllResults`、`writeBack` | 006 |
| `PhaseMockControl`（mock only） | `advancePhase` | 隨 004 移除 |
| `JudgementMockControl`（mock only） | `simulateJudgement` | 隨 005 移除 |
| `TeammateMockControl`（mock only） | `simulateTeammateSubmission` | 隨 005 移除 |
| `ValidationMockControl`（mock only） | `failNextValidation` | 活動的隨 004、送出的隨 005 移除 |
| `UnexpectedErrorMockControl`（mock only） | `failNextCall` | 五個介面都換成真正的實作後移除 |
| `MockChoicePrompt`（mock only） | `onRequest`、`answer` | `auth` 與 `guidedNotes` 都換成真正的實作後移除 |
| `ChoiceRequest`（mock only） | `title: string`、`options: ChoiceOption[]`（1..*） | 同上 |
| `ChoiceOption`（mock only） | `id: string`、`label: string` | 同上 |

`joinGroup` 之後由服務記住本分頁的組別，`submitAnswer`、`getGroupSubmission`、`onGroupSubmitted`、`onJudgement`、`leaveGroup` 不傳組別（原則 VI）；`judge` 回傳 `JudgeOutcome`，其中的 `activity` 讓老師端在接受後依階段切換頁面（FR-032a）；`onActivityChange`、`onSubmissionsChange` 供老師端即時更新（R4）。簽章與規則見 [contracts/service-interfaces.md](contracts/service-interfaces.md)。

### `ServiceRegistry`

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `auth`、`guidedNotes`、`activity`、`submission`、`result` | 對應介面 | 永遠存在 |
| `phaseControl` | `PhaseMockControl \| undefined` | `activity` 為模擬實作時存在 |
| `judgementControl` | `JudgementMockControl \| undefined` | `submission` 為模擬實作時存在 |
| `teammateControl` | `TeammateMockControl \| undefined` | `submission` 為模擬實作時存在 |
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
| `submissionsByQuestion` | 每題開放時的模擬送出列表：除第 3 題外每題 2 組以上；第 3 題沒有送出 | M4；內容沿用 `docs/design/dark/T-Live.html` |
| `teammateAnswers` | 同組組員的模擬答案：「模擬：同組組員送出」時使用的固定答案，依題號 | M5 |
| `viewerSequence` | 首頁與學生頁面看到的階段序列（`ViewerStep[]`，每步為 `phase` 與 `currentQuestion?`）：`NO_ACTIVITY → PREPARING → OPEN(1) → QUESTION_ENDED(1) → … → OPEN(最後一題) → FINISHED`，最後一題不經過 `QUESTION_ENDED`；`MockSession.viewerPhaseIndex` 是它的位置 | M7 |

模擬資料只是展示用的資料，不是預設值（spec Assumptions）。

### `MockSession`

每個分頁一份、重新整理即重置的模擬狀態，由所有 `Mock*Service` 共用。它同時實作 `MockChoicePrompt` 與 `UnexpectedErrorMockControl`，由組合根放進 `ServiceRegistry` 的 `choicePrompt`、`unexpectedErrorControl`。

| 欄位 | 說明 | 寫入者 | 讀取者 |
| --- | --- | --- | --- |
| `lastImport` | 最近一次辨識成功的 `ImportSuccess` | MockGuidedNotesService | MockActivityService（老師端活動的題目）、MockResultService（M8） |
| `teacherActivity` | 老師端建立、開放、結束題目後的 `Activity`；`cancelActivity` 清除 | MockActivityService；MockSubmissionService（`judge(ACCEPTED)` 結束本題，M4） | MockSubmissionService、MockResultService |
| `joinedGroup` | 本分頁所屬的組別；`joinGroup` 設定、`leaveGroup` 清除 | MockActivityService | MockSubmissionService（`submitAnswer`、`getGroupSubmission`、`onGroupSubmitted`、`onJudgement`、`simulateJudgement`、`simulateTeammateSubmission`） |
| `viewerPhaseIndex` | 首頁與學生頁面看到的階段在 M7 序列中的位置 | MockActivityService（`advancePhase`）；MockSubmissionService（`simulateJudgement(ACCEPTED)` 推進一次，M6） | MockActivityService（`getCurrentActivity`、`onPhaseChange`） |
| `submissions` | 各題的送出與判定（老師端的判定、學生端本組的送出） | MockSubmissionService | MockResultService |
| `pendingValidationFailure` | 活動與送出各一個旗標，由「模擬：驗證失敗」設定，下一次送出時消耗 | MockActivityService、MockSubmissionService | 同左 |
| `pendingUnexpectedError` | 由「模擬：非預期錯誤」（`failNextCall`）設定；下一次由按鈕觸發的模擬介面呼叫讀取並清除，以 `UnexpectedError`「模擬：連不上伺服器」reject（M9） | MockSession | 所有 `Mock*Service` |

| 方法 | 說明 |
| --- | --- |
| `requestChoice(request): Promise<string \| null>` | `MockAuthService`（M1）、`MockGuidedNotesService`（M2）發出選擇請求；經 `onRequest` 通知模擬控制列顯示，在 `answer` 被呼叫時以選項 id 或 `null`（關閉）完成 |
| `onRequest(listener)`、`answer(choiceId)` | `MockChoicePrompt` 的實作，見 [contracts/mock-controls.md](contracts/mock-controls.md) |
| `failNextCall()` | `UnexpectedErrorMockControl` 的實作 |
| `consumeUnexpectedError(): boolean` | 讀取並清除 `pendingUnexpectedError`；各 `Mock*Service` 在介面方法開頭呼叫，回傳 `true` 時以 `UnexpectedError` reject（M9） |

### 老師端與學生端的兩條模擬狀態

依 M3 與 M7，同一個分頁中有兩條互不影響的模擬狀態：

- **老師端**：`createActivity`、`updateSettings`、`openQuestion`、`endQuestion` 與 `judge(ACCEPTED)` 改變 `teacherActivity`；`cancelActivity` 一律成功並清除 `teacherActivity`，不影響 `viewerPhaseIndex`（M3）。題目取自 `lastImport`；沒有 `lastImport` 時取自 `MockFixtures.activity`。`onActivityChange`、`onSubmissionsChange` 接受訂閱但不會通知，因為 M3、M4 的各組人數與送出列表是固定資料。
- **首頁與學生端**：`getCurrentActivity`、`onPhaseChange` 只反映 `viewerPhaseIndex`，只在 `advancePhase` 與 `simulateJudgement(ACCEPTED)` 時改變（兩者都經 `onPhaseChange` 通知），使用 `MockFixtures.activity`（4 題、6 組）。`onPhaseChange` 不會通知 `null`：序列只往前推進，不回到 `NO_ACTIVITY`，老師端的 `cancelActivity` 也不影響這條狀態（S11 由 004 觸發）。

### 狀態轉換

**首頁與學生端看到的階段（M7）**：

```text
NO_ACTIVITY → PREPARING → OPEN(1) → QUESTION_ENDED(1) → OPEN(2) → … → OPEN(4) → FINISHED
```

最後一題不經過 `QUESTION_ENDED`。`FINISHED` 之後再推進，階段不變。重新整理回到 `NO_ACTIVITY`。「模擬：接受」等同推進一次（M6）。

**老師端的活動**：

```text
（無）--createActivity--> PREPARING --openQuestion(1)--> OPEN(1) --endQuestion(1) 或 judge(ACCEPTED)--> QUESTION_ENDED(1)
      --openQuestion(2)--> OPEN(2) … --endQuestion(最後一題) 或 judge(ACCEPTED)--> FINISHED
PREPARING --cancelActivity--> （無）
```

只有 `PREPARING` 可以取消；開放第 1 題之後不能取消或提前結束（FR-026）。

`judge(ACCEPTED)` 結束本題，回傳的 `JudgeOutcome.activity` 為結束後的階段（FR-032a、M4）。

**一筆送出的判定（001 的模擬實作）**：

```text
PENDING --judge / simulateJudgement(ACCEPTED)--> ACCEPTED（本題結束）
PENDING --judge / simulateJudgement(REJECTED)--> REJECTED（終止，該組本題不能再送出）
```

老師端只有最早一筆 `PENDING` 可判定；不接受後輪到下一筆（M4）。每組每題只送出一次，本人或同組組員送出都算（M5、FR-056、FR-056a）。001 的規則不代表最終規則，005 可依 D10、D11 修改。
