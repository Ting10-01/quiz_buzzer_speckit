# Contract: 提供給 006 的 SubmissionStore

**Owner**: `005-buzz-submission` | **Consumer**: `006-results-export`（伺服器端 `ResultService`） | **Location**: `server/src/submission/SubmissionStore.ts`

`SubmissionStore` 是送出、順位、判定與搶答成功組別的唯一權威來源（原則 V），只存在伺服器記憶體。006 只讀，不寫。

## 取得方式

005 的 `submissionRoutes`（`server/src/submission/index.ts`）建立唯一的 `SubmissionStore` 後，以 `app.decorate('submissions', store)` 掛在根 Fastify instance 上，比照 004 的 `app.activity`（004 contracts/server-modules.md）。006 在 002 的 `buildApp` 中於 `submissionRoutes` 之後註冊，經 `app.submissions` 取得，不必修改 005 的檔案（2026-11-28 使用者決定，diagram-verification D8）。

| 名稱 | 型別 | 說明 |
| --- | --- | --- |
| `app.submissions` | `SubmissionStore` | 只放 `SubmissionStore`；006 只呼叫下方的 `list`、`winner`。005 的 Engine、Notifier 等其他物件不公開 |

## 方法（006 使用）

| 方法 | 回傳 | 說明 |
| --- | --- | --- |
| `list(questionNumber)` | `Submission[]` | 第 n 題所有送出，依 `rank` 排序，老師視角（真正的 `rank`、`elapsedMs`、`judgement`）。006 要給學生看時，依 006 的公布範圍自行決定是否保留 `rank`。沒有送出或還沒開放時為 `[]` |
| `winner(questionNumber)` | `Submission \| null` | 第 n 題 `judgement = ACCEPTED` 的那一筆；沒有時為 `null` |

## 保證

| 保證 | 依據 |
| --- | --- |
| 每題的 `rank` 從 1 開始，連續、不重複 | REQ-SUB-08 |
| 每組每題最多一筆；每題最多一筆 `ACCEPTED` | REQ-SUB-03、REQ-SUB-12 |
| 一題結束後（006 取得結果的時間點），列表中沒有 `PENDING`：只有 `ACCEPTED`、`REJECTED`、`UNJUDGED` | REQ-SUB-14 |
| `elapsedMs` 隨 `rank` 單調不減，006 由它計算 `QuestionResult.behindFirstMs`（「第一名」的定義屬於 006，001 D23） | REQ-SUB-09；001 data-model |
| 內容與老師畫面顯示的列表完全相同（`GET /api/questions/:n/submissions` 直接回傳 `list(n)`） | REQ-SUB-19、AC-22 |

## 結果的判讀（006 的呈現依此判斷）

| 情況 | `list(n)` | `winner(n)` | 006 的呈現（001 FR-034） |
| --- | --- | --- | --- |
| 有組別被接受 | 至少 1 筆 | 有 | 搶答成功的組別與答案 |
| 有送出但都沒被接受 | 至少 1 筆 | `null` | 「沒有組別搶答成功」 |
| 沒有送出 | `[]` | `null` | 「沒有組別送出」 |

## 公布時機

`SubmissionStore` 本身不限制誰能讀；作答期間不讓學生看到他組資料（R9）由 005 的 API 與 006 的公布時機共同保證：006 只在一題結束後把該題結果給學生（feature-split R9 由 005、006 分工）。
