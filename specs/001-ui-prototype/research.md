# Research: 畫面與流程原型

001 是第一個進入 plan 的子功能。RD-01 到 RD-08 是整個專案共用的技術選擇（2026-11-21 經使用者決定），之後整理成 `docs/architecture.md`；RD-09 以後是 001 自己的設計決定。

限制條件來源：

- `docs/assignment.md`：本機執行、以多個瀏覽器分頁模擬；直接讀寫線上的 Google Sheets（10/21 助教補充）；金鑰不得進入 repo。
- constitution，特別是 III（分層與依賴抽象）、V（單一權威來源）、VI（最小揭露與機敏資料）、VIII（測試）、IX（程式碼規範）。
- `docs/feature-split.md` 3.3：001 的按鈕透過介面呼叫，由模擬實作提供；後續子功能以新增真正的實作取代，不修改畫面。

共同前提：

- V 與 VI 要求共享狀態與「作答期間看不到其他組」都在伺服器端執行，所以不採用只靠瀏覽器（例如分頁之間以 BroadcastChannel 互傳）的做法。
- VI 要求金鑰只在伺服器端的 `.env` 或 `credentials/`，所以 002 起需要本機伺服器。
- 001 只提供模擬實作，且重新整理即回到「沒有活動」（M7），依 XI 不建立伺服器。

---

## RD-01 前端技術

- **Decision**: React + TypeScript（strict）+ Vite。
- **Rationale**: AI 生成品質穩定；元件化直接對應 IX「介面元件只實作一次」；TypeScript 讓「頁面只依賴介面」在編譯時檢查，真正的實作與介面不符時會報錯；Vite 內建 CSS Modules，也是 Vitest 的基礎。
- **Alternatives considered**:
  - Vue 3 + TypeScript：模板接近設計稿 HTML，但 AI 生成品質與測試生態略遜。
  - 原生 TypeScript + Web Components：頁面切換、狀態、元件重用都要自己做，成本最高。
- **對後續子功能的影響**: 介面與實體型別可和後端共用；002–006 只新增服務實作，頁面不改。

## RD-02 後端技術（002 起建立）

- **Decision**: Node.js 24 LTS + TypeScript + Fastify。repo 以 npm workspaces 分為 `frontend/`、`server/`、`shared/`。
- **Rationale**: 和前端同語言，實體型別放在 `shared/` 只定義一次；有官方 `googleapis` 套件；Fastify 內建 pino logging 與 `inject()` 測試。Node 22 已進入維護期，採用 24 LTS。
- **Alternatives considered**:
  - Python + FastAPI：前後端兩種語言，型別與測試工具都要兩套。
  - Google Apps Script 或不設伺服器：無法滿足 V、VI，也難以自動化測試。
- **對後續子功能的影響**: 001 只建立 `frontend/` 與 `shared/`；002 建立 `server/`。

## RD-03 即時通訊方式（004、005 起使用）

- **Decision**: 指令走 HTTP REST；狀態推播走 WebSocket（Socket.IO）。伺服器推送完整的狀態快照，並依角色與組別分 room 推送不同內容。
- **Rationale**:
  - 以 room 依「老師、第 n 組」推送，在伺服器端落實 R9 與 VI。
  - 推送完整快照，客戶端不自行推導狀態（V）。
  - WebSocket 不受瀏覽器對同一網域 6 條 HTTP/1.1 連線的限制；本系統以多個分頁模擬（1 位老師 + 6 組學生就超過 6 個分頁），SSE 會在第 7 個分頁卡住。
  - 指令走 REST，002 的「伺服器拒絕未登入者使用老師功能的請求」用 HTTP middleware 最好實作與測試。
  - 搶答順位一律以伺服器收到請求的順序決定，與通訊方式無關。
- **Alternatives considered**:
  - REST + Server-Sent Events：會撞到上述 6 條連線限制，本機要開 HTTP/2 又需要 TLS。
  - 輪詢：階段同步有延遲（R11），分頁多時請求量大。
- **對後續子功能的影響**: 前端的 `onPhaseChange`、`onActivityChange`、`onSubmissionsChange`、`onJudgement` 由真正的實作改為訂閱 Socket.IO 事件，介面不變（類別圖已改為回傳 `Unsubscribe`）。Socket.IO 設定為只使用 WebSocket 傳輸、不使用長輪詢，由 004 決定（spec D22）。

## RD-04 模擬實作的位置

- **Decision**: 放在前端，以 in-memory 的 `Mock*Service` 實作介面（組件圖的設計）。每個分頁各有一份模擬狀態，重新整理即重置。
- **Rationale**: 與三張圖一致；001 不需要伺服器；重新整理即重置自然符合 M7；每個分頁獨立，方便展示。每個介面可分開替換，只要任一介面仍是模擬實作，`isMockMode()` 為 true（FR-005）。
- **Alternatives considered**:
  - 放在後端：001 就要建伺服器（違反 XI）；伺服器狀態被所有分頁共用，與 M7 衝突。
  - MSW 攔截網路請求：要在 001 先定好 002–006 的 REST 格式（違反 XI），且與組件圖不一致。
- **對後續子功能的影響**: 後續子功能在前端新增真正的實作（例如 `HttpActivityService`），只修改 `createServiceRegistry()` 中的綁定；這是預期中的修改，不算修改既有實作。頁面不改。見 plan「替換模擬實作的方式」。

## RD-05 資料保存方式

- **Decision**: 活動狀態只存在伺服器記憶體；學習單的來源與寫回目標是 Google Sheets。前端不以 localStorage 保存共享狀態。001 的模擬狀態只存在各分頁記憶體。
- **Rationale**: 需求沒有要求保存活動紀錄；伺服器記憶體就是唯一的權威來源（V）。
- **Alternatives considered**:
  - 本機 JSON 或 SQLite：沒有需求要求（XI），多一層資料存取要測試。
  - 活動狀態存進 Google Sheets：有延遲與 API 配額（每位使用者每分鐘約 60 次），並在學習單上多寫資料。
- **對後續子功能的影響**: 004 在伺服器記憶體建立活動狀態；006 直接寫回 Sheets。伺服器重啟後進行中的活動會消失，這是接受的限制。

## RD-06 使用者身分與機敏資料（記錄給 002–005）

- **老師身分必須能區分分頁**：本系統用同一個瀏覽器的多個分頁模擬老師與學生；cookie 由所有分頁共用，學生分頁的請求也會帶上老師的 cookie。所以老師的 session **不得**只靠 cookie 識別，架構上要求老師身分能以分頁區分。具體做法由 002 決定。
- **金鑰位置**：OAuth client secret 與 token 只放在伺服器端的 `.env`、`credentials/`（已列入 `.gitignore`）。
- **Google Picker 的 API key**：「從 Google 雲端硬碟挑選」使用的 Picker API 需要一把瀏覽器端的 API key，執行時在瀏覽器中一定看得到。可經由 `frontend/.env.local` 注入而不進 repo，但它不是祕密，應在 Google Cloud 主控台限制可用的網域與 API。由 002、003 處理。
- **學生組別由伺服器判斷**：學生加入組別後，伺服器依連線身分記住該連線的組別；送出答案與接收判定時，前端不傳組別，避免任何分頁冒用其他組別（原則 VI）。介面已依此設計（`submitAnswer`、`onJudgement`、`leaveGroup` 不帶組別），具體的連線身分做法由 004、005 決定。
- **老師重新整理頁面**：活動進行中老師重新整理時，活動要結束還是回到控制台，由 004 決定（spec D21）；001 目前重新整理一律回到首頁（RD-11）。
- 001 不使用任何金鑰。

## RD-07 Logging

- **Decision**: 伺服器使用 pino 輸出結構化 JSON，以 `redact` 遮蔽 `authorization`、cookie、token 等欄位（VI）；記錄「收到送出、順位、判定」等事件，供人工驗證對照（VIII）。前端不建立 logging 框架。
- **Alternatives considered**: 直接使用 `console.log`（容易印出 token，違反 VI）；winston（比 pino 重，與 Fastify 重複）。
- **對後續子功能的影響**: 002 起使用；005 記錄搶答順位。001 沒有伺服器，不做 logging。

## RD-08 測試方式

- **Decision**:
  - 單元與元件測試：Vitest + @testing-library/react（jsdom）。
  - 端對端測試：Playwright，在一個測試中開多個分頁與瀏覽器 context。
  - 後端（002 起）：Vitest + Fastify `inject()`；Google API 一律以替身取代。
  - 人工驗證紀錄：`specs/NNN-*/manual-verification.md`。
- **Rationale**: Vitest 沿用 Vite 設定，不必另外設定 TypeScript 轉譯。Playwright 能在一個測試中模擬「1 位老師 + 多組學生」，004 的階段同步、005 的搶答順位都能以 E2E 驗證。測試不依賴真實的外部服務（VIII）。
- **Alternatives considered**:
  - Jest + Cypress：Jest 搭配 Vite 與 ESM 需另外設定；Cypress 一個測試只能控制一個分頁，無法驗證多分頁同步。
  - 只用 Vitest：跨頁面流程（SC-001、SC-002）與多分頁同步沒有自動化測試。
- **001 的測試分層**:
  - `tests/unit`：每個模擬實作依 M1–M8 回傳正確結果；`ServiceRegistry` 的 `isMockMode()` 與模擬控制是否存在。
  - `tests/component`：每個頁面以假的 `ServiceRegistry` 驗證按鈕呼叫正確的介面方法、依回傳結果切換到「頁面與按鈕」表中的目的頁（FR-002、FR-003）、驗證錯誤顯示在欄位旁（FR-008）、非預期錯誤顯示在 `ErrorArea` 且不切換頁面（FR-009）。
  - `tests/e2e`：走過畫面流程圖的每個狀態與每條箭頭（SC-001、SC-002），每頁都有「模擬模式」標示（SC-003），移除的元素不出現（SC-004），學生頁面不出現他組作答（SC-007）。

## RD-09 樣式做法

- **Decision**: 原生 CSS + CSS Modules。設計稿 `:root` 中深色主題的 CSS 變數原樣放進 `frontend/src/styles/tokens.css`；**只做深色主題**，不實作 `data-theme`、`prefers-color-scheme` 或淺色變數。設計稿的 inline style 整理成各元件的 CSS Module。
- **學生頁面版面**: `AppRouter` 為學生頁面套上 390 px 寬、水平置中的欄位；不另外設計桌面版面，也不做完整的響應式設計（spec Assumptions）。
- **按鈕位置**:
  - 頁面只有一個返回類按鈕時（T-Login、T-Pick、S-Join），放在卡片正下方置中，使用 ghost 樣式。
  - 頁面有返回類與前進類一組按鈕時（T-Import、T-ImportError、T-Setup、T-Lobby，以及 US3–US5 的老師頁面），放在固定於畫面底部的動作列：返回類在左，主要按鈕在右。動作列不隨內容捲動；內容底部要留出動作列的高度，避免被遮住。
  - 只作用於某個區塊的按鈕（例如 T-Import 學習單卡片上的「重新挑選」）留在該區塊內。
- **字型**: 沿用設計稿的 Inter 與 Noto Sans TC，以 `@fontsource/inter`、`@fontsource/noto-sans-tc` 套件從本機載入，後備字型為 `system-ui`。不使用 Google Fonts，避免自動化測試（含 Playwright）連到外部服務（原則 VIII），離線時也能正確顯示。
- **Rationale**: 顏色變數不需改寫；CSS Modules 讓每個元件的樣式各自獨立（IX）；不需要執行期套件。只做一種主題，每頁只需人工驗證一次。
- **Alternatives considered**: Tailwind CSS（JSX 中的 utility class 不易與設計稿對照，同樣的組合容易重複）；CSS-in-JS（執行期產生樣式，沒有額外好處）。
- **對後續子功能的影響**: 顏色集中在變數中，之後要新增主題時只新增一組變數值。

## RD-10 圖中組件與程式碼的對應

| 圖中的組件或類別 | 檔案 |
| --- | --- |
| AppRouter | `frontend/src/app/AppRouter.tsx` |
| HomePage、TeacherLoginPage、PickPage、ImportPage、SetupPage、ConsolePage、TeacherResultsPage | `frontend/src/pages/` 下同名檔案 |
| JoinPage、StudentPlayPage、StudentResultsPage | `frontend/src/pages/student/` 下同名檔案 |
| AppHeader、QuestionProgress、SubmissionTable、GroupGrid、ConfirmDialog、SheetPreview、ErrorArea、MockModeBadge、MockControlBar | `frontend/src/components/` 下同名檔案 |
| AuthService、GuidedNotesService、ActivityService、SubmissionService、ResultService、PhaseMockControl、JudgementMockControl、TeammateMockControl、ValidationMockControl、UnexpectedErrorMockControl、MockChoicePrompt、ChoiceRequest、ChoiceOption、Unsubscribe | `frontend/src/services/interfaces.ts` |
| ServiceRegistry | `frontend/src/services/ServiceRegistry.ts`；綁定在 `createServiceRegistry.ts` |
| Entities package（含 UnexpectedError、JudgeOutcome） | `shared/src/entities.ts` |
| Mock*Service、MockFixtures、MockSession | `frontend/src/services/mock/` 下同名檔案 |

## RD-11 頁面切換

- **Decision**: `AppRouter` 以 React state 保存目前的頁面與頁面參數，不使用 URL 路由，也不使用路由套件。開啟或重新整理分頁一律回到首頁。
- **瀏覽器上一頁（FR-014）**: `AppRouter` 每次切換頁面時以 History API（`pushState`）加入一筆不改變網址的紀錄，並監聽 `popstate`：
  - 有確認視窗或模擬選擇器開啟時，只關閉它（等同按其取消類按鈕）。
  - 目前頁面有不呼叫介面的返回類按鈕（T-Login、S-Join 的「返回首頁」，T-Pick、T-Import、T-Setup 修改模式的「取消」，T-Setup 建立模式的「上一步」）時，執行與該按鈕相同的切換。
  - 其他頁面再加入一筆紀錄，停留在原頁面，不改變頁面與資料。
  - 返回類按鈕的目的頁集中在 `AppRouter` 的一張對照表；頁面上的按鈕與上一頁都呼叫同一個 `navigate` 目的頁，對照表只記錄 FR-014 的對應，不另外實作切換（IX）。`AppRouter` 已以 `PageState` 列出所有頁面，集中一處比讓各頁宣告少一個頁面與 `AppRouter` 之間的介面。
  - 確認視窗與模擬選擇器都以 `ConfirmDialog` 呈現；`ConfirmDialog` 以堆疊記錄開啟中的視窗，並匯出 `closeTopDialog()`，`AppRouter` 收到 `popstate` 時先呼叫它，有視窗被關閉就停止（組件圖 `AppRouter ..> ConfirmDialog`）。
- **Rationale**: spec 沒有任何以網址進入頁面的需求（學生由首頁選「我是學生」進入）；重新整理回到首頁，與 M7「重新整理回到沒有活動」一致；少一個套件（XI）。
- **Alternatives considered**: React Router 等 URL 路由：可直接以網址開啟某頁，但重新整理後頁面與重置的模擬狀態不一致，且沒有需求；它的「上一頁」會回到任意歷史頁面，與 FR-014「沒有返回類按鈕的頁面停在原頁」衝突。
- **對後續子功能的影響**: 004 若需要「學生重新整理後回到原組別」或「老師重新整理後回到控制台」（spec D21），須先修改 001 的頁面切換。

## RD-12 階段推動的切換

- **Decision**: 學生頁面與首頁透過 `ActivityService.onPhaseChange` 訂閱階段，依「階段推動的切換」表切換頁面；`S-Answer` 透過 `SubmissionService.onGroupSubmitted` 得知同組組員送出；`S-Submitted` 透過 `SubmissionService.onJudgement` 訂閱判定（接受時本題結束，頁面切換仍由 `onPhaseChange` 推動，不由判定結果推導階段）；老師端點「接受」後依 `judge` 回傳的 `JudgeOutcome.activity` 切換；老師端 T-Lobby 透過 `onActivityChange`、T-Live 透過 `onSubmissionsChange` 即時更新。001 由模擬控制列（`advancePhase`、`simulateJudgement`、`simulateTeammateSubmission`）觸發這些事件；「模擬：接受」同時推進階段（M6）。
- **Rationale**: 頁面對事件的反應在 001 就寫好，004、005 只需以真正的實作推送同樣的事件，頁面不改（feature-split 3.3）。頁面只呈現事件帶來的 `Activity`，不自行推導階段（V）。
- **與 FR-006 的關係**: 001 不實作跨分頁的階段同步；同步由 004 的真正實作提供。

## RD-14 加入組別後的目的頁

- **Decision**: S-Join 點「加入第 n 組」後，依 `joinGroup` 回傳的 `Activity.phase` 決定目的頁：`PREPARING` → S-Wait；`QUESTION_ENDED` → S-QuestionDone（S8）；`FINISHED` → S-Results（S9）；`OPEN` → 再呼叫 `SubmissionService.getGroupSubmission(q)`，`null` 進入 S-Answer（S4），有送出則進入 S-Submitted 並依 `judgement` 顯示等待判定或不接受（S10）。
- **Rationale**: `joinGroup` 只回傳活動，`onGroupSubmitted` 只通知訂閱之後的送出，頁面無法得知本組在加入前是否已送出。以查詢方法明確取得，頁面在 001 就能寫好 S10 的切換並以假的 registry 測試；005 只新增實作，不改頁面（feature-split 3.3）。查詢與其他學生端方法一樣不傳組別（原則 VI）。
- **Alternatives considered**: 訂閱 `onGroupSubmitted` 時立即重送已有的送出：真正的實作經網路非同步送達，頁面會先顯示 S-Answer 再跳到 S-Submitted（違反 FR-056a「不進入作答頁」），或要新增 spec 沒有的載入中狀態（違反原則 II）。
- **001 的模擬實作**: `getGroupSubmission` 依 `MockSession` 回傳本組這一題的送出；學生加入時本組一定還沒送出，所以回傳 `null`，S10 不觸發（spec SC-002 除外項）。S8、S9 以「模擬：推進到下一個階段」在 S-Join 推進到對應階段後加入即可展示。

## RD-13 介面回傳的錯誤

- **Decision**:
  - **預期中的失敗是回傳值**：依類別圖，`createActivity`、`updateSettings`、`submitAnswer` 回傳 `Promise<實體 | ValidationError>`；`readWorksheet` 回傳 `Promise<ImportSuccess | ImportError>`；登入失敗、寫回失敗由 `SignInResult`、`WriteBackResult` 表示。頁面以 `shared/src/guards.ts` 的型別判斷函式區分。
  - **非預期錯誤以 reject 表示**：連不上伺服器等非預期錯誤，介面的 Promise 以 `UnexpectedError`（`message`）reject。頁面捕捉後停留在原頁、不改變已輸入的內容，在共通的 `ErrorArea` 顯示 `message`；由確認視窗的按鈕引起時先關閉視窗。切換頁面或該頁下一次介面呼叫成功時清除（FR-009）。
  - **真正的實作的責任**：002–006 的實作必須把自己的非預期錯誤轉成 `UnexpectedError`，訊息文字由該子功能定義；頁面不解讀錯誤種類。
  - **001 的觸發方式**：「模擬：非預期錯誤」呼叫 `UnexpectedErrorMockControl.failNextCall()`（由 `MockSession` 實作）；仍是模擬實作的服務在下一次被按鈕觸發的呼叫中 reject「模擬：連不上伺服器」（M9）。
- **Rationale**: 預期中的失敗各有專屬的呈現位置（欄位旁、登入失敗訊息區、寫回結果）；非預期錯誤集中在一個共通位置，002 起接上伺服器與 Google 時不必修改頁面（spec FR-009 的依據）。
- **Alternatives considered**: 把非預期錯誤也當成回傳值（每個方法的回傳型別都要加上聯集，類別圖的每個簽章都要改，頁面每次呼叫都要多判斷一次）；由 `AppRouter` 統一捕捉並顯示（頁面無法保留原本的狀態與輸入內容，也無法關閉自己的確認視窗）。
- **未涵蓋的情況**: 訂閱（`onPhaseChange`、`onActivityChange`、`onSubmissionsChange`、`onJudgement`）中斷時如何通知頁面，目前的介面沒有管道；由 004、005 決定，若需要新增管道，須先修改 001 的 spec 與類別圖。
