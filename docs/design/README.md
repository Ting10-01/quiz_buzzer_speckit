# UI 設計稿

每個畫面都是單獨的 HTML 檔，用瀏覽器直接打開就能看，不用安裝任何東西。開發時可以用瀏覽器的開發者工具查看實際的 CSS（顏色、字級、間距）。

- 全部畫面一次看：[`overview-dark.html`](overview-dark.html)、[`overview-light.html`](overview-light.html)
- 單一畫面：`dark/<畫面>.html`（全黑主題）、`light/<畫面>.html`（淺色主題）
- README 用的總覽圖：`docs/images/ui-overview-dark.png`、`ui-overview-light.png`

每個檔案只呈現畫面的預設狀態（例如倒數停在某一秒），互動與動畫以 spec 為準。


## 畫面清單

| 編號 | 檔案 | 畫面 | 尺寸 | 程式位置 | 負責人 |
| --- | --- | --- | --- | --- | --- |
| 00 | `Main` | 首頁：選擇身分 | 1440 × 900 | `web/src/pages/HomePage.tsx` | 骨架 |
| T0 | `T-Connect` | 老師：連結 Google 並挑選學習單 | 1440 × 960 | `pages/teacher/ImportPage.tsx`（未連結狀態）；連結與選擇器由 `lib/googlePicker.ts` 與 Google 授權 API 提供 | A（頁面）、B（Google 授權） |
| T1 | `T-Import` | 老師：確認辨識結果 | 1440 × 960 | `pages/teacher/ImportPage.tsx` | A |
| T1-手動 | `T-ImportError` | 老師：找不到表頭時指定欄位 | 1440 × 1000 | `pages/teacher/ImportPage.tsx` | A |
| T2 | `T-Setup` | 老師：活動設定 | 1440 × 1040 | `pages/teacher/SetupPage.tsx` | B |
| T3 | `T-Lobby` | 老師：控制台・準備中 | 1440 × 960 | `pages/teacher/LobbyPage.tsx` | B |
| T4 | `T-Live` | 老師：控制台・搶答中 | 1440 × 1040 | `pages/teacher/ConsolePage.tsx` | B |
| T5 | `T-EndConfirm` | 老師：提前結束這一題 | 1440 × 1040 | `pages/teacher/ConsolePage.tsx` | B |
| T6 | `T-Results` | 老師：結果與寫回 | 1440 × 1040 | `pages/teacher/ResultsPage.tsx` | A |
| T7 | `T-WriteBack` | 老師：確認寫回 Google Sheets | 1440 × 1040 | `pages/teacher/ResultsPage.tsx`（確認視窗） | A |
| S1 | `S-Join` | 學生：選擇組別 | 390 × 844 | `pages/student/JoinPage.tsx` | B |
| S2 | `S-Wait` | 學生：等待開放 | 390 × 844 | `pages/student/AnswerPage.tsx` | B |
| S3 | `S-Answer` | 學生：作答 | 390 × 844 | `pages/student/AnswerPage.tsx` | B |
| S3b | `S-QuestionDone` | 學生：本題結果 | 390 × 844 | `pages/student/AnswerPage.tsx` | B |
| S4 | `S-Results` | 學生：全部結果 | 390 × 844 | `pages/student/ResultsPage.tsx` | A |

## 設計規則

- 顏色一律用 CSS 變數（`--ground`、`--surface`、`--text`、`--accent`…），定義在每個檔案開頭的 `:root`；淺色主題改用同名變數的另一組值。骨架會把這組變數搬到 `web/src/styles/tokens.css`。
- 強調色（粉筆黃 `--accent`）只用在「第 1 名」與主要按鈕，不拿來裝飾。
- 字體：Inter（數字、英文）＋ Noto Sans TC（中文）。
- 學生端以手機寬度（390 px）設計，老師端以 1440 px 設計。
