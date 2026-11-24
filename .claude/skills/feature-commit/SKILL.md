---
name: feature-commit
description: 被要求 commit 時使用。依序檢查機密、分支、流程產物、任務、測試、圖表與 spec 一致性，再依 CONTRIBUTING.md 拆分 commit 並提案，使用者確認後才執行。
---

# Feature Commit

先讀取 `CONTRIBUTING.md`，再依下列順序檢查。任何一項不通過，就停止並回報是哪一項、怎麼修正。不做部分 commit。

## 檢查順序

1. **機密**：變更與未追蹤的檔案中，沒有 `.env`、`credentials/`、金鑰或密碼。
2. **分支**：目前不在 `main`；分支名稱符合 `CONTRIBUTING.md` 第 1 節的命名規則。
3. **流程產物**：依 `CLAUDE.md` 第 2 節，到目前步驟為止的產出都存在，並符合通過條件。
4. **任務**：這次變更對應的任務在 `tasks.md` 中已打勾；列出該功能還沒完成的任務。
5. **測試**：執行 `quickstart.md` 或 `plan.md` 指定的測試指令，全部通過。例外：Red commit（`test`）只允許這個 Phase 新增的測試失敗；列出失敗的測試名稱，確認都屬於這個 Phase。
6. **圖表**：如果這次包含該功能的最後一個任務，`diagram-verification.md` 必須存在，而且沒有未處理的差異。
7. **一致性**：每個行為上的改變，都有對應的 spec 修改，而且 spec 的 commit 排在程式碼的 commit 之前。
8. **拆分與訊息**：依 `CONTRIBUTING.md` 2.4 節拆分（每個 SpecKit 階段一個 commit；implement 階段每個 Phase 一筆 `test`（Red）、一筆 `feat`（Green）、一筆人工驗證 `docs`；`fix`、`refactor`、`spec` 各自獨立；tasks.md 打勾和對應的工作放在同一筆，不單獨 commit）；類型、範圍、標題（中文或英文，依 2.2 節）、說明原因的內文、Refs 都符合規範。

## 提案格式

全部通過後，用下表列出提案，等使用者確認後才執行 commit：

| 順序 | 標題 | 包含的檔案 | Refs |
| --- | --- | --- | --- |
| 1 | `test(001): ...` | `tests/...`、`specs/001-*/tasks.md` | T010–T014, US1, AC-01 |

每個 commit 的內文另外列在表格下方，依 `CONTRIBUTING.md` 2.2 節：1–3 句，寫為什麼要做、解決什麼問題；不列檔案、步驟或測試數量；Red／Green commit 各加一行測試結果。例如：

```text
test(001): cover pages when the activity is cancelled

The mock never notifies a missing activity, so these tests stand in
for the manual check of the student pages.

Red: 7 new tests fail, 283 existing pass

Refs: T148–T152, FR-050, FR-051
```
