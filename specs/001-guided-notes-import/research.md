# Research: Guided Notes 匯入

**Feature**: `001-guided-notes-import` | **Date**: 2026-11-18 | **Plan**: [plan.md](./plan.md)

技術棧沿用使用者在 `/speckit-plan` 指定的 TypeScript 全端（Node.js、Socket.IO、React + Vite + Tailwind CSS、Vitest、npm workspaces monorepo）。2026-11-18 助教公告要求直接連線雲端 Google Sheets，原本以 ExcelJS 讀上傳檔案的做法作廢；本文件記錄改用 Google 後要決定的事。

## R1. 執行環境與語言版本

- **Decision**: Node.js 24 LTS、TypeScript 5（`strict: true`），伺服器與前端共用同一份 `tsconfig` 基底。
- **Rationale**: 開發機已安裝 Node 24；共用型別放在 `packages/shared`，三個子功能的介面在編譯期就能檢查。
- **Alternatives considered**: 純 JavaScript（共用契約無法在編譯期檢查）。

## R2. Google 授權：老師以 Google 帳號登入（spec Clarifications）

- **Decision**: 用 `google-auth-library` 的 `OAuth2Client` 走「網頁應用程式」授權碼流程：
  - 範圍只有 `https://www.googleapis.com/auth/drive.file`（只能存取老師用本系統挑選或建立的檔案）加上 `openid email`（顯示連結的帳號）。
  - 回呼網址 `http://localhost:3000/api/google/callback`；帶 `access_type=offline`、`prompt=consent` 取得 refresh token，系統重開後不必重新登入。
  - `state` 為一次性的隨機值（`crypto.randomBytes(32)`），伺服器記住它對應的老師工作階段，10 分鐘過期，防止 CSRF 與冒用。
  - 老師的授權（refresh token 等）存在 `credentials/google-token.json`（已在 `.gitignore`，檔案權限 0600）；解除連結時先向 Google 撤銷再刪檔。
  - 系統本身的用戶端設定只放在環境變數：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID`；`.env.example` 只列變數名稱。任何 token 都不得寫入 log（原則 VI）。
  - Google Cloud 專案的 OAuth 同意畫面維持「測試」狀態，把老師帳號與助教測試帳號加入測試使用者；README 寫設定步驟。
- **Rationale**: `drive.file` 是 Google 歸類為非敏感的範圍，不需要送審，而且符合 spec「只能存取老師挑選過的檔案」；refresh token 存在本機憑證檔符合原則 VI。
- **Alternatives considered**: `spreadsheets` 範圍＋貼網址（使用者在 clarify 選了檔案選擇器，且該範圍可存取所有試算表）；服務帳戶（使用者在 clarify 選了老師登入）；把 token 存在瀏覽器（003 在伺服器端寫回時拿不到，且重開分頁就失效）。

## R3. 檔案選擇器（Google Picker）

- **Decision**: 老師的匯入頁載入 Google 的 `https://apis.google.com/js/api.js`，用 `google.picker.PickerBuilder`：
  - `ViewId.SPREADSHEETS`（只顯示試算表）、`setOAuthToken(accessToken)`、`setDeveloperKey(apiKey)`、`setAppId(appId)`。
  - `accessToken`、`apiKey`、`appId` 由 `GET /api/google/picker-session` 取得（只回給老師，access token 約 1 小時過期）；`setAppId` 必須是同一個 Google Cloud 專案編號，Google 才會把被挑選的檔案授權給本系統的 `drive.file` 範圍。
  - 選擇器回傳 `docs[0].id` 作為 `spreadsheetId`；老師關閉選擇器時回傳 `cancel`，前端維持原狀（AC-12）。
- **Rationale**: 這是 `drive.file` 範圍下讓系統取得「老師指定檔案」存取權的標準做法。`GOOGLE_API_KEY` 會出現在老師的瀏覽器裡，在 Google Cloud 限制它只能呼叫 Picker API、只接受 `http://localhost:3000` 來源，並一樣不寫進 repo。
- **Alternatives considered**: 自己列出雲端硬碟檔案（`drive.file` 範圍看不到老師的其他檔案，做不到）。

## R4. 讀取試算表：Sheets API v4

- **Decision**: 伺服器用 `@googleapis/sheets` 與 `@googleapis/drive`（官方拆分套件，比完整的 `googleapis` 小），包成專案自己的 `SpreadsheetReader` 介面（類別圖的「Spreadsheet 抽象」），解析邏輯只依賴 `Sheet` 介面：
  - `info(spreadsheetId)`：`spreadsheets.get`，`fields=properties.title,sheets.properties(sheetId,title)`；另用 Drive `files.get`，`fields=capabilities/canEdit` 判斷能否寫回（AC-13）。
  - `open(spreadsheetId, sheetId)`：`spreadsheets.get`，`ranges=['<工作表名稱>']`、`includeGridData=true`、`fields=sheets(properties,merges,data.rowData.values(formattedValue,effectiveValue))`。
  - `GoogleSheet` 把回應轉成 `Sheet`：`textAt` 用 `formattedValue`；`valueAt` 用 `effectiveValue`（分辨數字 1 與文字「1」）；`merges` 的 GridRange（0 起算、結尾不含）轉成 1 起算的 `RowRange`。
  - 每次請求逾時 15 秒（AC-14）。錯誤對應：refresh 失敗或 401 → `AUTH_EXPIRED`；403、404 → `NO_ACCESS`；逾時或網路錯誤 → `NETWORK_ERROR`。
- **Rationale**: 一次請求就拿到儲存格內容與合併範圍，200 題的學習單資料量很小，SC-004 的 5 秒目標足夠。介面讓單元測試可以用假工作表，不用連線 Google（原則 VIII）；換成別的來源時解析邏輯不用改（原則 III）。
- **Alternatives considered**: `spreadsheets.values.get`（拿不到合併範圍，無法判斷題組）；Apps Script 網頁應用程式（要另外部署在 Google 端，兩組都難以重現）。

## R5. 表頭與欄位的執行期辨識規則

- **Decision**: `HeaderLocator` 逐列掃描，第一個同時含有「題號欄表頭」與「作答欄表頭」的列就是表頭列。比對方式：儲存格文字去除前後空白（含全形空白）後完全相等。
  - 題號欄：`題號`、`編號`、`題次`；作答欄：`作答`、`答案`、`回答`；題目欄（可以沒有）：`題目`、`問題`、`題幹`
  - 表頭儲存格是合併儲存格時，欄位取合併範圍的最左欄。
- **Rationale**: 完全相等可以避免「學生作答」「答案說明」這類欄位被誤判；找不到時拒絕匯入並列出可用的表頭寫法（REQ-IMP-05），不猜測（原則 IV）。
- **2026-11-19 review 決定**：拿掉手動指定欄位（作業沒有要求、要多一個畫面與流程）；保留同義詞（拿掉手動指定後，它是助教學習單表頭不同時唯一的備援，成本只是一張清單）。
- **Alternatives considered**: 子字串比對（誤判風險高）；比對儲存格格式（助教的試算表格式不一定相同）。

## R6. 題組、小題標記與舊答案的判定

- **Decision**: 題號儲存格位於跨多列的合併範圍內 → 題組，範圍內每一列的作答欄儲存格是一個小題。小題標記為開頭的 `（n）` 或 `(n)`。填空格文字拆成標記與剩餘文字；剩餘文字去除空白與底線（`_`、`＿`）後不為空，就是舊答案 → `OLD_ANSWER` 警告。
- **Rationale**: 依題號欄的合併範圍判定，不依標記判定（AC-11）；底線常被當成「空格」。

## R7. 題號規則與錯誤

- **Decision**: 題號是正整數（數字 `1`、`1.0` 或文字 `"1"` 都接受），不重複且由上到下嚴格遞增，允許跳號；題數上限 200。違反時丟出 `ImportError`，訊息包含列號與題號。
- **Rationale**: 對應 REQ-IMP-06、11。

## R8. 老師身分

- **Decision**: 匯入與 Google 相關的 API 都要帶老師憑證（`Authorization: Bearer <token>`，由 002 的老師工作階段 API 發出）。唯一例外是 `GET /api/google/callback`：它是 Google 把瀏覽器導回來的網址，帶不了標頭，改以 R2 的一次性 `state` 對應到老師工作階段。
- **Rationale**: REQ-IMP-15 規定只有老師能匯入；老師身分在三個子功能共用，避免各做一套。

## R9. 匯入結果的保存

- **Decision**: `QuestionSetStore` 以記憶體保存目前的 `QuestionSet`（含 `GuidedNotesSource`：試算表 ID、名稱、工作表 ID 與名稱）。不再保存原始檔案：003 直接寫回同一份試算表。持久化由 003 的活動紀錄檔負責。
- **Rationale**: 001 只需要「目前這一份」；避免兩處各存一份造成不一致。

## R10. 測試策略

- **Decision**:
  - 單元測試：`HeaderLocator`、`QuestionScanner`、`GuidedNotesParser` 用記憶體中的假 `Sheet`。
  - 轉換測試：把兩份範本的 `spreadsheets.get` 回應存成 JSON fixture（形狀依 Sheets API v4 文件），測 `GoogleSheet` 的轉換（合併範圍、數字題號）。
  - `GoogleAuthService` 用假的 `OAuth2Client` 與暫存目錄測：`state` 驗證、存檔、解除連結刪檔、log 不含 token。
  - 真正連線 Google 的流程需要憑證，只做人工驗證（quickstart），結果記錄在 `manual-verification.md`。
- **Rationale**: 自動化測試不依賴網路與憑證，CI 也能跑；連線部分由人工驗證補足（原則 VIII）。
