# Quickstart: 搶答與判定

**Feature**: `005-buzz-submission` | 驗證 005 的送出、依序判定、自動結束、資訊隔離與高併發。介面與事件見 [contracts/submission-api.md](./contracts/submission-api.md)，型別見 [data-model.md](./data-model.md)。

## 前置條件

- Node.js 24 LTS；在 repo 根目錄 `npm install`。
- 001、002、003、004 已合併；001 已完成 spec「需請 001 修改」第 5 項（`Submission.rank` 可選），端對端測試另需第 1–4 項。
- 手動操作時需要 Google 登入的環境變數（`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_APP_ID`），由使用者自行設定；自動化測試以 002 的測試替身取代 Google，不需要這些變數。

## 自動化測試

| 指令 | 內容 | 預期 |
| --- | --- | --- |
| `npm test -w server -- submission` | 伺服器單元與整合測試 | 全部通過 |
| `npm test -w frontend -- ServerSubmissionService` | 前端服務單元測試 | 全部通過 |
| `npx playwright test submission -c frontend/playwright.config.ts` | 1 個老師分頁、3 個學生分頁的端對端測試 | 全部通過 |
| `npm run test:load -w server` | 壓力測試，20 輪（research RD-10） | 20 輪都通過；輸出每輪的 p95、最大延遲、被接受筆數（20） |

## 人工驗證情境

啟動系統（`npm run dev`），開 1 個老師分頁與 3 個學生分頁（第 1 組 2 人、第 2 組 1 人）。老師登入、匯入「題組＋單題範本」、建立 2 組的活動、開放第 1 題（題組）。結果記在 `specs/005-buzz-submission/manual-verification.md`。

| # | 操作 | 預期 | 對應 |
| --- | --- | --- | --- |
| 1 | 第 1 組學生 A 只填（1）| 「整組送出」不可用，送出提示區「每一格都填才能送出」 | AC-02 |
| 2 | 第 1 組 A、B 都填好，幾乎同時按「整組送出」 | 一人進入等待判定；另一人留在作答頁，看到「本組已送出此題」 | AC-04 |
| 3 | 第 2 組送出 | 老師列表依序 #1 第 1 組、#2 第 2 組，各有兩個小題的答案與經過時間 | AC-03、AC-09 |
| 4 | 檢查第 2 組分頁（含瀏覽器開發者工具的 WebSocket 訊息） | 看不到第 1 組的任何資料，自己的送出資料也沒有順位 | AC-17、AC-18 |
| 5 | 老師看 #2 的按鈕 | 不可用；只有 #1 可判定 | AC-10 |
| 6 | 老師按 #1「不接受」 | 第 1 組兩位學生都回到作答頁被拒絕狀態，看到上次的答案、不能再送出；#2 變成可判定 | AC-08、AC-11 |
| 7 | 老師按 #2「接受」 | 1 秒內老師到控制台・本題已結束，所有學生到本題結果；第 2 組為搶答成功 | AC-12、SC-005 |
| 8 | 開放第 2 題，只有第 1 組送出，老師按「結束這一題」 | 第 1 組的送出為「未判定」；結束後再送出被拒絕「這一題目前不能作答」 | AC-14、AC-06 |
| 9 | 查看伺服器 log | 有 `submission.accepted`（含 `seq`、`rank`）、`judgement.applied`；沒有答案內容與憑證 | AC-22 |
