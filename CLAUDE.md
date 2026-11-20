# CLAUDE.md

## 1. 規則來源

依下列順序判斷，數字小的優先。內容互相衝突時，不可自行選擇，也不可直接修改程式碼來遷就；必須停下來指出衝突，由使用者決定要修改哪一份文件。

| 優先 | 檔案 | 規範內容 |
| --- | --- | --- |
| 1 | `.specify/memory/constitution.md` | 專案原則，不可違反 |
| 2 | `specs/NNN-*/spec.md` | 該功能的需求與驗收準則，是需求的唯一依據 |
| 3 | `specs/NNN-*/plan.md`、`research.md`、`data-model.md`、`contracts/` | 技術選型與設計 |
| 4 | `diagrams/NNN-*.puml` | 該功能的組件圖、類別圖、時序圖，是設計的藍圖 |
| 5 | `specs/NNN-*/tasks.md` | 實作任務與順序 |
| 6 | `CONTRIBUTING.md` | 分支、commit、PR 規範，以及語言規範（程式碼註解、命名、分支用英文；commit 訊息中英皆可） |

- `docs/assignment.md`：作業原文摘錄，不可修改；只能在文末「助教補充」一節新增助教回覆或公告的原文，並註明日期，不加入解讀。spec 的每條需求都必須能追溯到它；實作時以 spec 為準。
- `docs/templates/`：Guided Notes 範本樣本，在 `/speckit-specify` 階段用來分析格式。
- `docs/feature-split.md`：子功能拆分，記錄各子功能涵蓋的需求與分支名稱。`/speckit-specify` 時以它決定該子功能涵蓋哪些需求。要調整子功能範圍或加入額外功能時，先修改這份文件。

## 2. 功能開發流程

每個功能依序執行下列步驟。前一步的「通過條件」成立後，才能進入下一步。每個步驟都在新的對話中開始（先執行 `/clear`）。

執行步驟 1 之前，必須先從 `main` 建立並切換到 `NNN-功能名稱` 分支，名稱與即將建立的 `specs/` 資料夾相同。SpecKit 不會自動建立分支。

| 步驟 | 指令 | 產出 | 通過條件 |
| --- | --- | --- | --- |
| 0 | `/speckit-constitution`（整個專案一次） | `constitution.md` | 已無範本佔位符（`[PRINCIPLE_1_NAME]` 等） |
| 1 | `/speckit-specify` | `specs/NNN-功能名稱/spec.md`、`diagrams/NNN-component.puml`、`NNN-class.puml`、`NNN-sequence.puml` 與同名 PNG | 三張圖的 `.puml` 與 PNG 都存在 |
| 2 | `/speckit-clarify` | 更新後的 `spec.md` | spec 中已無 `[NEEDS CLARIFICATION]` |
| 3 | `/speckit-plan` | `plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md` | plan 明確以三張圖為藍圖；`data-model.md` 與類別圖一致 |
| 4 | `/speckit-tasks` | `tasks.md` | 每條需求都對應到至少一個任務 |
| 5 | `/speckit-analyze` | `specs/NNN-*/analyze-report.md` | 沒有未處理的 CRITICAL 或 HIGH 問題 |
| 6 | `/speckit-implement` | 程式碼與測試 | 一次只執行一個 Phase；完成後停下，回報測試結果 |
| 7 | 圖表一致性驗證 | `specs/NNN-*/diagram-verification.md` | 程式碼中的組件、類別、方法、呼叫順序與三張圖一致，或差異已處理 |

## 3. 必須停止的情況

遇到下列情況時，不得繼續執行，要說明違反了哪一條，然後改做右欄的事。

| 情況 | 改做什麼 |
| --- | --- |
| 要求撰寫或修改產品程式碼，但該功能還沒有 `tasks.md`，或這項修改不在 `tasks.md` 中 | 執行第 2 節中尚未通過的最早步驟；修改不在 `tasks.md` 中時，視同行為變更，依下一列處理 |
| **IMPORTANT：** 要求改變系統行為，但 spec 沒有先修改 | 先修改 `spec.md` 並獨立 commit（類型 `spec`），再重跑 plan 與 tasks，最後才改程式碼 |
| **IMPORTANT：** specify 完成後缺少任何一張圖或 PNG，卻要進入 plan（違反 Diagram First） | 依 constitution 產生缺少的 `.puml`，轉成 PNG，確認三張都存在後才能進入 plan |
| 跳過或顛倒第 2 節的步驟 | 回到尚未通過的最早步驟執行 |
| 要求在 `main` 分支上修改或 commit | 依 `CONTRIBUTING.md` 第 1 節建立對應的分支，切換過去後再進行 |
| 要求讀取、印出或修改 `.env`、`credentials/` | 拒絕；只告訴使用者需要哪些變數名稱，由使用者自行填寫 |

## 4. Commit

被要求 commit 時，使用 `/feature-commit` skill，依它的檢查順序執行。
