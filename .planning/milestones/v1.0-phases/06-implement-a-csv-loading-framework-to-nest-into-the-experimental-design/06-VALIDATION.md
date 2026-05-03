---
phase: 6
slug: implement-a-csv-loading-framework-to-nest-into-the-experimental-design
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | `frontend/vite.config.js` (vitest config inline) |
| **Quick run command** | `cd frontend && npm run test:run -- --reporter=verbose ProjectDetail.csvimport` |
| **Full suite command** | `cd frontend && npm run test:run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test:run -- --reporter=verbose ProjectDetail.csvimport`
- **After every plan wave:** Run `cd frontend && npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-00-01 | 00 | 0 | CSV-01 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-02 | 00 | 0 | CSV-02 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-03 | 00 | 0 | CSV-03 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-04 | 00 | 0 | CSV-04 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-05 | 00 | 0 | CSV-05 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-06 | 00 | 0 | CSV-06 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-00-07 | 00 | 0 | CSV-07 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-01-01 | 01 | 1 | CSV-01..07 | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 | ⬜ pending |
| 06-02-01 | 02 | 2 | EXP-01..03 | smoke | manual — requires live backend | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/ProjectDetail.csvimport.test.jsx` — stubs for CSV-01 through CSV-07 (buildImportTree, autoGenerateName, detectCollision, bfsFlattenImportTree, autoDetectColumnRoles, merge-metrics, group-value duplication)
- [ ] `npm install papaparse` — CSV parsing library not yet in package.json

*Existing infrastructure: vitest configured, @testing-library/react installed, existing test files pass*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full CSV import flow (upload → map → preview → confirm) | EXP-01/02/03 | Requires live Supabase backend + file upload interaction | 1. Open project Experiments tab 2. Click Import CSV 3. Upload test.csv 4. Map columns 5. Preview tree 6. Confirm 7. Verify experiments in tree |
| Interactive preview editing (rename, exclude, rearrange) | CSV UX | DOM interaction + DnD in modal | 1. Upload CSV with 5+ rows 2. In preview step: rename a group, exclude a row, drag to rearrange 3. Confirm and verify changes applied |
| Collision warning and per-match resolution | CSV update | Requires pre-existing experiments with matching names | 1. Import CSV once 2. Re-import same CSV 3. Verify collision warnings appear 4. Choose Update/Create/Skip per match 5. Verify correct behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
