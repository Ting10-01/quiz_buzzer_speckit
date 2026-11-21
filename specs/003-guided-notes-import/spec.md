# Feature Specification: 匯入學習單

**Feature Branch**: `003-guided-notes-import`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "子功能 003 匯入學習單（依 docs/feature-split.md）：R2、R2.1、R2.2、E1（解析題組結構）。從線上 Google Sheets 匯入學習單，顯示以題號表示的題目清單、題數與每題（含題組各小題）的填空格；依據含助教補充（10/21）。實作 001 的 GuidedNotesService（pickSpreadsheet 用 Google Picker，readWorksheet 經伺服器讀取並解析），回傳 001 的 Spreadsheet、ImportSuccess、ImportError；處理 001 的 D2、D3；提供 ImportStore.latest() 給 004、006。Google 授權由 002 提供。"

**追溯**: `docs/assignment.md` R2、R2.1、R2.2、E1（解析題組結構）；助教補充（10/21）；001 spec D2、D3

**圖表**: `diagrams/003-component.puml`、`diagrams/003-class.puml`、`diagrams/003-sequence.puml`

**相依**: 上游為 001（頁面、`GuidedNotesService` 介面與實體）、002（Google 授權、老師身分驗證、伺服器骨架）；下游為 004（建立活動時取題目）、006（寫回目標）

## 範圍

本子功能涵蓋 `docs/feature-split.md` 中 003 的範圍：

- **R2**：老師從自己 Google 雲端硬碟上的 Google 試算表匯入學習單。
- **R2.1**：系統辨識出的題數與學習單一致。
- **R2.2**：不要求題目敘述，以題號表示題目。
- **E1（解析題組結構）**：辨識題組與其中的小題，讓 005 能整組送出。
- **助教補充（10/21）**：直接讀取線上的 Google Sheets，不下載成 .xlsx 檔處理。

做法：實作 001 定義的 `GuidedNotesService`（`pickSpreadsheet`、`readWorksheet`），在 `createServiceRegistry()` 把它換成真正的實作。001 的頁面（T-Pick、T-Import、T-ImportError）不改，只呈現本子功能回傳的結果。

不在本子功能範圍內：

| 事項 | 負責子功能 |
| --- | --- |
| 老師用 Google 帳號登入、取得 Google 授權、驗證老師身分 | 002 |
| 用匯入的題目建立活動 | 004 |
| 題組整組送出 | 005 |
| 把答案寫回填空格、寫回前的版面檢查與備份 | 006 |

### 001 交給本子功能的事項

| # | 規則 | 本子功能的決定 |
| --- | --- | --- |
| D2 | 找不到表頭時不匯入任何題目，原本的題目清單也不變動 | 沿用，並擴大到所有內容錯誤（REQ-IMP-12、REQ-IMP-14） |
| D3 | 挑選學習單時關閉檔案選擇器，原本的辨識結果不變 | 沿用（REQ-IMP-01、REQ-IMP-14） |

## Clarifications

### Session 2026-11-21

- Q: 找不到表頭時怎麼辦（001 D2）？ → A: 拒絕匯入，回傳 `ImportError`（`code` 為 `NO_HEADER`），附學習單目前的表頭文字（`foundHeaders`）、系統認得的表頭寫法（`acceptedHeaders`）與修正方式（`fixSteps`）；伺服器記住的題目清單與畫面上原本的題目清單都不變（REQ-IMP-05、REQ-IMP-14）。
- Q: 挑選學習單時關閉檔案選擇器怎麼辦（001 D3）？ → A: `pickSpreadsheet()` 回傳 `null`，不呼叫伺服器，原本的辨識結果不變（REQ-IMP-01、REQ-IMP-14）。
- Q: 表頭同義詞要不要保留？能不能手動指定欄位？ → A: 保留同義詞（題號／編號／題次、作答／答案／回答、題目／問題／題幹）；不提供手動指定欄位（REQ-IMP-04）。
- Q: 怎麼判斷題組？ → A: 題號儲存格跨列合併就是題組，合併範圍內每一列的作答欄儲存格是一個小題的填空格（REQ-IMP-08）。
- Q: 題數有上限嗎？題號有什麼規則？ → A: 最多 200 題；題號不重複、由上到下遞增、可以跳號（REQ-IMP-06）。
- Q: 填空格裡的「（1）」這類小題標記怎麼處理？ → A: 讀出來記在小題上，006 寫回時保留在答案前面（REQ-IMP-09）。001 的 `SubQuestion` 沒有放標記的欄位，列入「需請 001 修改」。
- Q: 填空格已經有舊答案時要不要提醒？ → A: 不做舊答案提醒；填空格中標記以外的文字不影響匯入（REQ-IMP-09）。
- Q: 老師只有檢視權限時怎麼辦？ → A: 照常匯入，`Spreadsheet.editable = false`；不另外顯示「無法寫回」的警告，T-Import 依 `editable` 顯示「僅檢視」（REQ-IMP-11）。
- Q: 001 的確認辨識結果頁按「確認匯入，下一步」沒有介面呼叫，伺服器怎麼知道老師確認了哪一份？ → A: 伺服器以最近一次成功的 `readWorksheet` 結果為準，存在 `ImportStore`；004、006 以 `ImportStore.latest()` 取得（REQ-IMP-15）。
- Q: Google 授權由誰處理？ → A: 由 002 提供（`GoogleClientProvider.authorizedClient()`、`GET /api/auth/picker-token`、`requireTeacher`）；003 只引用，不另做授權或解除連結（REQ-IMP-02）。
- Q: 除了找不到表頭，其他錯誤怎麼回傳？ → A: 學習單內容或權限的問題（沒有題目、題號重複或不遞增、超過 200 題、某題沒有填空格、沒有讀取權限、找不到工作表）都用 `ImportError` 的 `code`／`reason`／`fixSteps` 表達；連不上 Google 或伺服器、老師登入失效用 `UnexpectedError`（REQ-IMP-12、REQ-IMP-13）。001 的找不到表頭頁目前只為表頭錯誤設計，列入「需請 001 修改」。
- Q: 匯入結果存在哪裡？ → A: 只存在伺服器記憶體，伺服器重新啟動後就沒有（REQ-IMP-15）。
- Q: 題組的題目敘述放在哪裡？001 的 `Question` 只有一個 `text`。 → A: 題組的 `text` 依小題順序，把每個小題那一列的題目欄文字用換行連起來，每行前面加上該小題的標記（沒有標記時用「（n）」）；不另外請 001 加欄位（REQ-IMP-07）。
- Q: 一份試算表有多個工作表時，預設讀哪一個？ → A: 第一個找得到表頭列的工作表；都找不到時用第一個工作表（REQ-IMP-03）。
- Q: 找不到表頭時，「學習單目前的表頭文字」從哪裡來？ → A: 工作表由上往下第一個有 2 個以上非空白儲存格的列，依欄由左到右列出這些文字；沒有這樣的列時為空清單（REQ-IMP-05）。
- Q: 活動進行中老師能不能重新匯入？ → A: 003 不另外檢查。活動存在時老師登入後直接回到控制台（004 的 D21 決定），到不了挑選學習單頁，所以不會在活動中改變 `ImportStore`。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 從自己的 Google 試算表匯入單題學習單 (Priority: P1)

老師登入後在挑選學習單頁按「從 Google 雲端硬碟挑選」，Google 的檔案選擇器只列出 Google 試算表。老師挑一份後，系統直接讀取線上的試算表，找出表頭與每一題，在確認辨識結果頁列出題號、題數與每題的填空格位置。

**Why this priority**: 沒有題目就不能搶答；助教規定要直接讀線上的 Google Sheets。

**Independent Test**: 把單題範本複製到老師的雲端硬碟，挑選它，確認辨識結果頁顯示 6 題（題號 1–6），每題一個填空格；伺服器的 `ImportStore.latest()` 回傳同一份結果。

**Acceptance Scenarios**:

1. **AC-01** **Given** 老師的雲端硬碟有單題範本的副本（6 題），**When** 老師在檔案選擇器挑選它，**Then** 確認辨識結果頁顯示試算表標題、「可編輯」、表頭在第 4 列（題號 B 欄、題目 C 欄、作答 G 欄）、6 題、0 個題組、6 個填空格，題號 1–6 的填空格依序為 G5、G7、G9、G11、G13、G15。
2. **AC-02** **Given** AC-01 讀取成功，**When** 004 或 006 呼叫 `ImportStore.latest()`，**Then** 取得與畫面相同的結果（試算表、工作表、題目與填空格）。
3. **AC-03** **Given** 一份與範本結構相同、但表頭移到第 7 列、題號在 D 欄、題與題之間空兩列的試算表，**When** 匯入，**Then** 正確辨識所有題號與填空格，不需要修改程式。
4. **AC-04** **Given** 一份沒有題目欄的學習單，**When** 匯入，**Then** 照常匯入，每題只有題號，沒有題目敘述；學習單有題目欄時，每題帶有該列題目欄的文字。
5. **AC-05** **Given** 試算表有「說明」「學習單」兩個工作表，只有「學習單」有表頭，**When** 老師挑選它，**Then** 工作表清單依試算表順序列出兩個名稱，預設讀取「學習單」。
6. **AC-06** **Given** 確認辨識結果頁顯示「學習單」的結果，**When** 老師切換到另一個工作表，**Then** 系統讀取該工作表；成功時畫面與 `ImportStore.latest()` 都換成新工作表的結果。
7. **AC-07** **Given** 老師對挑選的試算表只有檢視權限，**When** 匯入，**Then** 照常顯示辨識結果，`editable` 為 false（頁面顯示「僅檢視」），沒有其他警告。
8. **AC-08** **Given** 一份表頭寫「編號」「答案」的學習單，**When** 匯入，**Then** 自動找到題號欄與作答欄。
9. **AC-09** **Given** 題號依序為 1、2、4 的學習單，**When** 匯入，**Then** 顯示 3 題，題號為 1、2、4。
10. **AC-10** **Given** 匯入前後，**When** 比對試算表，**Then** 試算表的任何儲存格都沒有被修改。

---

### User Story 2 - 匯入含題組的學習單 (Priority: P1)

學習單中有些題目是題組：題號儲存格跨多列合併，每一列各有一個填空格，填空格內預先寫著「（1）」「（2）」。系統辨識出題組與小題，記下每個小題的填空格與標記。

**Why this priority**: 作業提供題組範本，助教可能用題組學習單測試；E1 的整組送出（005）以此為前提。

**Independent Test**: 匯入題組範本的副本，確認辨識結果頁顯示 4 題，其中第 1、2 題為各 2 小題的題組。

**Acceptance Scenarios**:

1. **AC-11** **Given** 題組範本（題號 1 的 B5:B6、題號 2 的 B8:B9 跨兩列合併，題號 3、4 為單題），**When** 匯入，**Then** 顯示 4 題、2 個題組、6 個填空格；第 1 題為題組・2 小題（G5、G6），第 2 題為題組・2 小題（G8、G9），第 3 題 G11、第 4 題 G13。
2. **AC-12** **Given** 小題的填空格內有「（1）」「（2）」，**When** 匯入，**Then** 每個小題記下該標記，006 寫回時可保留在答案前面。
3. **AC-13** **Given** 某個題號儲存格跨 3 列合併，**When** 匯入，**Then** 該題組有 3 個小題（小題數不固定）。
4. **AC-14** **Given** 某個單題的填空格內有人工加上的「（1）」，**When** 匯入，**Then** 仍依題號儲存格沒有跨列合併判定為單題。
5. **AC-15** **Given** 題組範本，**When** 匯入，**Then** 第 1 題的題目敘述為兩行：「（1）」接 C5 的文字、「（2）」接 C6 的文字。

---

### User Story 3 - 學習單有問題或連線失敗時清楚處理 (Priority: P2)

老師關閉選擇器、學習單格式不符、權限不足或連不上 Google 時，系統說明原因與修正方式，不猜測欄位、不匯入錯誤的題目，也不影響原本的結果。

**Why this priority**: 原則 IV、VII 要求無法解析時清楚回報而不猜測；助教會用另一份學習單測試。

**Independent Test**: 依序關閉選擇器、挑選表頭錯誤、題號重複、只有說明文字的學習單，並在斷網時讀取；每種情況都得到正確的結果，`ImportStore.latest()` 保持前一次成功的內容。

**Acceptance Scenarios**:

1. **AC-16** **Given** 老師開啟了檔案選擇器，**When** 沒有挑選就關閉，**Then** `pickSpreadsheet()` 回傳 `null`，頁面留在原處，原本的辨識結果與 `ImportStore.latest()` 不變（D3）。
2. **AC-17** **Given** 工作表的表頭寫「No.」「內容」「學生填寫」，**When** 匯入，**Then** 回傳 `ImportError`：`code` 為 `NO_HEADER`，`foundHeaders` 為「No.」「內容」「學生填寫」，`acceptedHeaders` 列出題號欄、作答欄、題目欄各接受的寫法，`fixSteps` 說明怎麼改表頭後按「重新讀取」；找不到表頭頁顯示這些內容。
3. **AC-18** **Given** `ImportStore` 已有一份成功的結果，**When** 新的讀取回傳任何 `ImportError`，**Then** `ImportStore.latest()` 仍是原本那一份（D2）。
4. **AC-19** **Given** 題號重複，或沒有由上到下遞增（例如題號 3 出現在題號 2 的上方），**When** 匯入，**Then** 回傳 `INVALID_NUMBERING`，`reason` 指出有問題的題號與所在列。
5. **AC-20** **Given** 表頭以下沒有任何題號，**When** 匯入，**Then** 回傳 `NO_QUESTIONS`。
6. **AC-21** **Given** 學習單有 201 題，**When** 匯入，**Then** 回傳 `TOO_MANY_QUESTIONS`，`reason` 說明上限是 200 題。
7. **AC-22** **Given** 某題的作答欄儲存格被合併進上一題的填空格，**When** 匯入，**Then** 回傳 `NO_BLANK`，`reason` 指出題號與所在列。
8. **AC-23** **Given** 老師已不能讀取這份試算表（例如檔案被刪除或權限被移除），**When** 在找不到表頭頁按「重新讀取」，**Then** 回傳 `NO_ACCESS`，`fixSteps` 說明用「重新挑選」從雲端硬碟再挑一次。
9. **AC-24** **Given** 挑選後、讀取前，老師把工作表改名，**When** 讀取原本的工作表名稱，**Then** 回傳 `NO_WORKSHEET`，`fixSteps` 說明重新挑選。
10. **AC-25** **Given** 系統連不上 Google（斷網或 Google 沒有回應），**When** 挑選或讀取，**Then** 15 秒內以 `UnexpectedError`（「連不上 Google，請稍後再試」；Picker 載入不了時為「無法載入 Google 檔案選擇器，請確認網路連線」）結束，頁面留在原處並在共通錯誤訊息區顯示；`ImportStore` 不變。
11. **AC-26** **Given** 一個沒有老師憑證或憑證已失效的請求，**When** 呼叫 003 的任何伺服器 API，**Then** 伺服器拒絕（由 002 的 `requireTeacher` 判斷），不讀取任何試算表；前端以 `UnexpectedError` 顯示請老師重新登入。

---

### Edge Cases

- 題號存成文字「1」、數字 1 或 1.0，或全形數字「１」：都視為題號 1。
- 題號欄出現非正整數內容（例如章節標題、0、1.5、空白）：該列不是題目，略過。
- 題號儲存格跨列合併：只有合併範圍的第一列有題號，其餘列屬於同一題組，不另外算題。
- 填空格跨欄合併（例如 G5:H5）：填空格是合併範圍的左上角（G5）。
- 填空格內是「（2）堆疊」：標記記為「（2）」，其餘文字不影響匯入，也不提醒。
- 填空格內只有空白、底線或沒有內容：照常是填空格，沒有標記。
- 標記寫成半形「(1)」或全半形混用「（1)」：都算標記，原樣記下。
- 表頭儲存格是合併儲存格（例如 G4:H4）：欄位取合併範圍最左欄。
- 「學生作答」「答案說明」這類只「包含」同義詞的表頭：不算，需完全相同（去除前後空白後）。
- 試算表很大但題數在 200 以內：照常匯入。
- 挑選後在讀取前，老師修改了試算表：以讀取當下的內容為準。
- 老師在活動結束後又匯入另一份學習單：`ImportStore` 換成新的那一份。
- 伺服器重新啟動：`ImportStore.latest()` 回傳 `null`，老師需要重新匯入。

## Requirements *(mandatory)*

### Functional Requirements

#### 挑選與讀取

- **REQ-IMP-01**（R2、助教補充 10/21、001 D3）：`pickSpreadsheet()` MUST 開啟 Google 的檔案選擇器，只列出老師雲端硬碟中的 Google 試算表；老師挑選後 MUST 回傳該試算表的 `Spreadsheet`（`id`、`title`、`editable`、`worksheets`、`selectedWorksheet`）。老師關閉選擇器時 MUST 回傳 `null`，不呼叫伺服器。系統 MUST 直接讀取線上的試算表，不要求老師下載或上傳檔案。
- **REQ-IMP-02**（R2、助教補充 10/21）：讀取試算表 MUST 使用 002 取得的老師 Google 授權；003 的伺服器 API MUST 只接受已登入的老師（002 的 `requireTeacher`），沒有老師憑證或憑證失效時不讀取任何試算表。003 不另外取得、保存或解除 Google 授權；學生不需要 Google 帳號。
- **REQ-IMP-03**（R2）：`Spreadsheet.worksheets` MUST 依試算表中的順序列出所有工作表名稱；`selectedWorksheet` MUST 是第一個找得到表頭列（REQ-IMP-04）的工作表，都找不到時為第一個工作表。`readWorksheet(spreadsheetId, worksheet)` MUST 讀取指定名稱的工作表，切換工作表與「重新讀取」都經由它。

#### 解析規則

- **REQ-IMP-04**（R2、原則 IV）：系統 MUST 在執行期找出表頭列：由上往下第一個同時含有題號欄表頭與作答欄表頭的列。比對前去除儲存格文字前後的空白（含全形空白），之後必須與下列寫法之一完全相同：題號欄「題號／編號／題次」、作答欄「作答／答案／回答」、題目欄「題目／問題／題幹」。同一列有題目欄表頭時記為題目欄，可以沒有。表頭儲存格是合併儲存格時，欄位取合併範圍最左欄。系統 MUST NOT 預設任何固定的列、欄或儲存格位置，也不提供手動指定欄位。
- **REQ-IMP-05**（原則 IV、VII、001 D2）：選定的工作表找不到表頭列時，`readWorksheet` MUST 回傳 `ImportError`：`code` 為 `NO_HEADER`；`reason` 說明在哪個工作表找不到同時寫著題號欄與作答欄表頭的列，所以沒有匯入任何題目；`foundHeaders` 為工作表由上往下第一個有 2 個以上非空白儲存格的列中、由左到右的文字（沒有時為空清單）；`acceptedHeaders` 為三種欄位各接受的寫法（例如「題號欄：題號、編號、題次」「作答欄：作答、答案、回答」「題目欄（可以沒有）：題目、問題、題幹」）；`fixSteps` 說明把表頭改成其中一種寫法後按「重新讀取」。系統 MUST NOT 猜測欄位位置。
- **REQ-IMP-06**（R2.1）：表頭列以下，題號欄中每一個正整數儲存格代表一題。數字 1、1.0 與文字「1」（含全形數字）都是題號 1；0、負數、小數與其他文字不是題號，該列略過。題號 MUST 不重複、由上到下嚴格遞增，可以跳號；題數 MUST 介於 1 到 200。辨識出的題數 MUST 等於學習單上的題號數量，`questions` 依題號由小到大排列。
- **REQ-IMP-07**（R2.2）：系統 MUST NOT 要求題目敘述。有題目欄時：單題的 `text` 為該列題目欄的文字；題組的 `text` 依小題順序，把每個小題那一列的題目欄文字用換行連接，每行前面加上該小題的標記（沒有標記時用「（n）」，n 為小題順序）。題目欄儲存格是合併儲存格時讀左上角。沒有題目欄、或文字都是空白時，該題沒有 `text`，只以題號表示。
- **REQ-IMP-08**（E1）：題號儲存格位於跨多列的合併範圍時，該題 MUST 判定為題組（`type` 為 `GROUP`），合併範圍內每一列在作答欄的儲存格各為一個小題的填空格；沒有跨列合併的題號為單題（`SINGLE`），只有一個小題。是否為題組只依題號儲存格的合併範圍判定，不依填空格內的標記判定。
- **REQ-IMP-09**（E1、R5.1 的前提）：填空格文字開頭若有小題標記（全形「（n）」、半形「(n)」或全半形混用），系統 MUST 原樣記為該小題的標記，供 006 寫回時保留在答案前面；沒有標記時標記為空字串。填空格中標記以外的文字 MUST NOT 影響匯入，系統也不提醒舊答案。
- **REQ-IMP-10**（R5.1 的前提、原則 IV）：每個小題 MUST 記錄填空格位置（A1 表示法，例如「G5」）與小題順序（`index`，從 1 起算）。作答欄儲存格是合併儲存格時，填空格是合併範圍的左上角；該儲存格屬於從上一列開始的合併範圍時，這一列不是獨立的填空格，不算小題。這些位置是解析的結果，不是預設值。
- **REQ-IMP-11**（R5 的前提）：`Spreadsheet.editable` MUST 反映目前老師的 Google 帳號能否編輯這份試算表。只有檢視權限時照常匯入，`editable` 為 false，不另外回傳警告。

#### 錯誤與狀態

- **REQ-IMP-12**（原則 VII）：下列情況 `readWorksheet` MUST 回傳 `ImportError`，`reason` 指出原因（可以指出位置時附上工作表、列與題號），`fixSteps` 列出老師能自己做的修正步驟，`foundHeaders`、`acceptedHeaders` 為空清單：

  | `code` | 情況 |
  | --- | --- |
  | `NO_QUESTIONS` | 表頭列以下沒有任何題號 |
  | `INVALID_NUMBERING` | 題號重複，或沒有由上到下遞增 |
  | `TOO_MANY_QUESTIONS` | 超過 200 題 |
  | `NO_BLANK` | 某一題沒有任何獨立的填空格（REQ-IMP-10） |
  | `NO_ACCESS` | 目前老師的 Google 帳號讀不到這份試算表 |
  | `NO_WORKSHEET` | 試算表中沒有指定名稱的工作表 |

- **REQ-IMP-13**（原則 VII）：連不上伺服器、伺服器 15 秒內連不上 Google、老師憑證或 Google 授權失效，以及其他非預期的失敗，`pickSpreadsheet`、`readWorksheet` MUST 以 `UnexpectedError` reject，`message` 說明原因與下一步（例如「連不上 Google，請稍後再試」「Google 授權已失效，請回首頁重新登入」「老師登入已失效，請回首頁重新登入」；與 002 的訊息一致）。`pickSpreadsheet` 在挑選後讀不到試算表的基本資料時（`pickSpreadsheet` 不能回傳 `ImportError`），也以 `UnexpectedError` reject，`message` 說明重新挑選。
- **REQ-IMP-14**（001 D2、D3）：`readWorksheet` 回傳 `ImportError` 或 reject、`pickSpreadsheet` 回傳 `null` 或 reject 時，`ImportStore` 的內容 MUST 保持不變。
- **REQ-IMP-15**（R2、001 確認匯入沒有介面呼叫）：每次 `readWorksheet` 成功時，伺服器 MUST 以這次的 `ImportSuccess` 取代 `ImportStore` 的內容；`ImportStore.latest()` MUST 回傳最近一次成功的結果，從未成功時回傳 `null`。結果只存在伺服器記憶體，伺服器重新啟動後為 `null`。004 與 006 只能讀取，不得修改。
- **REQ-IMP-16**（R2）：`ImportSuccess` MUST 包含：`spreadsheet`（`selectedWorksheet` 為這次讀取的工作表）、`headerRow`（表頭所在列，從 1 起算）、`headerColumns`（依「題號欄、題目欄（有才列）、作答欄」順序的欄字母，例如 `["B", "C", "G"]`）與 `questions`，足以讓 T-Import 顯示 001 FR-021 列出的內容。
- **REQ-IMP-17**（R2）：匯入 MUST 只讀取試算表，不修改任何儲存格；寫回是 006 的工作。

### Key Entities

本子功能不新增前端實體，使用 001 `data-model.md` 的實體；欄位的意義由本子功能定義如下。

- **Spreadsheet**（學習單）：`id`（Google 試算表 ID）、`title`、`editable`（REQ-IMP-11）、`worksheets`（REQ-IMP-03）、`selectedWorksheet`。
- **Question**（題目）：`number`（題號）、`type`（`SINGLE`／`GROUP`，REQ-IMP-08）、`text`（可以沒有，REQ-IMP-07）、`subQuestions`。
- **SubQuestion**（小題）：`index`（從 1 起算）、`blankCell`（A1 表示法，REQ-IMP-10）、`marker`（小題標記，REQ-IMP-09；需 001 新增，見下節）。
- **ImportSuccess**（辨識結果）：見 REQ-IMP-16。
- **ImportError**（辨識錯誤）：`code`（REQ-IMP-05、REQ-IMP-12 的代碼之一）、`reason`、`foundHeaders`、`acceptedHeaders`、`fixSteps`。
- **ImportStore**（伺服器）：最近一次成功的 `ImportSuccess`，提供 `latest()` 給 004、006（REQ-IMP-15）。

## 需請 001 修改

| # | 要改什麼 | 為什麼 |
| --- | --- | --- |
| 1 | `data-model.md`、`diagrams/001-class.puml`、`shared/src/entities.ts` 的 `SubQuestion` 新增欄位 `marker: string`（填空格原有的小題標記，例如「（1）」；沒有時為空字串）；`MockFixtures` 的題組範本小題帶上「（1）」「（2）」 | 寫回時要保留小題標記（REQ-IMP-09、006），`ImportStore.latest()` 回傳的 `ImportSuccess` 必須帶著它；目前 `SubQuestion` 只有 `index`、`blankCell` |
| 2 | T-ImportError 改為所有 `ImportError` 共用的「無法匯入」頁：頁面標題與說明改用 `reason`，不寫死「找不到表頭」；`foundHeaders`、`acceptedHeaders` 為空清單時不顯示這兩區；spec FR-022、頁面清單的名稱「老師：找不到表頭」一併修改 | 除了 `NO_HEADER`，`NO_QUESTIONS`、`INVALID_NUMBERING`、`TOO_MANY_QUESTIONS`、`NO_BLANK`、`NO_ACCESS`、`NO_WORKSHEET` 也用 `ImportError` 回傳（REQ-IMP-12），目前的頁面只為表頭錯誤設計 |
| 3 | 請確認 `MockFixtures` 的 `headerColumns` 依「題號欄、題目欄（有才列）、作答欄」順序、`blankCell` 用 A1 表示法（例如「G5」）；不同時請改成一致 | 讓模擬實作與真正的實作回傳同樣格式，T-Import 的顯示不必因換實作而改（REQ-IMP-16） |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：兩份作業範本的副本匯入後，題數、題號、題型與填空格位置 100% 正確（單題範本 6 題；題組範本 4 題，其中 2 個題組、各 2 小題）。
- **SC-002**：把範本的表頭、題號欄、作答欄移到其他位置、改用同義詞表頭、增減間隔列所得的至少 3 份變形試算表，不修改程式就全部正確匯入。
- **SC-003**：REQ-IMP-05 與 REQ-IMP-12 的 7 種 `ImportError` 都有指出原因的 `reason` 與至少一條 `fixSteps`，老師不看程式就能自行修正。
- **SC-004**：200 題以內的試算表，網路正常時，從在檔案選擇器挑選完成到看到辨識結果在 5 秒內完成。
- **SC-005**：任何失敗或取消之後，`ImportStore.latest()` 與失敗前相同的比例為 100%。
- **SC-006**：連不上 Google 時，100% 在 15 秒內結束並顯示錯誤，不會一直停在讀取中。

## Assumptions

- 老師把學習單放在自己的 Google 雲端硬碟（作業範本先複製一份），並用 002 的 Google 登入取得授權；Google Cloud 專案與環境變數的設定由 002 說明。
- 助教的學習單版面可能和範本不同；表頭文字在同義詞清單內就能自動辨識，不在清單內時拒絕匯入並說明可用的寫法。題組仍以題號欄跨列合併表示。
- 一次只處理一份學習單、一位老師；每次讀取成功都會取代前一份結果。
- 執行系統的電腦可以連上 Google；學生分頁不連 Google。
- 表頭同義詞、最多 200 題是組內自訂規則，需與 OpenSpec 組保持一致。
- 老師在活動存在期間到不了挑選學習單頁（004 的 D21 決定），所以 003 不檢查活動階段。
