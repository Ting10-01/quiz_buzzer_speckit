# 協作規範（Git）

本專案由兩位成員與 AI 代理（Claude Code）共同開發。以下規則適用於所有人，**也適用於 AI 產生的 commit**。

目的只有兩個：
1. 任何一個變更都能看懂它**做了什麼、為什麼**。
2. 任何一個變更都能**追溯回 spec 的需求**，必要時可以單獨回退。

---

## 0. 語言

| 項目 | 語言 |
| --- | --- |
| commit 訊息（標題、內文） | 中文或英文皆可；類型、範圍與 Refs 照 2.2 節的格式 |
| 程式碼註解、JSDoc、變數與函式命名 | **英文** |
| 分支名稱 | **英文** |
| PR 標題 | 與 commit 標題相同，中文或英文皆可 |
| 文件（spec、plan、tasks、README、docs/、本文件） | 中文 |
| PR 描述與 review 留言 | 中文或英文皆可 |

---

## 1. 分支

| 用途 | 命名 | 例子 |
| --- | --- | --- |
| 子功能 | `NNN-功能名稱`，與 `specs/` 下的資料夾同名；在 `/speckit-specify` 之前從 `main` 建立（SpecKit 不會自動建立分支） | `001-guided-notes-import` |
| 不屬於單一功能的 SpecKit 產物 | `spec/簡短描述` | `spec/constitution` |
| 修 bug | `fix/簡短描述` | `fix/export-group-marker` |
| 文件、設定 | `docs/簡短描述`、`chore/簡短描述` | `docs/readme-setup` |

- 不在 `main` 上直接開發或 commit。
- 一個分支只做一件事；和目前分支無關的修改，另開分支。

---

## 2. Commit

### 2.1 一個 commit 只做一件事

- 一個 commit 只包含一個邏輯上的變更。功能、修 bug、重構、改格式要分開 commit。
- **判斷方法**：如果訊息需要用「並且」「順便」，就代表該拆開。
- 「很小所以順便改」也不行。再小的無關修改都要獨立 commit，否則 review 時看不出來，出問題時也無法單獨回退。

### 2.2 訊息格式

```text
<類型>(<範圍>): <做了什麼，一句話>

<為什麼：遇到什麼問題、為什麼選這個做法、考慮過但沒採用的做法>

Refs: <任務編號>, <需求或驗收準則編號>
```

- **類型**：只能使用 2.3 節列出的類型。
- **範圍**：屬於某個子功能時，**一定要寫**子功能編號，例如 `feat(001): ...`。跨功能或專案層級的變更**省略範圍**，例如 `chore: ...`。不可使用編號以外的範圍名稱。
- **標題**：中文或英文，寫「做了什麼」，不加句號。中文以動詞開頭（「新增」「修正」），30 字以內；英文用祈使句（`add`，不是 `added` 或 `adds`），50 個字元以內，開頭小寫。
- **內文**：寫「為什麼」。**不寫怎麼做**，怎麼做看 diff 就知道。
- **Refs**：對應 spec 的編號，見下表。

### 2.3 類型（封閉清單）

**只能使用下表的 12 種類型，不可自創。** 找不到合適的類型，通常代表這個 commit 混了好幾件事，應該拆開。真的無法歸類時，先在 PR 或組內討論，同意後更新本表再使用。

| 類型 | 定義 | 判斷方式 | Refs |
| --- | --- | --- | --- |
| `feat` | 新增使用者看得到的功能或行為 | 對應 spec 裡的一條需求 | 必填：任務與需求，例 `T012, REQ-IMP-02` |
| `fix` | 修正不符合 spec 的行為 | 有一條驗收準則沒有通過 | 必填：驗收準則與 Issue，例 `AC-02, #15` |
| `perf` | 提升效能，行為不變 | 對應非功能需求 | 必填：例 `REQ-IMP-NFR-01` |
| `refactor` | 改善程式結構，行為與效能都不變 | 測試不需要修改就能通過 | 建議：依據的原則或 plan，例 `原則 IV` |
| `style` | 只改格式：縮排、空白、分號、排序 | 不改任何邏輯 | 不需要 |
| `test` | 新增或修改測試，不改產品程式 | 只動測試檔 | 建議：例 `AC-02` |
| `spec` | 修改 SpecKit 產物：constitution、spec、plan、tasks、data-model、contracts、diagrams | 只動 `.specify/`、`specs/`、`diagrams/` | 必填：受影響的需求或驗收準則；spec 首次建立時尚無 REQ 編號，改填 `docs/assignment.md` 的編號，例 `R2, R2.1` |
| `docs` | 修改其他文件：README、CONTRIBUTING、docs/ 下的紀錄 | 不影響系統行為與規格 | 不需要 |
| `build` | 相依套件、建置與打包設定 | 例：`package.json`、`vite.config.ts` | 不需要 |
| `ci` | 自動化流程設定 | 只動 `.github/workflows/` | 不需要 |
| `chore` | 以上都不屬於的維護工作 | 例：`.gitignore`、編輯器設定。**不可當成雜物箱** | 不需要 |
| `revert` | 還原先前的 commit | 用 `git revert` 產生 | 必填：被還原的 commit hash |

容易混淆的情況：

| 情況 | 用哪個 |
| --- | --- |
| 修改 spec 裡的需求或驗收準則 | `spec`（不是 `docs`） |
| 修 bug 時順便重構 | 拆成 `refactor` 和 `fix` 兩個 commit |
| 新功能和它的測試 | 照 tasks.md 的任務拆：測試任務用 `test`，實作任務用 `feat`，各自一個 commit（見 2.4） |
| 升級套件版本 | `build` |
| 更新測試紀錄等專案紀錄 | `docs` |

追溯鏈：commit → 任務（T）→ User Story（US）→ 需求（REQ）→ 驗收準則（AC）→ 測試。

### 2.4 commit 與 SpecKit 流程的對應

SpecKit 每個階段都會一次產生好幾個檔案，以下規定 commit 的切法：

| 階段 | 一個 commit 包含 | 訊息範例 |
| --- | --- | --- |
| `/speckit-constitution` | constitution 的建立或修改 | `spec: establish project constitution` |
| `/speckit-specify` | spec.md、圖表（.puml 與 .png）、品質檢查表 | `spec(001): add guided notes import spec and diagrams`，`Refs: R2, R2.1, R2.2` |
| `/speckit-clarify` | 回寫到 spec.md 的問答 | `spec(001): clarify handling when no blank cells are found`，`Refs: REQ-IMP-02` |
| `/speckit-plan` | plan.md、research.md、data-model.md、contracts/、quickstart.md | `spec(001): add implementation plan` |
| `/speckit-tasks` | tasks.md | `spec(001): break plan into tasks` |
| `/speckit-analyze` 後的修正 | 依報告修改的 spec、plan 或 tasks | `spec(001): add acceptance criteria for import failures` |
| `/speckit-implement` | **每完成一個任務（T 編號）一個 commit** | `test(001): ... Refs: T010, AC-01`、`feat(001): ... Refs: T011, REQ-IMP-01` |

- implement 階段以任務為單位，是因為任務是 tasks.md 裡最小的工作單位，每個任務都已標明屬於哪個 User Story，追溯最直接。
- 測試任務與實作任務分開 commit，類型依任務內容使用 `test` 或 `feat`。
- 圖表一致性驗證的結果也獨立一個 `spec` commit。

### 2.5 spec 沒寫到的 bug：先改 spec，再修程式

修 bug 時如果發現 **spec 根本沒涵蓋這個情況**，這是需求漏洞，不是單純的程式錯誤：

1. 先修改 spec，補上新的驗收準則（例如 AC-07），獨立 commit：`spec(003): add criteria for simultaneous submissions`
2. 再修程式：`fix(003): ... Refs: AC-07`

不可以只改程式，否則程式會出現 spec 沒有的行為。

### 2.6 範例

好的例子：

```text
feat(001): detect question groups by merged cells

The TA tests with Guided Notes of different layouts, and the number
of sub-questions in a group is not fixed, so a fixed row count cannot
be used. Read the vertical merge range of the question-number column
instead. Relying only on the (n) markers was rejected because a single
question may also carry a manually added marker.

Refs: T012, REQ-IMP-02, AC-02
```

不好的例子：

```text
update parser and fix some bugs        ← 混了兩件事，也沒有原因
loop over merge ranges with for        ← 只寫怎麼做
修正匯入問題                            ← 沒有類型與範圍，也沒說修了什麼
```

---

## 3. AI 產生的 commit

- 統一在 **Claude Code** 中 commit，不使用 VS Code 的 Copilot 自動產生訊息功能，因為它不會遵守本規範，也不會留在 Claude Code 的 session log 中。
- 流程：**AI 提案 → 人確認 → 才 commit**。在 Claude Code 中這樣下指令：

```text
依照 CONTRIBUTING.md 的規則，把目前的變更拆成適當的 commit。
先列出拆分方式和每個 commit 的訊息給我確認，不要直接 commit。
```

- 確認時檢查三件事：
  1. **拆分**：有沒有把不相關的修改混在一起？
  2. **為什麼**：是真正的原因，還是 AI 猜的？不對就告訴它真正的原因。
  3. **Refs**：編號是否正確。
- Claude Code 自動加上的 `Co-Authored-By` 行請保留，標示這是 AI 協作產生的變更。

---

## 4. Pull Request

- 一個子功能一個 PR；修 bug 一個 PR。
- **必須由另一位成員 review 並 approve 後才能合併。** 自己不能合併自己的 PR。
- 使用 **rebase and merge**，保留每一個 commit 與它的「為什麼」和 Refs。不使用 squash merge，因為它會把整個 PR 壓成一個 commit，失去逐一追溯與單獨回退的能力。
- PR 標題遵守 commit 訊息的標題格式。
- review 時發現下列情況，要求修改後再合併：
  - 使用了清單以外的類型
  - commit 混了不相關的變更
  - 訊息只寫怎麼做、沒寫為什麼
  - `feat`、`fix` 沒有 Refs

### 合併前檢查清單

- [ ] spec、plan、tasks 與程式碼一致（行為改變時 spec 已先更新）
- [ ] 圖表已更新，PNG 已重新產生
- [ ] 自動化測試通過
- [ ] 人工驗證已完成並留下紀錄
- [ ] 沒有任何金鑰、密碼、`.env` 或 `credentials/` 內容
- [ ] 若影響兩組的範圍或共同決定，已與 OpenSpec 組取得同意

---

## 5. 禁止事項

- 直接 push 到 `main`
- force push 到 `main` 或他人正在使用的分支
- commit `.env`、`credentials/`、任何金鑰或密碼
- 用 `--no-verify` 跳過檢查
