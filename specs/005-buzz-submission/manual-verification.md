# Manual Verification: 搶答與判定

**Feature**: `005-buzz-submission` | 情境編號對應 [quickstart.md](./quickstart.md)「手動驗證情境」（原則 VIII）。每個 User Story 的 Phase 完成後執行該 Story 的情境；T033 在 Polish 把全部情境再走一次。

## 結果

| # | 日期 | 驗證者 | 情境 | 耗時 | 結果 | 問題 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-27 | Ting10-01 | US1 #1 | – | 通過 | 只填第一格或只填第二格，「每一格都填才能送出」都顯示在空白的那一格旁，已填的內容不變；見「觀察到的問題」1 |
| 2 | 2026-11-27 | Ting10-01 | US1 #2 | – | 通過 | A 送出的當下，A、B 都馬上進入等待判定頁；老師列表只出現 A 的答案 |
| 3 | 2026-11-27 | Ting10-01 | US1 #3 | – | 通過 | C 送出後顯示待判定 |
| 4 | 2026-11-27 | Ting10-01 | US1 #4 | – | 通過 | 無 |

## 觀察到的問題

1. **驗證失敗訊息的位置與 quickstart 寫法不同**（2026-11-27，Ting10-01；情境 US1 #1）
   quickstart 預期訊息顯示在「第一個答案欄旁」，實際顯示在空白的那一格旁（伺服器回 `answers.<i>`，頁面依 `i` 顯示）。實際行為符合 data-model 的 `field`，是文件寫錯：2026-11-27 使用者決定依實際行為更正 spec、research、data-model、contracts、quickstart 與 tasks 的寫法，程式不變。

## 尚未驗證

- US2（Phase 4）：#5–#11
- US3（Phase 5）：#12–#13
- US4（Phase 6）：#14–#16
