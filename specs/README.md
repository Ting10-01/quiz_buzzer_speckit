# 子功能拆分

本專案依 SpecKit 教學的建議，把系統拆成三個子功能。每個子功能都是一段完整的流程，有自己的 spec、plan、tasks、三張圖、分支與 PR，可以分開開發與測試。

## 三個子功能

| 編號 | 子功能 | 範圍（做什麼） | 不做什麼 | 文件 | 圖表 |
| --- | --- | --- | --- | --- | --- |
| 001 | Guided Notes 匯入 | 老師以 Google 帳號授權、用檔案選擇器挑選試算表、在執行期辨識表頭／題號／題組／填空格、預覽並確認 | 不寫入試算表；不管活動 | [spec](001-guided-notes-import/spec.md)、[plan](001-guided-notes-import/plan.md)、[tasks](001-guided-notes-import/tasks.md) | `diagrams/001-*` |
| 002 | 搶答活動 | 老師身分、建立活動（組數、每題秒數、公平模式）、依題號逐題開放、學生依組別送出、伺服器決定順序、結束前資訊隔離、高併發 | 不連線 Google；不保存紀錄 | [spec](002-buzzer-session/spec.md)、[plan](002-buzzer-session/plan.md)、[tasks](002-buzzer-session/tasks.md) | `diagrams/002-*` |
| 003 | 搶答結果與寫回 | 每題結束存到本機紀錄、重開後還原、結果畫面、寫回原 Google 試算表（先檢查版面、再備份）、匯出 CSV | 不決定誰搶到（由 002 判定） | [spec](003-results-export/spec.md)、[plan](003-results-export/plan.md)、[tasks](003-results-export/tasks.md) | `diagrams/003-*` |

## 怎麼串起來

```text
001 匯入 ──QuestionSet（題目、填空格位置、學習單來源）──▶ 002 搶答
002 搶答 ──onActivityCreated／onQuestionClosed／onActivityEnded（每題結果）──▶ 003 結果與寫回
001 匯入 ──GoogleAuthService（老師的 Google 授權）、SpreadsheetReader──▶ 003 寫回
002 搶答 ──老師身分（老師憑證）──▶ 001、003 的 API
```

| 交界 | 定義在哪裡 | 提供方 → 使用方 |
| --- | --- | --- |
| `QuestionSet` | [001 contracts/question-set.md](001-guided-notes-import/contracts/question-set.md) | 001 → 002、003 |
| Google 授權 | [001 contracts/google-auth-http.md](001-guided-notes-import/contracts/google-auth-http.md) | 001 → 003 |
| 老師身分、建立活動 | [002 contracts/session-http.md](002-buzzer-session/contracts/session-http.md) | 002 → 001、003 |
| 即時事件與畫面資料 | [002 contracts/socket-events.md](002-buzzer-session/contracts/socket-events.md) | 002 → 前端 |
| 三個通知方法 | [003 plan.md 藍圖對照](003-results-export/plan.md) | 002 呼叫 → 003 實作 |
| 結果、寫回、CSV API | [003 contracts/results-http.md](003-results-export/contracts/results-http.md) | 003 → 前端 |

**為什麼這樣拆**：沿著活動的時間順序切（活動前匯入 → 活動中搶答 → 活動後結果），每段都能獨立驗收；三段之間只透過上表的介面交換資料，介面在 contracts 中定好後，兩位成員可以平行開發（分工見 `docs/work-split.md`）。

## 需與 OpenSpec 組對齊的事項

作業規定兩組的系統功能要一致。下列項目會影響使用者看到的功能，需告知 OpenSpec 組並取得共識；確認後更新「狀態」欄。

| 項目 | 我們的做法 | 依據 | 類型 | 狀態 |
| --- | --- | --- | --- | --- |
| 學習單的讀寫方式 | 直接連線老師雲端的 Google Sheets；老師用 Google 帳號授權，用檔案選擇器挑選 | 助教 11/18 公告；001 Clarifications | 作業要求 | 待確認 |
| 寫回方式 | 直接寫回原試算表；寫回前檢查版面並複製備份工作表 | R5、R5.1；003 Clarifications | 作業要求＋自訂（備份） | 待確認 |
| 搶答形式 | 依題號逐題開放、可設每題秒數、每題結束立即公布 | 002 Clarifications | 作業未規定細節 | 待確認 |
| 時序與高併發 | 伺服器單一順序；200 連線、每秒 1,000 筆送出 | 002 REQ-BUZ-NFR | 組內要求 | 待確認 |
| 表頭同義詞 | 題號／編號／題次、作答／答案／回答、題目／問題／題幹 | 001 REQ-IMP-04 | 自訂功能 | 待確認 |
| 舊答案警告 | 匯入預覽時標出已有舊答案的填空格 | 001 REQ-IMP-09 | 自訂功能 | 待確認 |
| 題數上限 | 最多 200 題 | 001 REQ-IMP-06 | 自訂功能 | 待確認 |
| 找不到表頭 | 拒絕匯入並說明可用的表頭寫法（不提供手動指定欄位） | 001 REQ-IMP-05 | 作業未規定 | 待確認 |
| 額外功能 | 題組（E1）、CSV（E2）、公平模式（E3）、本機紀錄與重開還原（E4） | 作業 E1–E4 | 額外功能 | 待確認 |
