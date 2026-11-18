# SpecKit 組分工表

> 成員 A、B 請替換為真實姓名。每份工作都有一位負責人，另一人負責 review PR。

## 分工原則：兩人從第一天就能平行開發

1. **先一起做半天骨架，之後誰都不用等誰**：骨架除了專案設定，還要先把 `contracts/` 裡的共用型別寫成程式碼、準備假資料，並建好各模組的空檔與掛載點（見下一節）。
2. **依子功能切，交界越少越好**：A 負責「學習單進出」（001 解析匯入、003 結果、寫回與 CSV），B 負責「即時搶答」（002）與「Google 授權」。兩人之間只透過三個點交換資料：`QuestionSet`（A → B）、`QuestionResult`（B → A）、`GoogleAuthService`（B → A），型別與介面在骨架裡就定好了。
3. **檔案各管各的**：每個資料夾只有一位負責人，平行開發時不會改到同一個檔案，PR 不會互相衝突。
4. **畫面照設計稿做**：每個畫面的 HTML 設計稿在 [`docs/design/`](design/README.md)，表格裡列了每個畫面對應的程式檔與負責人。
5. **各自用假資料測試**：B 用骨架裡的範例 `QuestionSet` 開活動；A 用骨架裡的範例搶答結果做寫回與 CSV，Google 授權先用空實作代替，不需要等對方完成。

## 第 0 步：骨架（一起，約半天）

依 CLAUDE.md，寫任何程式碼前要先有 tasks：三個子功能跑完 `/speckit-tasks` 與 `/speckit-analyze` 後，把各自的 Setup 階段合成一份，用 `/speckit-implement` 做出下表的骨架。骨架合併後，兩人才分頭開發。

| 項目 | 內容 | 讓誰不用等誰 |
| --- | --- | --- |
| 專案設定 | npm workspaces、TypeScript、Vite、Tailwind、Vitest、Express + Socket.IO 起點、`npm run dev`／`test` | 兩人 |
| 共用型別 | 把三份 data-model 與 contracts 寫成 `packages/shared/src/{guided-notes,activity,socket-events,results}.ts` | 兩人 |
| 範例資料 | `packages/shared/fixtures/`：兩份範本解析後的 `QuestionSet`、一場已結束活動的 `QuestionResult[]` | B 不用等 001，A 不用等 002 |
| 交界的空實作 | `QuestionSetProvider`（回傳範例 `QuestionSet`）、`ResultsService.onActivityCreated`／`onQuestionClosed`／`onActivityEnded`（先不做事）、`GoogleAuthService`（回傳「未設定」） | 兩人都呼叫得到對方的介面 |
| 環境變數範本 | `.env.example` 只列 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID`、`PORT`、`DATA_DIR` 的名稱 | 兩人 |
| 路由與頁面掛載點 | `server/src/index.ts` 先掛好所有路由檔與 gateway 的空殼；`web` 的 router 先列好所有頁面的空元件 | 之後兩人都不用改 `index.ts`、`App.tsx` |

## 子功能與負責人

| 工作 | 內容 | 量 | 負責人 | Reviewer |
| --- | --- | --- | --- | --- |
| `001` 匯入（Google 授權以外） | 讀取 Google 試算表、執行期找表頭、同義詞與手動指定欄位、題組、舊答案與無法寫回警告、匯入預覽頁 | 4 | 成員 A | 成員 B |
| `003-results-export` | 本機紀錄檔與重開還原、版面檢查、備份工作表、寫回 Google Sheets、CSV、結果 API、老師結果頁、學生結果頁 | 4.5 | 成員 A | 成員 B |
| `002` 排名策略 | `FirstArrivalPolicy`、`FairPolicy`：純函式，輸入輸出在 data-model 已定好 | 0.5 | 成員 A | 成員 B |
| `002` 壓力測試 | 依 `contracts/socket-events.md` 寫成黑箱測試：200 連線、1 秒 1,000 筆，檢查不遺失、序號連續、順位一致、延遲；B 的伺服器完成後執行 | 1 | 成員 A | 成員 B |
| `002` 伺服器端 | 老師憑證、建立活動、CommandQueue、序號、去重、倒數、資訊隔離、Broadcaster／Outbox、Socket.IO gateway | 4.5 | 成員 B | 成員 A |
| `002` 老師端頁面 | 設定活動（組數、秒數、公平模式）、等待頁、進行中控制台（開題、倒數、即時順位、結束確認） | 1.5 | 成員 B | 成員 A |
| `002` 學生端頁面 | 選組、等待、作答（題組）、本題結束 | 2 | 成員 B | 成員 A |
| `001` Google 授權 | 老師以 Google 帳號登入（OAuth）、本機憑證檔、解除連結、授權 API、前端 Google 檔案選擇器；依 `contracts/google-auth-http.md` | 1.5 | 成員 B | 成員 A |
| **合計** | | | **A 10、B 9.5** | |

2026-11-18 助教公告要求直接連線 Google Sheets 後，001 多了 Google 授權、003 多了寫回與備份，所以把獨立的 Google 授權模組交給 B，兩人的量再度接近。

為什麼這樣切：

- 001 與 003 都在處理 Guided Notes：003 寫回的位置就是 001 解析出的填空格，同一人負責，兩邊對「填空格」的理解不會不一致。
- Google 授權是獨立模組：只對外提供 `authorizedClient()` 與 `picker-session`，介面已寫在 contracts，A 讀寫試算表時先用空實作，B 完成後直接接上。
- 002 的伺服器端、老師端頁面、學生端頁面由同一人做：Socket.IO 事件的兩端都在 B 手上，改事件時不必跨人協調。
- 排名策略和壓力測試給 A：前者是純函式，只依賴共用型別；後者是黑箱測試，只依賴事件契約。兩者都可以從第一天開始寫，而且由沒寫排序邏輯的人來驗證，比較能抓到問題。

## 檔案歸屬

平行開發期間，只改自己負責的資料夾。需要改共用的部分（下表最後一列）時，開一個小 PR，先跟對方說。

| 負責人 | 資料夾或檔案 |
| --- | --- |
| 成員 A | `server/src/{import,spreadsheet,writeback,csv,record,results}/`、`server/src/store/QuestionSetStore.ts`、`server/src/buzz/ranking.ts`、`server/src/http/{importRoutes,resultsRoutes}.ts`、`server/tests/load/`、`web/src/pages/teacher/{ImportPage,ResultsPage}.tsx`、`web/src/pages/student/ResultsPage.tsx`、`web/src/lib/api.ts` |
| 成員 B | `server/src/buzz/`（`ranking.ts` 以外）、`server/src/session/`、`server/src/store/ActivityStore.ts`、`server/src/http/sessionRoutes.ts`、`web/src/pages/teacher/{SetupPage,LobbyPage,ConsolePage}.tsx`、`web/src/pages/student/{JoinPage,AnswerPage}.tsx`、`web/src/lib/socket.ts`、`server/src/google/`、`server/src/http/googleRoutes.ts`、`web/src/lib/googlePicker.ts` |
| 共用（改動前先講） | `packages/shared/`、`server/src/index.ts`、`web/src/App.tsx`、`web/src/components/` |

## 交界

| 交界 | 文件 | 提供者 → 使用者 | 平行開發時用什麼代替 |
| --- | --- | --- | --- |
| `QuestionSet`（含學習單來源） | `specs/001-guided-notes-import/contracts/question-set.md` | A → B | 骨架的範例 `QuestionSet` |
| `GoogleAuthService`（`authorizedClient`、`pickerSession`）與授權 API | `specs/001-guided-notes-import/contracts/google-auth-http.md` | B → A | 骨架的空實作；A 用測試替身跑 Reader／Writer |
| `onActivityCreated`／`onQuestionClosed`／`onActivityEnded` | `specs/003-results-export/plan.md` 藍圖對照 | B 呼叫 → A 實作 | 骨架的空實作 |
| `RankingPolicy.resolve` | `specs/002-buzzer-session/data-model.md` | A → B | B 先用「序號最小者勝」的一行實作 |
| Socket.IO 事件與 view | `specs/002-buzzer-session/contracts/socket-events.md` | B → A（壓力測試） | 契約本身；最後再接真的伺服器 |
| 結果、寫回、CSV API | `specs/003-results-export/contracts/results-http.md` | A 自己的前後端 | — |

## 與 OpenSpec 組對齊（作業規定兩組功能一致）

- 匯入／匯出（2026-11-18 助教公告）：直接連線老師雲端上的 Google Sheets。老師以自己的 Google 帳號登入授權，用 Google 檔案選擇器挑選學習單；寫回前先在同一份試算表複製備份工作表，再把答案直接寫入填空格。憑證只放在 `.env` 與 `credentials/`，不進 repo
- 搶答形式：**依題號一題一題開放**，可設定每題秒數；每組每題只能送出一次、送出後不能修改；每題結束立即公布成功組別與答案
- 時序與高併發的量級：200 個分頁、1 秒 1,000 筆送出
- 額外功能：題組（E1）、CSV（E2）、公平模式（E3）、本機紀錄與重開還原

## 時程（繳交期限 11/30 00:00）

| 日期 | 成員 A | 成員 B | 一起 |
| --- | --- | --- | --- |
| 11/18 | review 002 plan | review 001、003 plan | 合併 spec／plan PR；與 OpenSpec 組對齊 Google Sheets 做法；建立 Google Cloud 專案 |
| 11/19 | `/speckit-tasks` → `/speckit-analyze`（001、003） | `/speckit-tasks` → `/speckit-analyze`（002） | 確認 tasks 涵蓋交界；做骨架（第 0 步） |
| 11/20–11/21 | 實作 001 匯入 | 實作 002 伺服器端（順位、去重、隔離、倒數）；Google 授權 | 每天互相 review PR |
| 11/22 | 實作 003 伺服器端；排名策略 | 實作 002 老師端與學生端頁面 | |
| 11/23 | 003 結果頁；壓力測試 | 公平模式接上 A 的策略 | **整合日**：拿掉範例資料與空實作，接上真的模組與 Google 授權 |
| 11/24 | 跑壓力測試、回報 | 依壓力測試結果修正 | |
| 11/25 | 圖表一致性驗證（001、003） | 圖表一致性驗證（002） | |
| 11/26–11/27 | | | 用助教範本與變形檔完整跑一次，人工驗證並留下紀錄 |
| 11/28 | | | 錄 demo 影片（≤ 5 分鐘，老師端 + 至少 2 組學生） |
| 11/29 | | | 整理 AI 對話紀錄、心得、填繳交表單 |

## 協作規則（摘自 `CONTRIBUTING.md`）

- 一個子功能一個分支（`001-guided-notes-import`、`002-buzzer-session`、`003-results-export`）。A 在 002 的部分（排名策略、壓力測試）從 `002-buzzer-session` 另開短分支，例如 `002-buzzer-session-ranking`，PR 回 `main`。
- 自己的 PR 由另一位成員 review 並 approve 後，用 rebase and merge 合併；不能合併自己的 PR。
- 每完成一個任務（T 編號）一個 commit，訊息為英文並附 Refs。
- 改變行為前先改 spec，再重跑 plan 與 tasks。
