# Specification Analysis Report: 002 搶答活動

**Date**: 2026-11-18 | **Command**: `/speckit-analyze` | **Artifacts**: spec.md、plan.md、tasks.md、constitution.md

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | Inconsistency | ~~MEDIUM~~ 已修正 | diagrams/002-class.puml；002-component.puml:61、002-sequence.puml:72、92；plan.md 藍圖對照 | 組件圖與時序圖都有 `ActivityService` 呼叫 003 `ResultsService` 的三個方法，類別圖沒有這個依賴；實作後的圖表一致性驗證（T059）會對不上 | 在 002-class.puml 的「其他子功能」加入 `ResultsService`（`onActivityCreated`、`onQuestionClosed`、`onActivityEnded`）與 `ActivityService --> ResultsService` 關係，重新產生 PNG |
| F2 | Inconsistency | ~~MEDIUM~~ 已修正 | spec.md REQ-BUZ-20、Edge Cases；contracts/session-http.md `UNEXPORTED_RESULTS` | 002 寫「舊活動的結果尚未匯出時提醒」，003 改為「寫回 Google Sheets」與「匯出 CSV」兩個動作，任一個完成就不再提醒（003 data-model）；用語不一致 | 改成「尚未寫回 Google Sheets 也尚未匯出 CSV 時提醒」 |
| E1 | Coverage | ~~MEDIUM~~ 已修正 | spec.md SC-002；tasks.md T031 | SC-002 要求「100 次多組同時送出」的自動化測試，T031 只跑一次 | T031 改為重複 100 次，每次檢查恰好一個成功組別且老師畫面與結果一致 |
| E2 | Coverage | LOW | spec.md SC-001、SC-008、AC-04 | SC-001（12 個分頁 1 秒內同步）、SC-008（倒數相差 ≤ 1 秒）、AC-04（結束後 1 秒內同步並拒絕送出）由 T014、T016、T031 涵蓋，但沒有明確引用 | 在 T016 加上 SC-001、AC-04 並以 12 個連線驗證；在 T014 加上 SC-008 |
| F3 | Underspecification | LOW | contracts/session-http.md `GET /api/activity/public` | `activityName` 的來源沒有寫明 | 註明取自 `QuestionSet.source.spreadsheetTitle` |
| U1 | Traceability | LOW | tasks.md 需求追溯表 | T032（REQ-BUZ-09）、T036（REQ-BUZ-11）、T037（REQ-BUZ-08）沒有出現在追溯表 | 補進追溯表 |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| REQ-BUZ-01～22 | ✅ | 見 tasks.md 追溯表 | 22 條全部有任務 |
| REQ-BUZ-NFR-01 | ✅ | T007、T008、T044、T047 | |
| REQ-BUZ-NFR-02 | ✅ | T005、T006、T047 | |
| REQ-BUZ-NFR-03 | ✅ | T030、T044、T053 | |
| REQ-BUZ-NFR-04 | ✅ | T044、T045、T048 | 壓力測試 |
| REQ-BUZ-NFR-05 | ✅ | T043、T046 | |
| SC-002 | ✅ | T031 | 重複 100 次（E1 已修正） |
| SC-003 | ✅ | T040 | |
| SC-006、SC-007 | ✅ | T044、T045、T048 | |

**Constitution Alignment Issues**: 無。原則 V（單一權威：CommandQueue、伺服器倒數）、VI（T039–T042 伺服器端隔離）、VIII（每個 Story 都有測試，T058 人工驗證）、I（T059）都有對應任務。

**Unmapped Tasks**: T001–T004、T011（基礎設施）、T057–T059（Polish），不需對應單一需求。

## Metrics

- Total Requirements: 27（22 條功能需求、5 條非功能需求）
- Total Tasks: 59
- Coverage: 100%
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0（HIGH 0、MEDIUM 0、LOW 3）

## 跨子功能交界

| 交界 | 結果 |
| --- | --- |
| 呼叫 003 `ResultsService` 的三個方法 | ✅ plan、tasks（T016、T018）與三張圖一致（F1 已修正） |
| 老師憑證發給 001、003 使用 | ✅ T010 對應 001 T014 |
| 新活動前的提醒 | ✅ 與 003 一致：尚未寫回也尚未匯出 CSV 時提醒（F2 已修正） |


## 重跑結果（2026-11-18，修正後）

- F1：002-class.puml 新增「003（共用）」的 `ResultsService` 與 `ActivityService ..> ResultsService`，PNG 已重新產生；plan 藍圖對照的來源圖補上 class、sequence。
- F2：spec.md（REQ-BUZ-20、Edge Cases、Assumptions）與 contracts/session-http.md 改為「尚未寫回 Google Sheets 也尚未匯出 CSV」，獨立一個 `spec` commit。
- E1：T031 改為重複 100 次（SC-002）。
- 重跑檢查：需求涵蓋 100%；剩下 LOW 3 項（E2、F3、U1），不影響進入實作。

## Next Actions

- 沒有 CRITICAL 或 HIGH，依 CLAUDE.md 第 2 節可以進入 `/speckit-implement`。
- MEDIUM 已修正並重跑；LOW 項目可在實作對應任務時順手補上。
