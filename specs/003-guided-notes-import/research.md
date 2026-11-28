# Research: 匯入學習單

**Feature**: `003-guided-notes-import` | **Date**: 2026-11-21 | **Plan**: [plan.md](plan.md)

整個專案共用的技術選擇沿用 001 的 [research.md](../001-ui-prototype/research.md) RD-01～RD-08（React + Vite、Node.js 24 + TypeScript + Fastify、npm workspaces `frontend/` `shared/` `server/`、pino、Vitest、Playwright），本文件不另選框架。002 提供伺服器骨架、老師身分驗證與 Google 授權。本文件只記錄 003 自己要決定的事。解析規則沿用舊 `001-guided-notes-import` 的 research R5～R7，拿掉 Google 授權（移到 002）、舊答案警告、READ_ONLY 警告與預覽／確認 API。

## R1. 讀取試算表：Sheets API v4 ＋ Drive API v3

- **Decision**:
  - 伺服器以 `@googleapis/sheets`、`@googleapis/drive`（官方拆分套件）讀取，連線用 002 的 `app.googleClients.authorizedClient()`（`GoogleClientProvider`）。
  - 一次 `spreadsheets.get`：`includeGridData=true`，`fields=properties.title,sheets(properties(sheetId,title,index),merges,data(rowData(values(formattedValue,effectiveValue))))`，取得所有工作表的儲存格與合併範圍。
  - 另一次 Drive `files.get`：`fields=capabilities/canEdit`，得到 `editable`（REQ-IMP-11）。兩個請求同時送出。
  - `describe` 與 `read` 都用同一個 `SpreadsheetReader.load()`，各讀一次。
  - 每個請求逾時 15 秒（SC-006）。錯誤對應：Google 回 403、404 → `SheetsReadError('NO_ACCESS')`；逾時、網路錯誤、5xx → `SheetsReadError('UNAVAILABLE')`；002 的 `isGoogleAuthExpired(error)` 為 true → `SheetsReadError('AUTH_EXPIRED')`；`authorizedClient()` 丟出的 `TeacherNotSignedInError` 照原樣往上丟；其他錯誤照原樣丟出，由 002 的錯誤處理轉成 `500 INTERNAL`。
- **Rationale**: 一次請求就有內容與合併範圍；不用 `ranges` 參數，就不必處理工作表名稱的跳脫，也能在 `describe` 時對每個工作表找表頭（REQ-IMP-03）。教學用的學習單很小，200 題以內遠低於 SC-004 的 5 秒。
- **ponytail**: 一次讀整份試算表的所有工作表。試算表有很多大型工作表時會變慢；真的遇到時，`read` 改成以 `ranges` 只讀指定工作表。
- **Alternatives considered**: `spreadsheets.values.get`（拿不到合併範圍，無法判斷題組）；完整的 `googleapis` 套件（太大）；先讀名稱再逐一讀工作表（多次往返）。

## R2. 檔案選擇器：Google Picker

- **Decision**:
  - `GooglePickerLauncher` 以 002 的 `ApiClient.request('GET', '/api/auth/picker-token')` 取得 `{ accessToken, apiKey, appId }`，再動態載入 `https://apis.google.com/js/api.js`，`gapi.load('picker')`。
  - `PickerBuilder`：`DocsView(ViewId.SPREADSHEETS)` 並 `setMimeTypes('application/vnd.google-apps.spreadsheet')`（只顯示 Google 試算表，不顯示上傳的 .xlsx）、`setOAuthToken`、`setDeveloperKey`、`setAppId`。
  - 回呼 `action === 'picked'` 時回傳 `docs[0].id`；`action === 'cancel'` 時回傳 `null`（D3）。
  - Picker 腳本載入失敗，或 15 秒內沒有載入完成 → 丟出 `UnexpectedError`「無法載入 Google 檔案選擇器，請確認網路連線」（AC-25）；picker token 取得失敗時 `ApiClient` 以 `ApiError` reject，直接往上丟。
  - 型別只宣告用到的部分，不加 `@types/google.picker`。
- **Rationale**: `drive.file` 範圍下，經 Picker 挑選（且 app id 為同一個 Google Cloud 專案）的檔案才會授權給本系統。限制 MIME 類型後，Sheets API 不會遇到「不是 Google 試算表」的檔案。
- **Alternatives considered**: 自己列出雲端硬碟檔案（`drive.file` 看不到其他檔案）；貼網址（002 的範圍是 `drive.file`，貼網址的檔案沒有授權）。

## R3. 表頭辨識

- **Decision**: `HeaderLocator.locate()` 由上往下逐列掃描，第一個同時有題號欄與作答欄表頭的列是表頭列。比對：儲存格文字 `normalize('NFKC')` 並去除前後空白（含全形空白）後完全相等。題號欄「題號／編號／題次」、作答欄「作答／答案／回答」、題目欄「題目／問題／題幹」。表頭儲存格在合併範圍內時，欄位取合併範圍最左欄。`currentHeaderTexts()` 回傳第一個有 2 個以上非空白儲存格的列中由左到右的文字（`foundHeaders`）。
- **Rationale**: 完全相等避免「學生作答」被誤判（原則 IV）。範本第 2 列的標題只有一個儲存格（合併 B2:H2），所以「2 個以上非空白」會跳過標題、指到真正的表頭列，與設計稿 T-ImportError 的「No. 內容 學生填寫」一致。
- **Alternatives considered**: 子字串比對（誤判）；手動指定欄位（已決定不做）。

## R4. 題號、題組、填空格與標記

- **Decision**（`QuestionScanner.scan()`，列號與欄號都從 1 起算）：
  - 從表頭列下一列到最後一列，讀題號欄。儲存格在合併範圍內但不是第一列時跳過。
  - 題號：`effectiveValue.numberValue` 是 ≥ 1 的整數；或 `formattedValue` 經 NFKC 後全是數字且 ≥ 1。其他（0、負數、小數、文字、空白）略過該列。
  - 題號儲存格的合併範圍跨多列 → `GROUP`，範圍內每一列是一個候選小題；否則 `SINGLE`，只有該列。
  - 每個候選列：找作答欄 `(row, answerCol)` 所在的合併範圍；不在合併範圍內時填空格就是該格。合併範圍的第一列早於這一列 → 不是獨立填空格，略過；否則填空格是合併範圍左上角，轉成 A1（例如 `G5`）。這一格（合併範圍）去除前後空白後只有標記，而且它的最右欄 + 1 仍不超過作答欄表頭的 `answerLastCol`、那一格不屬於從上一列或左邊開始的合併範圍時，填空格改為右邊那格（#34；不看右邊那格的內容，寫回後再解析才會得到同一格）。
  - 一題沒有任何獨立填空格 → `NO_BLANK`。
  - 標記：填空格文字符合 `^\s*([（(]\s*\d+\s*[)）])`，原樣保留括號內外的寫法（去掉前面的空白）作為標記；不符合時為 `""`。標記以外的文字忽略。擷取寫成 `QuestionScanner.extractMarker(text)`。填空格是右邊那格時，標記取自左邊的標記格，`inBlankCell: false`。標記不放進 001 的 `SubQuestion`：`GuidedNotesParser.markersOf(grid, result)` 對每個 `blankCell` 取得 `BlankMarker`，`GuidedNotesImporter.read()` 成功時與 `ImportSuccess` 一起存入 `ImportStore`（`save(result, markers)`），006 以 `latestMarkers()` 取用（001 最終版沒有 `SubQuestion.marker`，2026-11-22 決定不請 001 修改）。
  - 題目敘述：題目欄同一列（合併時取左上角）的文字，去除前後空白。單題直接用；題組依小題順序每行為「標記（空白時為「（n）」）＋文字」，用 `\n` 連接，只保留有文字的列；全部沒有文字時不設 `text`。
- **Rationale**: 題組只依題號欄的合併範圍判定（AC-14）。填空格位置是解析結果（原則 IV），006 直接以 A1 寫回。
- **Alternatives considered**: 依標記判定題組（範本單題也可能加標記，會誤判）。

## R5. 題號檢查與錯誤訊息

- **Decision**: `GuidedNotesParser.parse()` 在 `scan()` 之後依序檢查：0 題 → `NO_QUESTIONS`；超過 200 題 → `TOO_MANY_QUESTIONS`；依掃描順序，題號 ≤ 前一題 → `INVALID_NUMBERING`（重複或不遞增分開寫 `reason`，都附兩題的題號與列）。所有 `ImportError` 由 `importErrors` 模組產生，訊息集中在一處，`fixSteps` 至少一條（SC-003）。`code` 的值即 `ImportErrorCode` 的 7 個字串。
- **Rationale**: 訊息集中一處，SC-003 的測試只需逐一檢查 7 個函式。

## R6. 預設工作表

- **Decision**: `describe()` 對 `load()` 回傳的每個工作表依序呼叫 `HeaderLocator.locate()`，第一個不為 `null` 的就是 `selectedWorksheet`；都沒有時用第一個工作表。
- **Rationale**: T-ImportError 沒有工作表切換，若預設指到封面工作表，老師會卡在錯誤頁（REQ-IMP-03）。

## R7. 伺服器 API 與錯誤對應

- **Decision**: 兩支 API（見 [contracts/guided-notes-http.md](contracts/guided-notes-http.md)），在 002 的 `buildApp(config, deps)` 以 `app.register(guidedNotesRoutes)` 註冊，每支都加 `{ preHandler: app.requireTeacher }`，並加入 002 T043 的「老師專用路由清單」測試：
  - `GET /api/guided-notes/spreadsheets/:spreadsheetId` → 200 `Spreadsheet`。
  - `POST /api/guided-notes/read` → 200，內容是 `ImportSuccess` 或 `ImportError`。`ImportError` 不用 4xx，因為 002 的 `ApiClient` 對非 2xx 只保留 `{ status, code, message }`，會丟掉 `foundHeaders` 等欄位；前端以 001 的 `isImportError` 區分。
  - 錯誤回應一律是 002 的 `ErrorBody` `{ code, message }`：`400 BAD_REQUEST`（輸入不合格）、`401 NOT_SIGNED_IN`（`TeacherNotSignedInError`）、`401 GOOGLE_AUTH_EXPIRED`（`SheetsReadError('AUTH_EXPIRED')`，訊息同 002「Google 授權已失效，請回首頁重新登入」）、`403 NO_ACCESS`（只有 `describe`；`pickSpreadsheet` 不能回傳 `ImportError`）、`502 GOOGLE_UNAVAILABLE`（`SheetsReadError('UNAVAILABLE')`，訊息同 002「連不上 Google，請稍後再試」）。`read` 遇到 `NO_ACCESS` 時回 200 `ImportError`。
  - 輸入驗證（原則 VII）：`spreadsheetId` 符合 `^[A-Za-z0-9_-]{10,200}$`；`worksheet` 為 1～100 字元的字串（Google 工作表名稱上限 100 字）。以 Fastify 的 JSON schema 驗證。`spreadsheetId` 最長 200 字元，超過 Fastify 預設的路徑參數上限 100 字元，所以 `buildApp` 設 `routerOptions: { maxParamLength: 256 }`，讓過長的 id 由 schema 回 400，而不是在路由器比對時就失敗。
  - log：每次讀取記錄 `spreadsheetId`、工作表、結果（題數或 `code`），不記錄 token 或儲存格內容（原則 VI）；使用 002 的 `loggerOptions`（含 redact），不另設 logger。
- **前端**: `HttpGuidedNotesService` 與 `GooglePickerLauncher` 一律經 002 的 `ApiClient.request(method, path, body?)` 呼叫伺服器。`ApiClient` 自動帶老師憑證，錯誤回應與連不上伺服器以 `ApiError { status, code, message }` reject（符合 001 的 `UnexpectedError`），003 不另外轉換、不另設逾時（伺服器端已有 15 秒逾時）。
- **Alternatives considered**: `read` 以 422 回 `ImportError`（`ApiClient` 會丟掉欄位，需要改 002）；003 自己寫請求函式（違反 002 的擴充點規則，憑證處理會重複）。

## R8. ImportStore 與讀取器的位置與共用

- **Decision**: `ImportStore` 是一般類別。002 的 `buildApp` 建立一個 `ImportStore` 與一個 `GoogleSheetsReader(app.googleClients)`（測試時由 `deps.spreadsheetReader` 注入替身），以 `app.decorate('importStore', …)`、`app.decorate('spreadsheetReader', …)` 提供；`guidedNotesRoutes` 用它們建立 `GuidedNotesImporter`，004 從 `app.importStore.latest()`、006 從 `latest()` 與 `latestMarkers()` 讀取，006 另用 `app.spreadsheetReader` 與 `GuidedNotesParser` 做版面檢查（[contracts/import-store.md](contracts/import-store.md)）。只有 `GuidedNotesImporter.read()` 呼叫 `save(result, markers)`；結果與標記一起取代，不會只換其中一個。
- **Rationale**: 與 002 提供 `app.googleClients` 的方式一致；不用模組層級的全域變數，測試可以各自建立；`ImportStore` 只有一個實作，不另設介面（原則 XI）。

## R9. 測試

- **Decision**:
  - 解析（`HeaderLocator`、`QuestionScanner`、`GuidedNotesParser`）：以 Sheets API `spreadsheets.get` 回應格式的 JSON fixture 建立 `SheetGrid`，不連網。fixture：兩份範本（依 `docs/templates/*.xlsx` 的內容與合併範圍手寫）、3 份變形（SC-002）、各錯誤情況；大量題目（201 題）用測試輔助函式產生。
  - `GoogleSheetsReader`：以 `vi.mock` 取代 `@googleapis/sheets`、`@googleapis/drive`，驗證欄位遮罩、逾時與錯誤對應。
  - 路由：002 的 `buildApp` + Fastify `inject()`，以 `deps.spreadsheetReader` 注入假的 `SpreadsheetReader`，用 002 的測試用老師憑證。
  - 前端：`HttpGuidedNotesService` 以假的 `ApiClient` 與假的 `GooglePickerLauncher` 測試；`GooglePickerLauncher` 需要 Google 的腳本，只做人工驗證。
  - 真正連線 Google 的流程依 [quickstart.md](quickstart.md) 人工驗證，紀錄寫在 `manual-verification.md`。
- **Rationale**: 原則 VIII：自動化測試不依賴真實外部服務。
