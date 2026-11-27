# Load Test: 搶答與判定

**Feature**: `005-buzz-submission` | **Task**: T030 | 測試設計見 [research.md](./research.md) RD-10，通過條件見 spec AC-20～AC-22、AC-24、SC-002、SC-003、REQ-SUB-NFR-01、NFR-02、NFR-04。

這是自動量測的紀錄，不是人工驗證；人工驗證記在 [manual-verification.md](./manual-verification.md)。

## 執行方式

```bash
npm run test:load:submission -w server
```

`server/tests/load/submission.load.ts` 重複執行 20 次。每次以子程序在隨機埠啟動伺服器（Google 以替身取代，匯入 4 題單題），pino log 寫到暫存檔；建立 1 個老師與 200 個學生連線（20 組 × 10，只用 WebSocket），老師建立活動並開放第 1 題後，在 1 秒內平均送出 1,000 筆（每個學生 5 筆，其中一個 `requestId` 送兩次；順序打亂，同組多條連線互搶）。另有第 201 個學生加入第 1 組後暫停讀取 TCP，當作停止回應的慢連線。伺服器結束、log 寫完後才比對 log。

學生連線分批建立（每批 50 個），原因同 004（macOS `somaxconn` 128）。

## 環境

| 項目 | 值 |
| --- | --- |
| 日期 | 2026-11-28 |
| 機器 | Apple M3，8 核心，macOS（Darwin 27.2.0） |
| Node.js | v26.5.0 |
| commit | `405dd49f` 之後（T028 的 log，`SubmissionNotifier` 未修改） |

## 結果

| 通過條件 | 來源 | 20 次結果 |
| --- | --- | --- |
| 每筆送出恰好一個回覆 | AC-20、NFR-01、SC-002 | 遺失或重複 0 筆（共 20,000 筆） |
| log 的 `seq` 為 1..1000，不缺不重複 | AC-20、SC-002 | 20 次都正確 |
| 每組恰好一筆被接受，且是 log 中該組 `seq` 最小者 | AC-20、SC-002 | 問題 0 次 |
| 老師端順位 1..20 連續、各組一筆；學生收到的 `rank` 全為 0 | AC-20、REQ-SUB-16 | 20 次都正確 |
| 每條學生連線恰好收到一次自己組的 `submission:groupSubmitted` | AC-20、REQ-SUB-20 | 問題 0 個 |
| 老師最後一份列表、`GET /api/questions/1/submissions`、log 的順位一致 | AC-22、SC-002 | 不一致 0 次 |
| 回覆延遲 p95 ≤ 1 秒、最大 ≤ 2 秒 | AC-21、NFR-02、SC-003 | p95 最慢 3 ms；最大 11 ms |
| 老師列表落後 ≤ 1 秒 | AC-21、NFR-02、SC-003 | 最慢 162 ms（200 ms 合併視窗內） |
| 慢連線存在時其他連線仍在範圍內 | AC-24、NFR-04 | 上述數字皆在慢連線暫停讀取時量得 |

**結論**：20/20 通過，`SubmissionNotifier` 不需要調整（T030）。

## 每次的輸出

```text
run 1/20: PASS | ack p95 2 ms | max 6 ms | accepted 20 | teacher lag 151 ms
run 2/20: PASS | ack p95 2 ms | max 5 ms | accepted 20 | teacher lag 152 ms
run 3/20: PASS | ack p95 2 ms | max 7 ms | accepted 20 | teacher lag 141 ms
run 4/20: PASS | ack p95 2 ms | max 8 ms | accepted 20 | teacher lag 161 ms
run 5/20: PASS | ack p95 3 ms | max 5 ms | accepted 20 | teacher lag 141 ms
run 6/20: PASS | ack p95 2 ms | max 9 ms | accepted 20 | teacher lag 152 ms
run 7/20: PASS | ack p95 2 ms | max 7 ms | accepted 20 | teacher lag 160 ms
run 8/20: PASS | ack p95 2 ms | max 4 ms | accepted 20 | teacher lag 111 ms
run 9/20: PASS | ack p95 2 ms | max 8 ms | accepted 20 | teacher lag 132 ms
run 10/20: PASS | ack p95 2 ms | max 7 ms | accepted 20 | teacher lag 150 ms
run 11/20: PASS | ack p95 2 ms | max 4 ms | accepted 20 | teacher lag 121 ms
run 12/20: PASS | ack p95 2 ms | max 5 ms | accepted 20 | teacher lag 161 ms
run 13/20: PASS | ack p95 2 ms | max 5 ms | accepted 20 | teacher lag 100 ms
run 14/20: PASS | ack p95 2 ms | max 6 ms | accepted 20 | teacher lag 162 ms
run 15/20: PASS | ack p95 2 ms | max 4 ms | accepted 20 | teacher lag 113 ms
run 16/20: PASS | ack p95 2 ms | max 5 ms | accepted 20 | teacher lag 61 ms
run 17/20: PASS | ack p95 3 ms | max 6 ms | accepted 20 | teacher lag 152 ms
run 18/20: PASS | ack p95 3 ms | max 9 ms | accepted 20 | teacher lag 142 ms
run 19/20: PASS | ack p95 2 ms | max 11 ms | accepted 20 | teacher lag 161 ms
run 20/20: PASS | ack p95 2 ms | max 7 ms | accepted 20 | teacher lag 121 ms

summary: 20/20 runs passed | worst ack p95 3 ms | worst max 11 ms
```

## 限制

- 伺服器與 201 個連線在同一台機器上，沒有真實網路延遲；量測的是伺服器處理與推送的時間。
- 連線用 `socket.io-client`，不是瀏覽器分頁；頁面繪製時間不在範圍內（由 e2e 與人工驗證情境 14–16 涵蓋）。
- 慢連線是暫停讀取 TCP，不是限制頻寬；網路變慢的情況由人工驗證情境 15（Slow 3G）涵蓋。
