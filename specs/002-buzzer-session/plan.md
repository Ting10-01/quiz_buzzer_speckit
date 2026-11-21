# Implementation Plan: 搶答活動

**Branch**: `002-buzzer-session` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-buzzer-session/spec.md`

## Summary

老師用 001 從 Google Sheets 匯入的題目建立活動（組數、每題秒數、公平模式），依題號一題一題開放；各組學生在自己的分頁作答、送出，伺服器依抵達順序給每筆送出唯一的序號，題目結束時由排名策略決定成功組別並立即公布。順序保證的核心是單一 `CommandQueue`：所有改變狀態的指令都在同一段同步程式碼中處理，序號在其中遞增（research R1）。推送以每連線一個 `Outbox` 處理慢連線（R4），倒數由伺服器 `QuestionTimer` 決定並走同一條佇列（R5）。學生端收到的資料在伺服器端就過濾，看不到其他組的答案與順位。

## Technical Context

**Language/Version**: TypeScript 5（`strict`），Node.js 24 LTS

**Primary Dependencies**: Socket.IO 4（即時雙向通道，server 與 client）、Express 5（老師憑證、建立活動的 HTTP）、React 19 + Vite + Tailwind CSS 4

**Storage**: 記憶體（`ActivityStore`）；每題結束後由 003 寫入本機活動紀錄檔（REQ-EXP-13）

**Testing**: Vitest（單元、整合，整合測試以真的 Socket.IO 連線跑在隨機埠）；React Testing Library；壓力測試 `npm run test:load -w packages/server`（R8）

**Target Platform**: 本機單一 Node 程序；瀏覽器 Chrome／Edge／Safari 最新版，多分頁模擬老師與各組

**Project Type**: Web application（npm workspaces monorepo，與 001 相同）

**Performance Goals**: 200 連線、1 秒內 1,000 筆送出：回覆 p95 ≤ 1 秒、最長 ≤ 2 秒；畫面更新落後 ≤ 1 秒（SC-001、SC-006、SC-007）

**Constraints**: 順序只由伺服器決定，不採用學生端時間（REQ-BUZ-11）；送出紀錄只能新增（NFR-03）；學生端不得收到其他組資料（REQ-BUZ-16）；不使用資料庫或外部服務

**Scale/Scope**: 2–20 組、每組最多 10 個分頁；老師 3 個頁面（設定、等待、進行中控制台），學生 2 個頁面（選組、作答）

## Constitution Check

*GATE: Phase 0 前通過；Phase 1 設計完成後重新檢查（結果相同）。*

| 原則 | 檢查 | 結果 |
| --- | --- | --- |
| I 圖表優先 | `diagrams/002-component/class/sequence` 三張圖與 PNG 都在；下方「藍圖對照」把每個元件與類別對應到程式路徑 | ✅ |
| II 規格先行與可追溯 | 每個 REQ-BUZ、NFR 都有 AC 或 SC；tasks 階段為每個 AC 建立測試任務 | ✅ |
| III 分層與依賴抽象 | `SessionGateway` 只做身分驗證與轉發；規則在 `ActivityService`／`BuzzEngine`；排名用 `RankingPolicy` 介面（兩個實作）；Socket.IO 只出現在 gateway 與 broadcaster | ✅ |
| IV 外部資料於執行期解析 | 題目與小題來自 001 的 `QuestionSet`，不寫死題數或小題數 | ✅ |
| V 單一權威狀態來源 | 階段、題目狀態、序號、倒數都只在伺服器；前端只顯示收到的 view（R9） | ✅ |
| VI 最小資訊揭露與機敏資料 | `VisibilityFilter` 在伺服器端產生學生 view，不含其他組資料；老師憑證只在伺服器記憶體與老師分頁的 `sessionStorage`（同一瀏覽器的學生分頁讀不到）；取回碼只印在伺服器終端機；兩者都不寫入檔案與 log；搶答過程不連線 Google，學生端拿不到任何 Google 授權 | ✅ |
| VII 輸入驗證與錯誤訊息 | 設定值範圍、送出內容（題號、slot、長度）、角色都在伺服器驗證；拒絕時回傳原因代碼 | ✅ |
| VIII 自動化測試與人工驗證 | 單元測試（排序、去重、公平模式、倒數）、Socket.IO 整合測試、壓力測試；quickstart 列出 10 個人工情境 | ✅ |
| IX 程式碼規範 | 頁面只透過 `lib/socket.ts` 收發事件；倒數、題目卡、結果卡做成共用元件；英文命名 | ✅ |
| X 人工把關 | 本 plan 需人工審查後才能進入 tasks | ⏳ 待審查 |
| XI 簡潔 | 不用資料庫、鎖或 worker；唯一的介面 `RankingPolicy` 有兩個實作（FirstArrival、Fair） | ✅ |

沒有需要說明的違反項目，所以不需要 Complexity Tracking。

## 藍圖對照（diagrams → 程式）

| 圖上的元件／類別 | 程式位置 | 來源圖 |
| --- | --- | --- |
| TeacherConsolePage | `packages/web/src/pages/teacher/SetupPage.tsx`（設定）、`LobbyPage.tsx`（等待）、`ConsolePage.tsx`（進行中、結束確認） | component、sequence |
| StudentJoinPage | `packages/web/src/pages/student/JoinPage.tsx` | component |
| StudentAnswerPage | `packages/web/src/pages/student/AnswerPage.tsx`（等待、作答、本題結束三種狀態） | component、sequence |
| SessionGateway、Participant、Role、TeacherCredential | `packages/server/src/session/SessionGateway.ts`、`session/TeacherCredential.ts` | component、class、sequence |
| CommandQueue | `packages/server/src/buzz/CommandQueue.ts` | component、class、sequence |
| ActivityService | `packages/server/src/buzz/ActivityService.ts` | component、class、sequence |
| QuestionTimer | `packages/server/src/buzz/QuestionTimer.ts` | component、class、sequence |
| BuzzEngine、SequenceClock | `packages/server/src/buzz/BuzzEngine.ts`、`buzz/SequenceClock.ts` | component、class、sequence |
| RankingPolicy、FirstArrivalPolicy、FairPolicy | `packages/server/src/buzz/ranking.ts`（純函式） | component、class、sequence |
| VisibilityFilter | `packages/server/src/buzz/VisibilityFilter.ts` | component、class |
| Broadcaster、Outbox | `packages/server/src/session/Broadcaster.ts` | component、class、sequence |
| ActivityStore | `packages/server/src/store/ActivityStore.ts` | component、class |
| Activity、Group、FairModeSetting、Phase、QuestionPhase、CloseReason、Submission、Command 系列、CommandResult | `packages/server/src/buzz/domain.ts` | class |
| QuestionResult、SubmitResult、SubmitStatus、QuestionOutline、TeacherView、StudentView、OwnSubmission、PublicResult、GroupStatus | `packages/shared/src/activity.ts` | class；契約見 `contracts/socket-events.md` |
| 003 ResultsService（題目結束時通知） | `ActivityService` 在建立活動、每題結束、活動結束時呼叫 `ResultsService.onActivityCreated()`／`onQuestionClosed()`／`onActivityEnded()`（003 實作；處理完佇列內的指令後才呼叫，不在臨界區內） | component、class、sequence |
| 老師憑證、建立活動 API | `packages/server/src/http/sessionRoutes.ts`；契約見 `contracts/session-http.md` | sequence |

## Project Structure

### Documentation (this feature)

```text
specs/002-buzzer-session/
├── spec.md
├── plan.md               # 本文件
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── session-http.md   # 老師憑證、建立活動
│   └── socket-events.md  # 即時事件與 view 型別
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks 產生
```

### Source Code (repository root)

```text
packages/
├── shared/src/
│   ├── activity.ts            # 002：view、結果等共用型別
│   └── socket-events.ts       # 002：事件名稱與 payload 型別
├── server/
│   ├── src/
│   │   ├── buzz/              # 002：領域與規則（不 import socket.io）
│   │   │   ├── domain.ts
│   │   │   ├── CommandQueue.ts
│   │   │   ├── ActivityService.ts
│   │   │   ├── QuestionTimer.ts
│   │   │   ├── BuzzEngine.ts
│   │   │   ├── SequenceClock.ts
│   │   │   ├── ranking.ts
│   │   │   └── VisibilityFilter.ts
│   │   ├── session/           # 002：Socket.IO 邊界
│   │   │   ├── SessionGateway.ts
│   │   │   ├── Broadcaster.ts
│   │   │   └── TeacherCredential.ts
│   │   ├── store/ActivityStore.ts
│   │   └── http/sessionRoutes.ts
│   └── tests/
│       ├── unit/buzz/         # 排序、去重、公平模式、倒數（假時鐘）
│       ├── integration/session/  # 真 Socket.IO 連線：角色、隔離、重連
│       └── load/              # R8 壓力測試
└── web/src/
    ├── pages/teacher/{SetupPage,LobbyPage,ConsolePage,RecoverPage}.tsx
    ├── pages/student/{JoinPage,AnswerPage}.tsx
    ├── components/            # Countdown、QuestionCard、ResultCard…
    └── lib/socket.ts          # Socket.IO client 包裝
```

**Structure Decision**: `buzz/` 是不依賴 Socket.IO 的純領域層，可用假時鐘與假 broadcaster 做單元測試；`session/` 是唯一碰 Socket.IO 的地方。前後端的事件與 view 型別放在 `shared`，任何一邊改動欄位都會在編譯期被發現。

## Complexity Tracking

無。
