---
phase: 10
slug: latex-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | vite.config.js (`test` section) |
| **Quick run command** | `cd frontend && npm run test:run -- src/utils/latexSerializer.test.js src/utils/latexExport.test.js` |
| **Full suite command** | `cd frontend && npm run test:run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run test:run -- src/utils/latexSerializer.test.js src/utils/latexExport.test.js`
- **After every plan wave:** Run `cd frontend && npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | TEX-01 | unit | `npm run test:run -- src/utils/latexSerializer.test.js` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | TEX-03 | unit | `npm run test:run -- src/utils/latexSerializer.test.js` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | TEX-06 | unit | `npm run test:run -- src/utils/latexSerializer.test.js` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | TEX-02 | unit | `npm run test:run -- src/utils/latexExport.test.js` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | TEX-04 | unit | `npm run test:run -- src/utils/latexExport.test.js` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | TEX-05 | manual | N/A | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/utils/latexSerializer.test.js` — stubs for TEX-01, TEX-03, TEX-06 (HTML-to-LaTeX conversion)
- [ ] `frontend/src/utils/latexExport.test.js` — stubs for TEX-02, TEX-04 (ZIP packaging, BibTeX generation)

*Existing test infrastructure (Vitest) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preview panel reflects current note content | TEX-05 | Requires live tiptap editor instance | 1. Open a project note with citations 2. Toggle LaTeX preview panel 3. Verify .tex source appears 4. Edit note content 5. Verify preview updates within ~500ms |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
