# 課堂搶答系統（SpecKit 組）

## 系統簡介

老師從 Google Sheets 匯入填空式學習單（Guided Notes），學生以組為單位線上搶答，
老師依送出順序決定是否接受各組答案，第一個被接受的組別為搶答成功，
搶答結束後把成功的答案寫回原學習單的填空格。
系統在本機執行，以多個瀏覽器分頁模擬老師與各組學生。

本專案以 SpecKit 進行規格驅動開發，並導入 Diagram First Development。

## 快速開始

需要 Node.js 24（見 `.nvmrc`）與 npm。

1. 安裝套件（第一次執行）：

   ```bash
   npm install
   ```

2. 設定 Google：執行下列指令，依提示貼上四個值，會寫入 `server/.env`（密鑰輸入時不會顯示；直接按 Enter 保留原本的值）。值由本組另外提供，或依下方「Google 登入設定」自行建立。沒有設定也能啟動，但無法登入。

   ```bash
   npm run setup
   ```
3. 啟動伺服器與前端：

   ```bash
   npm start
   ```

4. 用瀏覽器開 <http://localhost:5173>。老師按「我是老師」→「用 Google 登入」→「從 Google 雲端硬碟挑選」選擇學習單；學生在其他分頁按「我是學生」。按 Ctrl+C 停止。

同一台伺服器同一時間只有一位老師：任何人用 Google 登入都會取代前一位老師，前一位老師的分頁會顯示「老師登入已失效，請回首頁重新登入」。學生分頁不需要登入。

### 目前完成的範圍

| 功能 | 狀態 |
| --- | --- |
| 老師以 Google 登入（002） | 連線真正的 Google |
| 從 Google 雲端硬碟挑選並匯入學習單（003） | 連線真正的 Google 試算表 |
| 建立活動、搶答、判定、公布結果、寫回（004–006） | 仍是模擬實作，畫面上方標示「模擬模式」，以模擬控制列推進流程 |

### 測試

```bash
npm test                  # 前端的單元與元件測試
npm run test:server       # 伺服器的單元與整合測試
npm run test:e2e          # 瀏覽器端對端測試（第一次執行前先 npx playwright install chromium）
npm run typecheck         # 前端與 shared 的型別檢查
npm run typecheck:server  # 伺服器的型別檢查
```

自動化測試以替身取代 Google，不需要 `.env`。

## Repo 內容

| 路徑 | 用途 |
| --- | --- |
| `frontend/` | 前端（React + Vite），老師與學生的所有頁面 |
| `server/` | 伺服器（Fastify + Socket.IO），Google 登入與試算表讀寫 |
| `shared/` | 前端與伺服器共用的資料型別 |
| `specs/`、`diagrams/` | 各子功能的規格、設計、任務，以及 PlantUML 圖 |
| `.specify/` | SpecKit 設定與範本；專案憲法在 `memory/constitution.md` |
| `.claude/` | Claude Code 的 SpecKit 指令、commit 檢查 skill 與專案共用設定 |
| `docs/assignment.md` | 作業說明中與系統相關段落的原文摘錄，以及助教補充的原文 |
| `docs/templates/` | 助教提供的 Guided Notes 範本樣本，供規格分析使用 |
| `docs/feature-split.md` | 子功能拆分：各子功能涵蓋的需求、分支名稱與跨子功能的分工 |
| `CONTRIBUTING.md` | Git 協作規範 |
| `CLAUDE.md` | Claude Code 的工作規則：規則來源、功能開發流程、停止條件 |

## Google 登入設定

老師以 Google 帳號登入，同一次登入取得讀寫老師挑選的試算表的授權（`drive.file`）。執行系統的人需先在 Google Cloud 完成下列設定（只需做一次）：

1. 在 Google Cloud 建立專案，啟用 **Google Sheets API**、**Google Drive API**、**Google Picker API**。
2. OAuth 同意畫面：類型「外部」；範圍加入 `openid`、`email`、`.../auth/drive.file`。狀態為「測試」時，只有加入測試使用者的 Google 帳號能登入；發布為「正式版」後任何 Google 帳號都能登入（這三個範圍都不屬於需要 Google 審查的範圍）。
3. 憑證 → 建立 OAuth 用戶端 ID，類型「網頁應用程式」，**已授權的 JavaScript 來源**填 `http://localhost:5173`（不需要重新導向 URI）。
4. 憑證 → 建立 API 金鑰，限制為「Google Picker API」、網站來源 `http://localhost:5173/*`。
5. 專案編號（數字）就是 `GOOGLE_APP_ID`。
6. 在伺服器的環境變數設定下列名稱（可寫在 `server/.env`，已被 `.gitignore` 排除；格式見 `server/.env.example`）：

   | 變數 | 內容 |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | 第 3 步的用戶端 ID |
   | `GOOGLE_CLIENT_SECRET` | 第 3 步的用戶端密鑰 |
   | `GOOGLE_API_KEY` | 第 4 步的 API 金鑰 |
   | `GOOGLE_APP_ID` | 第 5 步的專案編號 |
   | `PORT`（可省略） | 伺服器埠，預設 3000 |

不要把任何值寫進 repo、文件或對話。缺少任一個 Google 變數時伺服器仍會啟動，log 會列出缺少的變數名稱，登入頁則顯示「伺服器尚未設定 Google 登入，請參考 README 設定環境變數」。
