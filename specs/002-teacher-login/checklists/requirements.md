# Specification Quality Checklist: 老師登入

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- spec 中出現的 `openid`、`email`、`drive.file`、`Authorization: Bearer`、四個環境變數名稱，是使用者在 2026-11-21 定案的決定（權限範圍、憑證的傳送方式、金鑰名稱），不是技術選型；框架、套件與 API 路徑只出現在 plan、contracts 與圖表。
- 失敗種類的代碼沿用 001 data-model：`CANCELLED`（001）、`SCOPE_DENIED`（002 新增，001 data-model 寫明其他失敗種類由 002 新增）。2026-11-22 起沒有 `NOT_TEACHER`。
- 「提供給其他子功能的能力」以業務用語描述；名稱（`requireTeacher`、`GoogleClientProvider.authorizedClient()`、`GET /api/auth/picker-token`）見 plan 與 contracts。
- clarify（2026-11-21）：沒有使用者可問；已定案的決定與 001 D1、D21、001 Assumptions 逐條寫入 Clarifications。自行決定的三項（`SCOPE_DENIED`、帳號名稱取電子郵件 `@` 前面、每次登入都顯示同意畫面）標示「待使用者確認」。
- 圖表：`diagrams/002-component`、`002-class`、`002-sequence`，`.puml` 與 PNG 皆已產生。
- 2026-11-22（配合 001 最終版與 feature-split 最新版）：以 Google 登入的人即為老師、任何登入取代前一個老師；刪除 AC-02、AC-05、AC-06，新增 AC-26、AC-27；`SCOPE_DENIED` 由使用者確認保留（由 002 新增）；D21 改為暫時限制；「需請 001 修改」只剩 D21 的頁面切換。Clarifications 新增 Session 2026-11-22。仍待使用者確認：帳號名稱取電子郵件 `@` 前面、每次登入都顯示同意畫面。
