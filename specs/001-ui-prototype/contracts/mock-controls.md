# Contract: 模擬模式與模擬控制

只在模擬模式存在的介面與畫面元素（FR-005、FR-061）。這些介面只由 `MockModeBadge`、`MockControlBar` 使用，頁面不呼叫。

## 模擬模式的判定

| 條件 | 「模擬模式」標示 | 模擬控制列 |
| --- | --- | --- |
| `registry.isMockMode()` 為 true | 每頁固定位置顯示（FR-005、SC-003） | 顯示在標示旁，只列出下表中目前頁面可用、且對應控制存在的項目 |
| 五個介面都是真正的實作 | 不顯示 | 不顯示 |

## 模擬控制

| 控制 | 介面方法 | 存在條件（ServiceRegistry 欄位） | 出現的頁面 | 效果 |
| --- | --- | --- | --- | --- |
| 「模擬：推進到下一個階段」 | `PhaseMockControl.advancePhase(): Promise<Activity>` | `phaseControl` | Main、S-Join、S-Wait、S-Answer、S-Submitted、S-QuestionDone | 依 M7 推進首頁與學生端看到的階段，並經 `onPhaseChange` 通知頁面 |
| 「模擬：接受」「模擬：不接受」 | `JudgementMockControl.simulateJudgement(judgement): Promise<Submission>` | `judgementControl` | 只在 S-Submitted 的等待判定狀態 | 依 M6 產生本分頁所屬組別（`MockSession.joinedGroup`）最近一筆送出的判定，並經 `onJudgement` 通知頁面 |
| 「模擬：非預期錯誤」 | `UnexpectedErrorMockControl.failNextCall(): void` | `unexpectedErrorControl` | T-Login、T-Pick、T-Import、T-ImportError、T-Setup、T-Lobby、T-Live、T-QuestionEnd、T-Results、S-Join、S-Wait、S-Answer（FR-061） | 下一次模擬介面呼叫以 `UnexpectedError`「模擬：連不上伺服器」reject，之後恢復正常（M9）。點控制時頁面已載入完成，所以下一次呼叫就是展示者接著點的按鈕所觸發的呼叫 |
| 「模擬：驗證失敗」 | `ValidationMockControl.failNextValidation(): void` | T-Setup 用 `activityValidationControl`；S-Answer 用 `submissionValidationControl` | 只在 T-Setup 與 S-Answer | 該頁下一次「建立活動」「儲存設定」或「整組送出」回傳 `ValidationError`（`message` 為「模擬：驗證失敗」），之後恢復成功（M3、M5、US5 AC-8） |

控制列不屬於任何頁面的按鈕，不列入 spec「頁面與按鈕」表。目前頁面由 `AppRouter` 提供給 `MockControlBar`。

## 模擬選擇器

M1 的模擬帳號選擇與 M2 的模擬檔案選擇器由 `MockAuthService`、`MockGuidedNotesService` 經 `MockSession.requestChoice` 發出，由 `MockControlBar` 訂閱 `registry.choicePrompt` 並以 `ConfirmDialog` 顯示。

| 介面方法 | 說明 |
| --- | --- |
| `MockChoicePrompt.onRequest(listener: (request: ChoiceRequest) => void): Unsubscribe` | `signInWithGoogle()` 或 `pickSpreadsheet()` 被呼叫時，通知一個 `ChoiceRequest`（`title`、`options`） |
| `MockChoicePrompt.answer(choiceId: string \| null): void` | 使用者選擇選項（`ChoiceOption.id`）或關閉選擇器（`null`）；對應的 `signInWithGoogle()`／`pickSpreadsheet()` 的 Promise 才完成 |

| 請求來源 | 選項 | 結果 |
| --- | --- | --- |
| `signInWithGoogle()`（M1） | 模擬老師帳號／模擬非老師帳號／取消 | 成功／失敗 `NOT_TEACHER`／失敗 `CANCELLED` |
| `pickSpreadsheet()`（M2） | 題組＋單題範本／單題範本／表頭錯誤範例；關閉 | 對應的 `Spreadsheet`；關閉回傳 `null` |
