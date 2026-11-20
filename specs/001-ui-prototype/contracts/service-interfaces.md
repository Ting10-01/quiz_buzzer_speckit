# Contract: 頁面與服務之間的介面

頁面只透過下列介面取得結果（FR-003）。簽章與 [`diagrams/001-class.puml`](../../../diagrams/001-class.puml) 相同；實體欄位見 [data-model.md](../data-model.md)。001 為每個介面提供模擬實作（行為見 spec FR-060 的 M1–M9）；後續子功能新增真正的實作時必須遵守本契約，頁面不改。

## 共通規則

- 所有方法回傳 `Promise`；訂閱方法回傳 `Unsubscribe`（`() => void`），頁面離開時呼叫以停止接收。
- 預期中的失敗是回傳值，不是例外：`ValidationError`、`ImportError`、`SignInResult.ok = false`、`WriteBackResult.ok = false`、`pickSpreadsheet` 回傳 `null`（取消）。
- 非預期錯誤（例如連不上伺服器）以 `UnexpectedError`（`message`）reject；真正的實作必須把自己的非預期錯誤轉成 `UnexpectedError`，種類與訊息由負責的子功能定義。頁面捕捉後停留在原頁、不改變已輸入的內容，在共通的 `ErrorArea` 顯示 `message`；由確認視窗的按鈕引起時先關閉視窗；切換頁面或該頁下一次介面呼叫成功時清除（FR-009）。下列各表的「頁面如何呈現」只描述 Promise 完成時的情況。
- 頁面以 `shared/src/guards.ts` 的型別判斷函式區分聯集型別的回傳值。
- 回傳的物件是當下狀態的快照；頁面不得修改，也不得自行推導共享狀態（原則 V）。
- 驗證規則、可判定的條件、公布範圍等規則由各介面的負責子功能定義；001 的頁面只呈現回傳結果。

## AuthService（002 取代）

| 方法 | 回傳 | 呼叫的頁面與按鈕 | 頁面如何呈現 |
| --- | --- | --- | --- |
| `signInWithGoogle()` | `Promise<SignInResult>` | T-Login「用 Google 登入」 | `ok`：進入 T-Pick；否則留在 T-Login，在失敗訊息區顯示對應 `failure` 的訊息（FR-013） |
| `getCurrentAccount()` | `Promise<TeacherAccount \| null>` | T-Pick 載入時 | 顯示已登入帳號（FR-020） |

## GuidedNotesService（003 取代）

| 方法 | 回傳 | 呼叫的頁面與按鈕 | 頁面如何呈現 |
| --- | --- | --- | --- |
| `pickSpreadsheet()` | `Promise<Spreadsheet \| null>` | T-Pick「從 Google 雲端硬碟挑選」；T-Import、T-ImportError「重新挑選」 | `null`：留在原頁；否則接著呼叫 `readWorksheet` |
| `readWorksheet(spreadsheetId, worksheet)` | `Promise<ImportSuccess \| ImportError>` | 挑選後；T-Import 切換工作表；T-ImportError「重新讀取」 | `ImportSuccess`：T-Import（FR-021）；`ImportError`：T-ImportError（FR-022） |

## ActivityService（004 取代）

| 方法 | 回傳 | 呼叫的頁面與按鈕 | 頁面如何呈現 |
| --- | --- | --- | --- |
| `createActivity(settings)` | `Promise<Activity \| ValidationError>` | T-Setup（建立模式）「建立活動」 | `Activity`：T-Lobby；`ValidationError`：留在 T-Setup，在 `field` 對應的欄位旁顯示 `message`（FR-008） |
| `updateSettings(settings)` | `Promise<Activity \| ValidationError>` | T-Setup（修改模式）「儲存設定」 | 同上 |
| `openQuestion(n)` | `Promise<Activity>` | T-Lobby「開放第 1 題」；T-QuestionEnd「開放第 n+1 題」 | T-Live（第 n 題） |
| `endQuestion(n)` | `Promise<Activity>` | T-EndConfirm「結束並公布結果」 | `QUESTION_ENDED`：T-QuestionEnd；`FINISHED`：T-Results |
| `joinGroup(n)` | `Promise<Activity>` | S-Join「加入第 n 組」 | 依 `phase` 切換（spec「階段推動的切換」）；`PREPARING` 時為 S-Wait |
| `leaveGroup()` | `Promise<void>` | S-Wait「選錯組別？重新選擇」 | S-Join；服務不再記住本分頁的組別 |
| `getCurrentActivity()` | `Promise<Activity \| null>` | Main、S-Join 載入時；T-Lobby 載入時 | `null`：「目前沒有活動」（FR-010、FR-050） |
| `onPhaseChange(listener)` | `Unsubscribe` | Main、S-Join、S-Wait、S-Answer、S-Submitted、S-QuestionDone | 依 spec「階段推動的切換」表切換；Main 更新目前活動資訊 |
| `onActivityChange(listener)` | `Unsubscribe` | T-Lobby（以及其他顯示各組人數的老師端頁面） | 以通知的 `Activity` 更新各組已加入人數（spec「階段推動的切換」T-Lobby 列）。001 的模擬實作不會通知 |

## SubmissionService（005 取代）

| 方法 | 回傳 | 呼叫的頁面與按鈕 | 頁面如何呈現 |
| --- | --- | --- | --- |
| `submitAnswer(q, answers)` | `Promise<Submission \| ValidationError>` | S-Answer「整組送出」 | `Submission`：S-Submitted（等待判定）；`ValidationError`：留在 S-Answer 顯示錯誤 |
| `listSubmissions(q)` | `Promise<Submission[]>` | T-Live 載入時 | 依 `rank` 列出（FR-031） |
| `onSubmissionsChange(q, listener)` | `Unsubscribe` | T-Live | 以通知的完整列表取代目前的答案列表（spec「階段推動的切換」T-Live 列）。001 的模擬實作不會通知 |
| `judge(q, group, judgement)` | `Promise<Submission[]>` | T-Live 每列「接受」「不接受」 | 以回傳的列表更新每列的判定狀態與按鈕是否可用（FR-032） |
| `onJudgement(listener)` | `Unsubscribe` | S-Submitted | `ACCEPTED`：顯示「老師已接受本組答案」；`REJECTED`：S-Answer 被拒絕狀態（FR-055、FR-056） |

`answers` 的順序對應該題 `subQuestions` 的順序；題組整組一次送出（FR-052）。學生端沒有取得其他組別送出的方法（FR-054、原則 VI）。

**組別由服務判斷**：`joinGroup(n)` 成功後，服務記住本分頁所屬的組別；`submitAnswer`、`onJudgement`、`leaveGroup` 不傳組別，一律作用於本分頁的組別。頁面不得以任何方式指定其他組別。真正的實作由伺服器依連線身分判斷組別（原則 VI）；001 的模擬實作記在 `MockSession.joinedGroup`。尚未加入組別就呼叫這些方法屬於呼叫順序錯誤，頁面流程不會發生（S-Answer、S-Submitted 只能經 S-Join 進入）。

**老師端的即時更新**：`onActivityChange`、`onSubmissionsChange` 每次通知完整的快照，不通知差異；頁面直接以快照取代顯示的內容，不自行合併或推導（原則 V）。`judge(q, group, judgement)` 由老師指定要判定的組別，老師身分由 002 驗證。

## ResultService（006 取代）

| 方法 | 回傳 | 呼叫的頁面與按鈕 | 頁面如何呈現 |
| --- | --- | --- | --- |
| `getQuestionResult(q)` | `Promise<QuestionResult>` | 結束一題後的 T-QuestionEnd；S-QuestionDone | FR-034、FR-057 |
| `getAllResults()` | `Promise<QuestionResult[]>` | T-Live、T-QuestionEnd 的題目進度；T-Results；S-Results | FR-030、FR-040、FR-058 |
| `writeBack()` | `Promise<WriteBackResult>` | T-WriteBack「寫回」 | 關閉視窗，在 T-Results 顯示成功與格數，或失敗與原因（FR-042） |
