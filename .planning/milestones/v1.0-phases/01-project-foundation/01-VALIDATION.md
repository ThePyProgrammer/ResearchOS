---
phase: 1
slug: project-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2025-07-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.0 + pytest-mock 3.14.0 |
| **Config file** | `backend/pyproject.toml` → `[tool.pytest.ini_options]` testpaths = ["tests"] |
| **Quick run command** | `cd backend && uv run pytest tests/test_projects_routes.py -x -q` |
| **Full suite command** | `cd backend && uv run pytest -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_projects_routes.py -x -q`
- **After every plan wave:** Run `cd backend && uv run pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | PROJ-01 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_create_project -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | PROJ-02 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_list_projects_by_library -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | PROJ-03 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_get_project_not_found -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | PROJ-04 | unit (service) | `uv run pytest tests/test_projects_routes.py::test_update_project_partial -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | PROJ-05 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_delete_project -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | PROJ-06 | unit (route) | `uv run pytest tests/test_projects_routes.py::test_project_notes -x` | ❌ W0 | ⬜ pending |
| TBD | 02 | 2 | NAV-01 | manual-only | N/A — React component verification | N/A | ⬜ pending |
| TBD | 02 | 2 | NAV-02 | manual-only | N/A — no frontend test infra | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_projects_routes.py` — stubs for PROJ-01 through PROJ-06 route contracts
- [ ] `backend/models/note.py` — add `project_id: Optional[str] = None` field
- [ ] `backend/services/note_service.py` — add `project_id` parameter to `list_notes` and `create_note`

*No new pytest fixtures needed — existing `client` fixture in `conftest.py` covers all route tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Projects section appears in sidebar | NAV-01 | React component — no frontend test infra | Open app, verify "Projects" section under Library in sidebar |
| /projects and /projects/:id routes render | NAV-02 | React routing — no frontend test infra | Navigate to /projects, click a project, verify no crash |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
