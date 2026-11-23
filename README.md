# 課堂搶答系統（SpecKit 組）

## 系統簡介

老師從 Google Sheets 匯入填空式學習單（Guided Notes），學生以組為單位線上搶答，
老師依送出順序決定是否接受各組答案，第一個被接受的組別為搶答成功，
搶答結束後把成功的答案寫回原學習單的填空格。
系統在本機執行，以多個瀏覽器分頁模擬老師與各組學生。

本專案以 SpecKit 進行規格驅動開發，並導入 Diagram First Development。

## Repo 內容

| 路徑 | 用途 |
| --- | --- |
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
2. OAuth 同意畫面：類型「外部」、狀態「測試」；範圍加入 `openid`、`email`、`.../auth/drive.file`；測試使用者加入老師帳號與助教測試用帳號。
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
