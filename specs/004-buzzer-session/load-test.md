# Load Test: 活動與階段同步

**Feature**: `004-buzzer-session` | **Task**: T047 | 測試設計見 [research.md](./research.md) RA-15，通過條件見 spec SC-002、AC-28、AC-29、REQ-ACT-NFR-01、REQ-ACT-NFR-02。

這是自動量測的紀錄，不是人工驗證；人工驗證記在 [manual-verification.md](./manual-verification.md)。

## 執行方式

```bash
npm run test:load:activity -w server
```

`server/tests/load/phaseSync.load.ts` 重複執行 20 次。每次在隨機埠啟動伺服器（Google 與匯入以替身取代），建立 1 個老師與 200 個學生連線（20 組 × 10，只用 WebSocket），200 個學生同時 `group:join`，再由老師依序開放並結束 4 題（8 次階段改變）。

學生連線分批建立（每批 50 個），因為 200 個同時握手會超過 macOS 的連線佇列上限（`somaxconn` 128）而被重設。驗收準則量測的是 201 個連線同時存在時的同步與 200 個同時加入，不受影響。

## 環境

| 項目 | 值 |
| --- | --- |
| 日期 | 2026-11-27 |
| 機器 | Apple M3，8 核心，macOS（Darwin 27.2.0） |
| Node.js | v26.5.0 |
| commit | `40570783` 之後（T046 的 script，產品程式未修改） |

## 結果

| 通過條件 | 來源 | 20 次結果 |
| --- | --- | --- |
| 每次階段改變 1 秒內送達全部 201 個連線 | AC-28、NFR-01、SC-002 | 遲到或沒收到 0 次（共 20 × 8 × 201 = 32,160 次送達）；最慢 8 ms |
| 每個連線的版本號嚴格遞增 | AC-28、NFR-01、SC-002 | 倒退或重複 0 次 |
| 結束時所有連線的狀態與伺服器相同 | AC-28、SC-002 | 不同的連線 0 個 |
| 每個加入恰好得到一次回覆、沒有錯誤 | AC-29、NFR-02 | 問題 0 個 |
| 各組人數總和 200（每組 10） | AC-29、NFR-02 | 20 次都正確 |
| 最後一筆加入後 1 秒內，老師連線收到與伺服器相同的人數 | AC-29 | 最慢 +3 ms |

**結論**：20/20 通過，`ActivityBroadcaster` 不需要調整（T047）。

## 每次的輸出

```text
run 1/20: PASS | slowest phase change 8 ms | teacher counts +0 ms
run 2/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 3/20: PASS | slowest phase change 8 ms | teacher counts +0 ms
run 4/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 5/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 6/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 7/20: PASS | slowest phase change 7 ms | teacher counts +0 ms
run 8/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 9/20: PASS | slowest phase change 7 ms | teacher counts +0 ms
run 10/20: PASS | slowest phase change 4 ms | teacher counts +0 ms
run 11/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 12/20: PASS | slowest phase change 6 ms | teacher counts +0 ms
run 13/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 14/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 15/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 16/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 17/20: PASS | slowest phase change 7 ms | teacher counts +3 ms
run 18/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 19/20: PASS | slowest phase change 5 ms | teacher counts +0 ms
run 20/20: PASS | slowest phase change 5 ms | teacher counts +0 ms

summary: 20/20 runs passed | slowest phase change 8 ms | late or missing deliveries 0 | version problems 0 | final mismatches 0
```

## 限制

- 伺服器與 201 個連線在同一台機器上，沒有真實網路延遲；量測的是伺服器處理與廣播的時間。
- 連線用 `socket.io-client`，不是瀏覽器分頁；頁面收到快照後的繪製時間不在範圍內（由 e2e 涵蓋）。
