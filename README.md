# 課堂搶答系統（SpecKit 組）

## 系統簡介

老師從 Google Sheets 匯入填空式學習單（Guided Notes），學生以組為單位線上搶答，
由系統判定最快送出的組別，搶答結束後把成功的答案寫回原學習單的填空格。
系統在本機執行，以多個瀏覽器分頁模擬老師與各組學生。

本專案以 SpecKit 進行規格驅動開發，並導入 Diagram First Development。

## Repo 內容

| 路徑 | 用途 |
| --- | --- |
| `.specify/` | SpecKit 設定與範本；專案憲法在 `memory/constitution.md` |
| `.claude/` | Claude Code 的 SpecKit 指令與專案共用設定 |
| `docs/assignment.md` | 作業說明中與系統相關段落的原文摘錄（唯讀） |
| `docs/templates/` | 助教提供的 Guided Notes 範本樣本，供規格分析使用 |
| `CONTRIBUTING.md` | Git 協作規範 |
