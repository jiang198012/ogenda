# Fix All Demo Vault Test Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `demo-vault` 全量验收中整理出的四项工程问题：让事件日期可稳定键盘输入，提供可重复的 Obsidian 手工验收入口，建立隔离的日历 provider fixture，并把窄屏周视图的 1/3/7 泳道与触控验收固化为可执行检查。

**Architecture:** 事件表单保留原生日期选择器作为日历入口，同时增加单值文本日期入口并由纯函数统一解析、校验和同步；手工验收通过仓库脚本和 runbook 固化启动、CDP、窗口尺寸、备份恢复步骤；同步测试使用本地 HTTP fixture，不触碰真实云端；周视图继续由现有 CSS container-query 和 pointer 逻辑负责运行时表现，新增边界矩阵与回归断言验证既有实现。

**Tech Stack:** TypeScript, Obsidian API, Vitest, jsdom, Node `http`/`child_process`, CSS container queries.

**Spec:** `docs/demo-vault-gui-issue-list-2026-09-24.md`

## Global Constraints

- 直接修改当前 `main`，不创建或切换工作树。
- 保留现有 `docs/demo-vault-gui-test-report-2026-09-24.md` 和 issue 清单，不覆盖其中证据。
- 不提交或打印任何 iCloud/CalDAV 凭据；fixture 只能使用本地内存数据。
- 不改变生产同步默认行为，不向真实日历发送请求，不执行破坏性 vault 操作。
- 不升版本、不发布、不推送；本轮只完成实现、测试和文档，待用户另行授权发布。
- 所有实现通过 `apply_patch` 修改；每个任务先补失败测试或可验证的验收断言，再实现并运行针对性测试。

## Review Focus

- 日期文本入口与原生日历入口必须保持同一字段状态，非法日期不能保存，全天/定时、结束日期校验和编辑回写不能回归。
- 手工启动脚本必须检查 vault 路径、明确 CDP 端口和窗口参数，并给出失败时的真实退出信息。
- provider fixture 必须覆盖关闭、iCloud、CalDAV、ICS、VEVENT 过滤、CRUD、冲突和网络失败，且测试后可重置。
- 周视图断点必须是 `<=360px`、`361–720px`、`>720px` 对应 1/3/7 泳道；高度继续复用日视图小时高度，触控与两行卡片验收要有证据入口。

---

## Task 1: Add a stable, accessible date input to the event form

**Files:** `src/agenda-panel/event-form-fields.ts`, `src/agenda-panel/event-form-modal.ts`, `styles.css`, `tests/agenda-panel/event-form-fields.test.ts`, `tests/agenda-panel/event-form-modal.test.ts`.

- [x] Write failing pure-function tests for strict `YYYY-MM-DD` normalization, invalid dates, and round-tripping date text to ISO.
- [x] Write DOM-level tests that assert the start/end date text controls have stable labels, test ids, keyboard input metadata, and a calendar trigger that synchronizes the native date input.
- [x] Implement the shared parser and wire text controls, native picker controls, labels, synchronization, validity, all-day state, and edit/save paths.
- [x] Add focused styling so the stable text control is primary while the native picker remains available without exposing split date segments to assistive tooling.
- [x] Run the focused event-form tests and build; inspect the rendered control attributes in jsdom output.

## Task 2: Add a repeatable demo-vault manual acceptance entry point

**Files:** `scripts/manual-test/launch-demo-vault.mjs`, `scripts/manual-test/viewport-matrix.mjs`, `docs/manual-test-runbook.md`, `tests/manual/manual-test-config.test.ts`.

- [x] Write tests for default launch arguments, explicit vault/port/viewport overrides, and the 360/361/720/721 viewport matrix.
- [x] Implement a safe launcher that validates the vault directory, starts Obsidian with a fixed CDP port and viewport arguments, and reports process failures instead of hiding them.
- [x] Implement a dry-run viewport matrix command that prints expected lane counts and required touch/card checks.
- [x] Document backup, launch, CDP/console capture, screenshots, cleanup, and restore steps with no production credentials.
- [x] Run the manual-config tests and both scripts in dry-run/help mode.

## Task 3: Add isolated CalDAV/ICS provider fixtures and synchronization matrix tests

**Files:** `tests/fixtures/caldav-fixture.ts`, `tests/connectors/caldav/caldav-fixture.test.ts`, `tests/sync/provider-fixture.test.ts` (plus only the smallest production seam needed for testability).

- [x] Write failing fixture tests for provider modes, VEVENT-only discovery, VTODO/subscribed/inbox/outbox filtering, local event CRUD, conflict responses, and network failures.
- [x] Implement an in-memory HTTP fixture with deterministic PROPFIND/REPORT/GET/PUT/DELETE responses and resettable request/event state.
- [x] Exercise existing provider-resolution, calendar-list parsing, CalDAV connector, and ICS read-only seams against the fixture without real network access.
- [x] Run the focused provider/connector tests and verify the fixture never opens an external URL.

## Task 4: Lock down narrow-week lane and touch acceptance

**Files:** `src/agenda-panel/views/week-view.ts` or a small adjacent pure layout helper only if required, `tests/agenda-panel/views/week-view.test.ts`, `scripts/manual-test/viewport-matrix.mjs`, `docs/manual-test-runbook.md`.

- [x] Add failing boundary tests for 360/361/720/721px mapping to 1/3/3/7 lanes and for the shared day/week hour height.
- [x] Add regression assertions for two-line event-card content and existing touch tap/long-press move/resize seams.
- [x] Implement only the minimal helper or metadata needed to make the boundaries directly testable; keep existing CSS and pointer behavior unchanged when already correct.
- [x] Run the focused week-view tests, manual matrix dry-run, full test suite, build, and `git diff --check`.

## Completion Evidence

- [x] `npm test` passes with the new focused tests.
- [x] `npm run build` passes.
- [x] `git diff --check` is clean and `git status --short` shows only intentional changes plus the two preserved reports.
- [x] Final response separates implemented, test-confirmed, and not-run real-device/manual-cloud checks; no release or push is claimed.
