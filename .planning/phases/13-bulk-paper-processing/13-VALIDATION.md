---
phase: 13
slug: bulk-paper-processing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend) + Vitest (frontend) |
| **Config file** | `backend/pyproject.toml`, `frontend/vitest.config.js` |
| **Quick run command** | `cd backend && uv run pytest tests/test_batch.py -x -q` |
| **Full suite command** | `cd backend && uv run pytest tests/ -q && cd ../frontend && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_batch.py -x -q`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-xx-01 | 01 | 0/1 | BULK-01 | unit | `pytest tests/test_batch.py::test_notes_skip_existing -x` | Wave 0 | pending |
| 13-xx-02 | 01 | 0/1 | BULK-02 | unit | `pytest tests/test_batch.py::test_extract_keywords_all_types -x` | Wave 0 | pending |
| 13-xx-03 | 01 | 0/1 | BULK-03 | unit | `pytest tests/test_batch.py::test_batch_embeddings -x` | Wave 0 | pending |
| 13-xx-04 | 02 | 2 | BULK-08 | unit (frontend) | `vitest run src/hooks/useBatchProcessor.test.js` | Wave 0 | pending |
| 13-xx-05 | 02 | 2 | BULK-09 | unit (frontend) | `vitest run src/hooks/useBatchProcessor.test.js` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_batch.py` — stubs for BULK-01, BULK-02, BULK-03
- [ ] `frontend/src/hooks/useBatchProcessor.test.js` — stubs for BULK-08, BULK-09

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pause/resume mid-batch | BULK-07 | Async timing + UI interaction | Start batch, click pause, verify items stop, click resume, verify continuation |
| Per-item status updates in modal | BULK-04 | Visual rendering | Start batch, watch modal update per item |
| Confirmation dialog with cost estimate | BULK-05 | UI content verification | Select items, click action, verify dialog shows count + estimate |
| Cancel stops remaining items | BULK-06 | Async timing | Start batch, click cancel, verify remaining skipped |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
