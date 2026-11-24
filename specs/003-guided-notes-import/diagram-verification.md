# 003 圖表一致性驗證

驗證日期：2026-11-25；程式版本：`fa0f5b5`（分支 `003-guided-notes-import`，工作目錄沒有未提交的變更）

範圍：`diagrams/003-component.puml`、`diagrams/003-class.puml`、`diagrams/003-sequence.puml` 對照 `server/src/guided-notes/*`、`server/src/app.ts`（003 註冊的部分）、`frontend/src/services/google/GooglePickerLauncher.ts`、`frontend/src/services/http/HttpGuidedNotesService.ts`、`frontend/src/services/createServiceRegistry.ts`（`guidedNotes` 綁定）。檢查清單依 `specs/003-guided-notes-import/plan.md`「藍圖對照」（第 55–73 行）。002、001 的檔案只確認名稱。下表「說明」欄的 Dn 編號對應最後一節。PNG 與 `.puml` 同在 commit `3118fa9`，本次沒有重新產生 PNG 比對。

## 組件圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| PickPage、ImportPage ..> GuidedNotesService | `frontend/src/pages/teacher/PickPage.tsx`、`ImportPage.tsx`；`frontend/src/services/interfaces.ts:27-30` | 一致 | 001 頁面不在範圍，只確認名稱與介面簽章 |
| createServiceRegistry() --> HttpGuidedNotesService「取代 MockGuidedNotesService」 | `createServiceRegistry.ts:29-39, 43` | 差異 | 頁面拿到的是包一層的物件，`readWorksheet` 成功時寫入 `MockSession.lastImport`（:36）；圖上沒有這層，也沒有 Registry 到 MockSession 的依賴（D1） |
| HttpGuidedNotesService -\|> GuidedNotesService | `HttpGuidedNotesService.ts:8` | 一致 | |
| HttpGuidedNotesService --> GooglePickerLauncher : pick() | `HttpGuidedNotesService.ts:15` | 一致 | |
| HttpGuidedNotesService --> ApiClient.request()（呼叫 003 API） | `HttpGuidedNotesService.ts:17, 22` | 一致 | |
| GooglePickerLauncher --> ApiClient（picker token） | `GooglePickerLauncher.ts:47` | 一致 | |
| GooglePickerLauncher ..> Google Picker（只顯示試算表） | `GooglePickerLauncher.ts:49-62`（MIME 限制在 :51） | 一致 | 載入 `api.js` 的步驟（:66-95）不在組件圖的粒度內，時序圖缺漏見 D14 |
| ApiClient --> GET /api/auth/picker-token | `server/src/auth/authRoutes.ts:57` | 一致 | |
| ApiClient --> guidedNotesRoutes | `guidedNotesRoutes.ts:57, 65` | 一致 | |
| buildApp --> guidedNotesRoutes : app.register | `app.ts:55` | 一致 | |
| buildApp --> ImportStore（app.importStore） | `app.ts:22, 51` | 一致 | |
| buildApp --> GoogleSheetsReader（app.spreadsheetReader） | `app.ts:24, 32, 52` | 一致 | `deps.spreadsheetReader` 可注入替身，plan 有寫，圖上沒畫；屬於細節（D20） |
| （圖上沒有）buildApp 的 `routerOptions: { maxParamLength: 256 }` | `app.ts:39-41` | 差異 | 003 對組合根的設定，圖不需要畫；specs 裡也沒有記錄（D21） |
| guidedNotesRoutes --> app.requireTeacher（preHandler） | `guidedNotesRoutes.ts:59, 67`；`requireTeacher.ts:22` | 一致 | |
| guidedNotesRoutes --> GuidedNotesImporter : describe() / read() | `guidedNotesRoutes.ts:55, 62, 71` | 一致 | |
| GuidedNotesImporter --> SpreadsheetReader : load() | `GuidedNotesImporter.ts:32, 57` | 一致 | |
| GoogleSheetsReader -\|> SpreadsheetReader | `GoogleSheetsReader.ts:57` | 一致 | |
| GoogleSheetsReader --> app.googleClients（authorizedClient()、isGoogleAuthExpired()） | `GoogleSheetsReader.ts:3, 18, 62` | 一致 | |
| （圖上沒有）GoogleSheetsReader --> 002 `GoogleOAuthGateway.ts` 的 `httpStatusOf`、`isGoogleUnreachable`、`GoogleUnavailableError` | `GoogleSheetsReader.ts:4, 19-21, 32` | 差異 | 圖與 data-model 的「002 提供」清單都沒有（D8） |
| GoogleSheetsReader ..> Sheets API（spreadsheets.get includeGridData） | `GoogleSheetsReader.ts:66-69` | 一致 | |
| GoogleSheetsReader ..> Drive API（files.get capabilities.canEdit） | `GoogleSheetsReader.ts:70` | 一致 | |
| GoogleSheetsReader ..> SheetGrid：建立 | `GoogleSheetsReader.ts:52`（`SheetGrid.fromApi`） | 一致 | |
| GuidedNotesImporter --> GuidedNotesParser : parse() | `GuidedNotesImporter.ts:21, 64-65` | 一致 | 也呼叫 `markersOf()`（:65），標籤沒寫，屬於細節（D20） |
| GuidedNotesImporter --> HeaderLocator（選預設工作表） | `GuidedNotesImporter.ts:33` | 一致 | |
| GuidedNotesParser --> HeaderLocator : locate() | `GuidedNotesParser.ts:17-18` | 一致 | |
| GuidedNotesParser --> QuestionScanner : scan() | `GuidedNotesParser.ts:13, 20` | 一致 | |
| GuidedNotesParser --> importErrors | `GuidedNotesParser.ts:4` | 一致 | |
| （圖上沒有）GuidedNotesImporter --> importErrors | `GuidedNotesImporter.ts:5, 59, 63` | 差異 | Importer 自己產生 `NO_ACCESS`、`NO_WORKSHEET`，是從「解析」套件外的依賴（D17） |
| （圖上沒有）QuestionScanner --> importErrors；解析類別 --> SheetGrid | `QuestionScanner.ts:3-4`；`HeaderLocator.ts:1`；`GuidedNotesParser.ts:6` | 差異 | 同一個套件內的依賴，屬於細節（D23） |
| GuidedNotesImporter --> ImportStore：成功時 save(result, markers) | `GuidedNotesImporter.ts:65` | 一致 | |
| 004 / 006 ..> ImportStore、SpreadsheetReader、GuidedNotesParser | `ImportStore.ts:18-24`、`SpreadsheetReader.ts:15-17`、`GuidedNotesParser.ts:16` | 一致 | 被呼叫的介面都存在；004、006 還沒實作，呼叫端無法驗證 |
| 註解：ImportStore 只在記憶體、只有 read 成功才取代 | `ImportStore.ts:8-25`；`GuidedNotesImporter.ts:65` | 一致 | |
| 註解：表頭同義詞、找不到回 NO_HEADER | `HeaderLocator.ts:18-20`；`GuidedNotesParser.ts:18` | 一致 | |

## 類別圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| Spreadsheet、SubQuestion、ImportSuccess、ImportError、UnexpectedError | `shared/src/entities.ts:29-35, 43-46, 56-69, 145-147` | 一致 | |
| QuestionType «enum» | `shared/src/entities.ts:37-41` | 一致 | 程式用 `as const` 物件加型別，是表示法差異（D20） |
| Question { number, type, text [0..1] } | `shared/src/entities.ts:49-54` | 一致 | `subQuestions` 用組合關係表示，沒有列成欄位（D20） |
| ImportErrorCode «enum»，放在 Entities（001 shared）套件 | `server/src/guided-notes/importErrors.ts:6-15` | 差異 | 七個值都對，但定義在伺服器的 importErrors 模組，不在 shared（D11） |
| GuidedNotesService «001» | `frontend/src/services/interfaces.ts:27-30` | 一致 | |
| HttpGuidedNotesService { -api: ApiClient, -picker: GooglePickerLauncher } | `HttpGuidedNotesService.ts:9-12` | 差異 | 實際型別是 `Pick<ApiClient, 'request'>`、`Pick<GooglePickerLauncher, 'pick'>`（D2） |
| HttpGuidedNotesService.pickSpreadsheet() / readWorksheet(...) | `HttpGuidedNotesService.ts:14-23` | 一致 | |
| HttpGuidedNotesService ..> UnexpectedError : reject（ApiError） | `HttpGuidedNotesService.ts:1-2` | 一致 | 不轉換，直接往上丟 |
| GooglePickerLauncher { -api: ApiClient, +pick(): Promise<string \| null> } | `GooglePickerLauncher.ts:43, 46` | 差異 | `-api` 是 `Pick<ApiClient, 'request'>`（D2）；`pick()` 一致 |
| （圖上沒有）GooglePickerLauncher ..> UnexpectedError | `GooglePickerLauncher.ts:8, 88` | 差異 | Picker 載入失敗時丟 `UnexpectedError`（D10） |
| GuidedNotesImporter { describe(), read() }（沒有欄位） | `GuidedNotesImporter.ts:20-52` | 差異 | 兩個方法的簽章一致；建構參數 `reader`、`store`、`log: FastifyBaseLogger`（:23-27）沒畫出來，logger 依賴不在圖上（D6） |
| SpreadsheetReader.load(spreadsheetId): Promise<LoadedSpreadsheet> | `SpreadsheetReader.ts:15-17` | 一致 | |
| LoadedSpreadsheet { id, title, editable, sheets: SheetGrid[] } | `SpreadsheetReader.ts:5-10` | 一致 | |
| SheetGrid（欄位、static fromApi、text、textA1、number、mergeAt、toA1） | `SheetGrid.ts:22-88` | 一致 | `number`／`mergeAt` 回傳 `\| null`，對應 [0..1] |
| CellRange | `SheetGrid.ts:7-12` | 一致 | |
| SheetsReadError { kind } ＋註解（NO_ACCESS／UNAVAILABLE／AUTH_EXPIRED 的條件） | `SpreadsheetReader.ts:19-31`；`GoogleSheetsReader.ts:17-23` | 差異 | 欄位一致；`UNAVAILABLE` 的實際條件比註解寬，見 D13 |
| GoogleSheetsReader { -clients: GoogleClientProvider, +load() } | `GoogleSheetsReader.ts:57-78` | 一致 | |
| GuidedNotesParser.parse(grid, spreadsheet) / markersOf(grid, result) | `GuidedNotesParser.ts:16, 43` | 一致 | |
| HeaderLocator { NUMBER_HEADERS…, locate(grid), currentHeaderTexts(grid) } | `HeaderLocator.ts:17-58` | 差異 | 程式全部是 `static`，圖上沒標 `{static}`；同一張圖的 `SheetGrid.fromApi`、`QuestionScanner.extractMarker` 有標（D4） |
| HeaderMatch { row, numberCol, answerCol, questionCol [0..1] } | `HeaderLocator.ts:4-9` | 一致 | |
| QuestionScanner.scan(grid, header) / {static} extractMarker(text) | `QuestionScanner.ts:36, 40` | 一致 | |
| ScannedQuestion { row, question } | `QuestionScanner.ts:7-10` | 一致 | |
| importErrors.noQuestions(worksheet) | `importErrors.ts:51`（呼叫：`GuidedNotesParser.ts:22`） | 差異 | 程式是 `noQuestions(worksheet, headerRow)`（D3） |
| importErrors 其他 6 個函式 | `importErrors.ts:37, 57, 67, 73, 81, 87` | 一致 | `invalidNumbering` 的 `previous` 型別是 `NumberedRow`，圖上沒寫型別（D22） |
| （圖上沒有）importErrors.isImportError | `importErrors.ts:32-35` | 差異 | 重複 `shared/src/guards.ts:12` 的同名函式，註解說 guards.ts 還沒寫，與事實不符（D12） |
| BlankMarkers «type» | `ImportStore.ts:4` | 一致 | `Readonly<Record<string, string>>` |
| ImportStore { -latestResult, -latestBlankMarkers, save, latest, latestMarkers } | `ImportStore.ts:8-25` | 差異 | `latest()` 實際回傳 `Readonly<ImportSuccess> \| null`，圖上是 `ImportSuccess [0..1]`（D5） |
| guidedNotesRoutes «Fastify plugin»（兩條路由） | `guidedNotesRoutes.ts:54-74` | 一致 | |
| guidedNotesRoutes ..> ErrorBody、requireTeacher；--> GuidedNotesImporter | `guidedNotesRoutes.ts:3, 33, 38-51, 55, 59, 67`；`server/src/http/errors.ts:4-13` | 一致 | 經 002 的 `sendError` 產生 `ErrorBody` |
| （圖上沒有）guidedNotesRoutes ..> SheetsReadError、TeacherNotSignedInError；GuidedNotesImporter ..> SheetsReadError | `guidedNotesRoutes.ts:2, 5, 39-50`；`GuidedNotesImporter.ts:7, 48, 59` | 差異 | 錯誤對應的依賴沒畫（D9） |
| 關聯：Reader ..\|> / ..> LoadedSpreadsheet / ..> SheetsReadError；LoadedSpreadsheet *-- SheetGrid；Importer --> Reader、Parser、HeaderLocator、ImportStore；Parser --> HeaderLocator、QuestionScanner；..> importErrors；..> BlankMarkers | 各檔 import 與呼叫處（見組件圖表格） | 一致 | |
| GoogleClientProvider.authorizedClient(): OAuth2Client；TeacherNotSignedInError { code = "NOT_SIGNED_IN" } | `server/src/auth/GoogleClientProvider.ts:5-28` | 一致 | |
| googleAuthErrors «module» { isGoogleAuthExpired(error) } | 實際在 `server/src/auth/GoogleClientProvider.ts:32` | 差異 | 沒有叫 `googleAuthErrors` 的模組；002 類別圖把它畫成 `isGoogleAuthExpired «function»`（`diagrams/002-class.puml:163`）（D7） |
| （圖上沒有）002 的 `httpStatusOf`、`isGoogleUnreachable`、`GoogleUnavailableError` | `server/src/auth/GoogleOAuthGateway.ts:23, 32, 45` | 差異 | 同 D8 |
| requireTeacher «app.requireTeacher» | `app.ts:48`；`requireTeacher.ts:17-22` | 一致 | |
| buildApp(config: AppConfig, deps): FastifyInstance | `app.ts:36` | 一致 | `deps: AppDeps = {}`，003 加了 `spreadsheetReader?`（:32）（D20） |
| ApiClient.request<T>(method, path, body?)；ApiError { status, code, message }；ApiError ..\|> UnexpectedError | `frontend/src/services/http/ApiClient.ts:5-14, 23` | 一致 | |

## 時序圖

| 圖上的元素 | 程式位置 | 結果（一致／差異） | 說明 |
| --- | --- | --- | --- |
| 1. Page -> Svc : pickSpreadsheet() -> L : pick() | `HttpGuidedNotesService.ts:14-15` | 一致 | |
| L -> PT : ApiClient.request(GET) → { accessToken, apiKey, appId } | `GooglePickerLauncher.ts:10-14, 47` | 一致 | |
| （圖上沒有）取得 token 後載入 Picker 腳本（15 秒逾時） | `GooglePickerLauncher.ts:48, 66-95` | 差異 | 正常流程少一步，第 4 段也沒有載入失敗的分支（D14） |
| L -> GP : 開啟（只顯示試算表） | `GooglePickerLauncher.ts:49-62` | 一致 | |
| alt 取消 → null → null，留在原頁 | `GooglePickerLauncher.ts:59`；`HttpGuidedNotesService.ts:16` | 一致 | 沒有呼叫伺服器 |
| else 挑選 → spreadsheetId → GET /api/guided-notes/spreadsheets/:id | `GooglePickerLauncher.ts:58`；`HttpGuidedNotesService.ts:17` | 一致 | id 經過 `encodeURIComponent` |
| R -> I : describe(id) -> GR : load(id) -> G | `guidedNotesRoutes.ts:62`；`GuidedNotesImporter.ts:32`；`GoogleSheetsReader.ts:60-73` | 一致 | 兩個 Google 請求以 `Promise.all` 並行，共用 15 秒逾時 |
| （圖上沒有）GR -> app.googleClients : authorizedClient() | `GoogleSheetsReader.ts:62` | 差異 | 沒有畫出來，所以 `NOT_SIGNED_IN` 分支也沒有來源（D15） |
| I -> P : HeaderLocator.locate(每個工作表)；selectedWorksheet = 第一個有表頭的 | `GuidedNotesImporter.ts:33-34` | 一致 | 程式用 `find`，找到就停；都沒有時用第一個工作表，圖上沒寫（D18） |
| R --> Svc : 200 Spreadsheet --> Page | `guidedNotesRoutes.ts:60-62` | 一致 | |
| 2. Page -> Svc : readWorksheet(id, selectedWorksheet) | `createServiceRegistry.ts:34-38`；`HttpGuidedNotesService.ts:20-23` | 差異 | 中間經過 registry 包的那一層，成功時寫入 `MockSession.lastImport`（D1） |
| Svc -> R : POST /read -> I : read() -> GR : load() | `HttpGuidedNotesService.ts:22`；`guidedNotesRoutes.ts:71`；`GuidedNotesImporter.ts:43, 57` | 一致 | |
| alt 沒有這個工作表 → ImportError(NO_WORKSHEET) | `GuidedNotesImporter.ts:62-63` | 一致 | |
| I -> P : parse(grid, spreadsheet)；locate()；opt NO_HEADER | `GuidedNotesImporter.ts:64`；`GuidedNotesParser.ts:17-18` | 一致 | |
| P -> P : scan()……；檢查題號不重複、遞增、1–200 題；每題有填空格 | `QuestionScanner.ts:40-74`（`NO_BLANK` 在 :68）；`GuidedNotesParser.ts:20-31` | 差異 | 實際順序是 NO_BLANK（掃描時）→ NO_QUESTIONS → TOO_MANY_QUESTIONS → INVALID_NUMBERING，和圖上寫的順序不同（D16） |
| alt ImportSuccess：markersOf → save(result, markers) → 200 ImportSuccess | `GuidedNotesImporter.ts:65`；`GuidedNotesParser.ts:43-46`；`ImportStore.ts:13-16` | 一致 | `markersOf` 先算，再 `save` |
| else ImportError：ImportStore 不變 → 200 ImportError | `GuidedNotesImporter.ts:65-66` | 一致 | |
| 3. 切換工作表／重新讀取 → readWorksheet(id, worksheet) | 同第 2 段 | 一致 | |
| 4. 連不上 Google（逾時 15 秒）→ SheetsReadError(UNAVAILABLE) → 502 GOOGLE_UNAVAILABLE | `GoogleSheetsReader.ts:21, 26-40`；`guidedNotesRoutes.ts:48-49` | 差異 | 對應正確；但沒有 HTTP 狀態的任何錯誤也會變成 UNAVAILABLE（D13） |
| Google 授權失效 → SheetsReadError(AUTH_EXPIRED) → 401 GOOGLE_AUTH_EXPIRED | `GoogleSheetsReader.ts:18`；`guidedNotesRoutes.ts:46-47` | 一致 | 這個分支少一條 `I --> R` 的箭頭，前一個分支有（D19） |
| 老師憑證失效 → 401 UNAUTHORIZED（requireTeacher） | `server/src/auth/requireTeacher.ts:22` | 一致 | |
| 挑選後讀不到 → NO_ACCESS：describe 403，read 改回 200 ImportError | `guidedNotesRoutes.ts:44-45`；`GuidedNotesImporter.ts:59` | 一致 | |
| （圖上沒有）老師未登入 Google → TeacherNotSignedInError → 401 NOT_SIGNED_IN | `GoogleClientProvider.ts:24-26`；`guidedNotesRoutes.ts:39-40` | 差異 | 契約有這個錯誤，圖上沒有（D15） |
| （圖上沒有）400 BAD_REQUEST、500 INTERNAL | `guidedNotesRoutes.ts:7-34, 42` | 差異 | 契約已列出，圖上可以不畫（D19） |
| Svc --> Page : ApiClient reject ApiError（符合 UnexpectedError） | `ApiClient.ts:5-14`；`HttpGuidedNotesService.ts:1-2` | 一致 | |
| 5. 下游讀取：latest() / latestMarkers()；006 的 load() + new GuidedNotesParser().parse() | `ImportStore.ts:18-24`；`SpreadsheetReader.ts:15-17`；`GuidedNotesParser.ts:12-16` | 一致 | 介面存在；004、006 還沒實作，呼叫端無法驗證 |

## 差異與處理建議

**D1（b）registry 包一層 `guidedNotes`，寫入 `MockSession.lastImport`**（組件圖、時序圖第 2 段）
- 程式：`frontend/src/services/createServiceRegistry.ts:29-39`，`readWorksheet` 成功時執行 `session.lastImport = result`（:36）；`MockSession.lastImport` 定義在 `frontend/src/services/mock/MockSession.ts:20`。
- 理由：這是已知、刻意的暫時做法，讓還是模擬實作的活動與結果服務用匯入的題目，程式裡有 `ponytail:` 註解說明何時移除。程式合理。但組件圖只畫 `Registry --> HttpNotes : 取代 MockGuidedNotesService`，看圖會以為 `guidedNotes` 已經和 mock 完全無關，所以判為 (b)。
- 建議：不要加新組件，只加註解。組件圖在 `Registry` 加 note：「暫時：包一層，readWorksheet 成功時寫入 MockSession.lastImport，004–006 接上後移除」；時序圖第 2 段 `Page -> Svc` 旁加同樣的 note。004–006 移除這層時再刪掉。

**D2（c）`HttpGuidedNotesService`、`GooglePickerLauncher` 的建構參數用 `Pick<...>`**（類別圖）
- 程式：`HttpGuidedNotesService.ts:10-11`（`Pick<ApiClient, 'request'>`、`Pick<GooglePickerLauncher, 'pick'>`）、`GooglePickerLauncher.ts:43`（`Pick<ApiClient, 'request'>`）。圖：`003-class.puml:67-68, 73`；data-model 第 75–76 行也寫 `ApiClient`、`GooglePickerLauncher`。
- 理由：`Pick` 只是在 TypeScript 型別上縮小到實際用到的方法，方便測試傳入假物件；依賴的對象仍然是 `ApiClient`、`GooglePickerLauncher`，`createServiceRegistry.ts:29` 傳入的也是真正的實例。圖上的關聯線（`:77, 221, 222`）正確。
- 建議：不需處理。想讓圖完全照抄型別，可以把欄位改成 `-api: Pick<ApiClient, 'request'>`，但不建議。

**D3（b）`importErrors.noQuestions` 少一個參數**（類別圖）
- 程式：`importErrors.ts:51` 是 `noQuestions(worksheet: string, headerRow: number)`，`GuidedNotesParser.ts:22` 傳入 `header.row`。圖：`003-class.puml:147` 是 `noQuestions(worksheet)`。
- 理由：契約範例的原因是「『學習單』工作表的表頭（第 4 列）以下沒有任何題號」（`contracts/guided-notes-http.md:85`），需要表頭列，程式是對的。
- 建議：圖改成 `+noQuestions(worksheet, headerRow): ImportError`。

**D4（b）`HeaderLocator` 的成員都是 static，圖上沒標**（類別圖）
- 程式：`HeaderLocator.ts:18-20`（`static readonly` 常數）、`:24`（`static locate`）、`:47`（`static currentHeaderTexts`）；呼叫端也用 `HeaderLocator.locate(...)`（`GuidedNotesImporter.ts:33`、`GuidedNotesParser.ts:17-18`）。圖：`003-class.puml:125-129`。
- 理由：同一張圖的 `SheetGrid.fromApi`、`QuestionScanner.extractMarker` 有標 `{static}`，這裡沒標，看圖會以為要先 `new HeaderLocator()`。程式的做法合理，因為它沒有狀態。
- 建議：五個成員都加 `{static}`。

**D5（b）`ImportStore.latest()` 的回傳型別少了 `Readonly`**（類別圖）
- 程式：`ImportStore.ts:18` 是 `latest(): Readonly<ImportSuccess> | null`。契約 `contracts/import-store.md:28` 也是 `Readonly`。圖：`003-class.puml:161` 是 `ImportSuccess [0..1]`；data-model 第 96 行同樣沒寫（但第 109 行有寫要回傳 `Readonly`）。
- 理由：`Readonly` 是給 004、006 的保證之一（契約保證 7），應該在藍圖上看得到。
- 建議：圖改成 `+latest(): Readonly<ImportSuccess> [0..1]`；data-model 第 96 行一起改。

**D6（b）`GuidedNotesImporter` 的建構參數沒畫，少了 logger 依賴**（類別圖）
- 程式：`GuidedNotesImporter.ts:23-27`，建構參數是 `reader: SpreadsheetReader`、`store: ImportStore`、`log: FastifyBaseLogger`；`read()` 會寫 log（:45, :49）。路由用 `new GuidedNotesImporter(app.spreadsheetReader, app.importStore, app.log)` 建立（`guidedNotesRoutes.ts:55`）。圖：`003-class.puml:82-85` 沒有欄位。
- 理由：reader、store 已經用關聯線表示，但 logger 完全不在圖上。log 內容受原則 VI 規範（research R7），而且 `GoogleSheetsReader` 有畫 `-clients`，兩個類別的畫法不一致。
- 建議：加 `-reader: SpreadsheetReader`、`-store: ImportStore`、`-log: FastifyBaseLogger`，或至少加 `-log`。

**D7（b）`googleAuthErrors «module»` 這個模組不存在**（類別圖）
- 程式：`isGoogleAuthExpired` 定義在 `server/src/auth/GoogleClientProvider.ts:32`，`GoogleSheetsReader.ts:3` 從這裡 import。圖：`003-class.puml:199-201, 227`。
- 理由：這只是名稱問題，程式沒有錯。002 類別圖把它畫成 `isGoogleAuthExpired «function»`（`diagrams/002-class.puml:163`）。
- 建議：改成和 002 一樣的 `isGoogleAuthExpired «function»`，或標註它在 `GoogleClientProvider.ts`。

**D8（b）`GoogleSheetsReader` 還用了 002 `GoogleOAuthGateway.ts` 的三個輔助**（類別圖、組件圖）
- 程式：`GoogleSheetsReader.ts:4` import `GoogleUnavailableError`、`httpStatusOf`、`isGoogleUnreachable`（:19-21, :32）；定義在 `server/src/auth/GoogleOAuthGateway.ts:23, 32, 45`。
- 理由：重用 002 的判斷，讓 502、逾時的語意和 002 相同，不重寫，所以程式合理。但這三個都不在 003 的圖上，也不在 data-model 第 99 行「002 提供、003 只引用」的清單，也不在 002 的 `server-extension.md`。
- 建議：類別圖的「002 提供」套件加這三個，並加上 `GoogleSheetsReader ..>` 的依賴；data-model 第 99 行的清單一起補上。

**D9（b）錯誤對應的依賴沒畫**（類別圖）
- 程式：`guidedNotesRoutes.ts:2, 5, 39-50` 依 `TeacherNotSignedInError`、`SheetsReadError` 決定 HTTP 狀態；`GuidedNotesImporter.ts:7, 59` 把 `SheetsReadError('NO_ACCESS')` 轉成 `ImportError`。
- 理由：時序圖第 4 段有畫這些對應，但類別圖只有 `GoogleSheetsReader ..> SheetsReadError : throws`，看不出是誰接住它。
- 建議：加上 `guidedNotesRoutes ..> SheetsReadError`、`guidedNotesRoutes ..> TeacherNotSignedInError`、`GuidedNotesImporter ..> SheetsReadError : NO_ACCESS 轉 ImportError`。

**D10（b）`GooglePickerLauncher` 會丟 `UnexpectedError`，圖上沒有**（類別圖）
- 程式：`GooglePickerLauncher.ts:8`（`LOAD_FAILED`）、`:88`（`reject(LOAD_FAILED)`）。data-model 第 68 行與 research R2 有寫。
- 建議：加 `GooglePickerLauncher ..> UnexpectedError : reject（Picker 載入失敗）`。

**D11（b）`ImportErrorCode` 畫在 shared 實體套件，實際定義在伺服器**（類別圖）
- 程式：`server/src/guided-notes/importErrors.ts:6-15`，shared 沒有這個型別。圖：`003-class.puml:42-50`，放在「Entities（001 shared 實體）」套件。
- 理由：七個值都一致，問題只在位置。plan 藍圖對照把 Entities 對到 `shared/src/entities.ts`（plan 第 73 行），看圖的人會去 shared 找。程式的位置合理，因為前端只把 `code` 當字串顯示。
- 建議：把 `ImportErrorCode` 移到 `server/src/guided-notes` 套件，加上 `importErrors ..> ImportErrorCode`；`ImportError ..> ImportErrorCode : code 的值` 保留。

**D12（a）`importErrors.isImportError` 重複實作 shared 的 guard，註解與事實不符**（反向檢查）
- 程式：`importErrors.ts:32-35` 的註解寫「shared/src/guards.ts is not written yet」，但 `shared/src/guards.ts:12` 已經有 `isImportError`（commit `d39a112`，早於 importErrors 的 commit `36a8d65`）。前端 `createServiceRegistry.ts:4` 也已經從 `@quiz-buzzer/shared/guards` import。伺服器可以 import 同一個套件（`shared/package.json` 的 `exports: "./*"`，而且伺服器已經在用 `@quiz-buzzer/shared/entities`）。HTTP 契約第 11 行也說要用 001 的 `isImportError`。
- 理由：這是不必要的重複，判斷條件也比 shared 版本寬鬆（只看有沒有 `code`）。
- 建議：刪掉 `importErrors.ts:32-35`，`GuidedNotesImporter.ts:5`、`GuidedNotesParser.ts:4` 改從 `@quiz-buzzer/shared/guards` import。圖不用改。

**D13（a）不是 Google 的錯誤也會變成 `UNAVAILABLE`（502「連不上 Google」）**（類別圖註解、時序圖第 4 段）
- 程式：`GoogleSheetsReader.ts:73` 的 `toLoadedSpreadsheet(...)`（裡面是 `SheetGrid.fromApi`）放在 `try` 裡面，`catch` 全部交給 `toSheetsReadError`（:75）。002 的 `isGoogleUnreachable` 對沒有 HTTP 狀態的錯誤一律回 true（`GoogleOAuthGateway.ts:45-47`）。所以轉換資料時如果發生程式錯誤（例如 `TypeError`），老師會看到 502「連不上 Google，請稍後再試」。
- 理由：圖的註解（`003-class.puml:248`）、契約第 24 行，以及程式自己的註解（`GoogleSheetsReader.ts:16`「Other errors … become 500 INTERNAL」）都說 UNAVAILABLE 只代表逾時、網路錯誤、5xx。偏離的是程式。
- 建議：`try` 只包 Google 的兩個請求，`toLoadedSpreadsheet` 移到 `try/catch` 之後。改動是兩三行。風險不高，因為 `fromApi` 處處有 `??` 防護。

**D14（b）時序圖沒有載入 Picker 腳本這一步與失敗分支**
- 程式：`GooglePickerLauncher.ts:47-48` 先取 token，再 `this.load()`；`:66-95` 動態載入 `api.js`，15 秒逾時或失敗時 reject `UnexpectedError`「無法載入 Google 檔案選擇器，請確認網路連線」，下次可以重試（:91）。research R2 有決定，AC-25 也要求。
- 建議：第 1 段 `PT --> L` 之後加 `L -> GP : 載入 api.js、gapi.load('picker')（15 秒逾時）`；第 4 段加分支「Picker 載入失敗 → L reject UnexpectedError → Svc → Page」。

**D15（b）時序圖沒有 `authorizedClient()` 與 `NOT_SIGNED_IN` 分支**
- 程式：`GoogleSheetsReader.ts:62` 每次 `load` 都呼叫 `this.clients.authorizedClient()`（在 `try` 外面，所以不會被轉換）；沒有老師登入 Google 時丟 `TeacherNotSignedInError`（`GoogleClientProvider.ts:24-26`），路由回 `401 NOT_SIGNED_IN`（`guidedNotesRoutes.ts:39-40`）。契約第 21 行有這一列。
- 理由：第 4 段的「老師憑證失效」指的是 `requireTeacher` 回的 401 UNAUTHORIZED，和這個情況不同。
- 建議：第 1、2 段的 `I -> GR : load(id)` 之後加 `GR -> 002 app.googleClients : authorizedClient()`，可以寫成 note；第 4 段加分支「伺服器沒有老師的 Google 授權 → TeacherNotSignedInError → 401 { code: NOT_SIGNED_IN }」。

**D16（b）時序圖寫的檢查順序和程式不同**
- 程式：`NO_BLANK` 在 `scan()` 掃描時就回傳（`QuestionScanner.ts:68`），之後 `parse()` 依序檢查 `NO_QUESTIONS`、`TOO_MANY_QUESTIONS`、`INVALID_NUMBERING`（`GuidedNotesParser.ts:21-31`），和 research R5 一致。圖：`003-sequence.puml:63-64` 寫「檢查題號不重複、遞增、1–200 題；每題有填空格」。
- 理由：一份學習單有多個問題時，順序決定老師先看到哪一個錯誤，程式的順序依照設計。
- 建議：第 63 行的 scan 說明加「作答欄與上一列合併 → NO_BLANK」；第 64 行改成「0 題 → NO_QUESTIONS；超過 200 → TOO_MANY_QUESTIONS；題號重複或不遞增 → INVALID_NUMBERING」。

**D17（b）組件圖缺 `GuidedNotesImporter --> importErrors`**
- 程式：`GuidedNotesImporter.ts:5` import `noAccess`、`noWorksheet`（:59, :63）。類別圖有這條（`003-class.puml:178`），組件圖沒有。
- 理由：這條依賴從「解析（不碰網路）」套件外面連進來，看圖會以為只有 Parser 產生 `ImportError`。
- 建議：加 `Importer --> Errors : NO_ACCESS / NO_WORKSHEET`。

**D18（c）時序圖把 describe 的 `HeaderLocator.locate` 寫成「每個工作表」**
- 程式：`GuidedNotesImporter.ts:33` 用 `find`，找到第一個就停；都沒有時用第一個工作表（`?? book.sheets[0]`），沒有工作表時回 `''`（:34）。
- 理由：結果相同，research R6 已經寫清楚，只是畫法比較簡略。
- 建議：不需處理。想改的話，可以把 `I --> R` 的標籤補上「都沒有時第一個」。

**D19（c）時序圖第 4 段的錯誤列得不完整，畫法也不一致**
- 程式：400 BAD_REQUEST（`guidedNotesRoutes.ts:7-34`）、500 INTERNAL（`:42` 重新丟出，交給 002 的 `errorHandler`）沒畫。AUTH_EXPIRED 分支少一條 `I --> R` 箭頭，UNAVAILABLE 分支有。
- 理由：契約第 17–25 行已經完整列出這些錯誤。400 是請求格式錯誤，前端正常使用不會碰到。
- 建議：不需處理。

**D20（c）TypeScript 與 UML 的表示法差異**
- 包括：`QuestionType` 用 `as const` 物件表示列舉（`entities.ts:37-41`）；`Question.subQuestions` 畫成組合關係，沒有列成欄位；`SheetsReadErrorKind` 型別別名（`SpreadsheetReader.ts:19`）在圖上直接寫成 union；`ApiSheet`（`SheetGrid.ts:4`）只出現在參數型別；`buildApp` 的 `deps` 沒寫型別（`AppDeps`，`app.ts:29-33`），也沒畫 `deps.spreadsheetReader` 注入；Importer 到 Parser 的線沒寫 `markersOf`。
- 建議：不需處理。

**D21（c）`routerOptions: { maxParamLength: 256 }` 不在圖上**
- 程式：`app.ts:39-41`。Fastify 預設路徑參數上限是 100 字元，`spreadsheetId` 最多 200 字元，所以 003 把上限放寬，讓 schema 決定要不要回 400。
- 理由：這是框架設定，不是組件或依賴，圖不需要畫。不過 specs 裡完全沒有記錄（`grep maxParamLength specs diagrams` 沒有結果），而且它改的是 002 的組合根。
- 建議：圖不改。可以在 research R7 的輸入驗證那一條補一句；這不是圖表的範圍。

**D22（c）圖上沒畫的私有成員與輔助匯出**
- 包括：`toLoadedSpreadsheet`（`GoogleSheetsReader.ts:42`，只有測試替身 `server/tests/guided-notes/helpers/fakeSpreadsheetReader.ts:2` 使用）、`GOOGLE_TIMEOUT_MS`（`GoogleSheetsReader.ts:13`）、`columnLetters`（`SheetGrid.ts:15`，`GuidedNotesParser.ts:37` 使用）、`ACCEPTED_HEADERS`、`NumberedRow`（`importErrors.ts:17, 23`），以及私有的 `GuidedNotesImporter.readWorksheet`、`GooglePickerLauncher.load`、`SheetGrid` 的 `cells`／`merges`／`cell()`。
- 理由：這些是實作細節或給測試用的匯出，沒有改變設計。
- 建議：不需處理。

**D23（c）組件圖沒畫解析套件內部的依賴**
- 程式：`QuestionScanner.ts:3` 依賴 importErrors；HeaderLocator、QuestionScanner、GuidedNotesParser 都依賴 SheetGrid（`HeaderLocator.ts:1`、`QuestionScanner.ts:4`、`GuidedNotesParser.ts:6`）。
- 理由：類別圖已經有這些依賴；組件圖只畫跨套件的主要依賴，這樣的粒度合理。
- 建議：不需處理。

結論：差異共 23 個：(a) 2 個（D12、D13）；(b) 14 個（D1、D3–D11、D14–D17）；(c) 7 個（D2、D18–D23）。

## 處理結果（2026-11-25，使用者決定照建議處理）

| 差異 | 處理 |
| --- | --- |
| D12（a） | 改程式：刪掉伺服器自己的 `isImportError`，改用 `shared/src/guards.ts`；`guards.ts` 的型別 import 補上 `.js`（commit「refactor(003): 改用 shared 的 isImportError」） |
| D13（a） | 改程式：先加測試重現，再把 `toLoadedSpreadsheet` 移出 `try`，程式錯誤回 500 而不是 502（commit「test(003): 讀取結果轉換出錯時不能說成連不上 Google」「fix(003): 讀取結果轉換出錯時回報伺服器錯誤」） |
| D1、D3–D11、D14–D17（b） | 改圖：三張圖與 `data-model.md` 已同步，PNG 重新產生；D1 只加註記，004–006 接上後連同程式一起移除（commit「spec(003): 依圖表一致性驗證同步三張圖與資料模型」） |
| D21（c） | research R7 補上 `maxParamLength: 256` 的原因 |
| D2、D18–D20、D22、D23（c） | 表示法差異，接受，不處理 |

結論：處理後程式與三張圖一致，沒有未處理的差異。
